/**
 * TR kalkınma ajansı + Ulusal Ajans çağrı toplayıcıları → DB (NG-148, M18-F6b).
 *
 * `workers/agencies` (Python) çekimi ve ayrıştırmayı yapar; bu modül çıktıyı uygulama
 * DB'sine yazar:
 *   - ham yanıt → `RawFetch` (değişmediyse yazılmaz, hash ile),
 *   - normalize çağrı → `Call` (upsert, anahtar `callIdentifier`),
 *   - yapı bozulması → `SystemAlert` (`AGENCY_SCHEMA_CHANGED`), koşu kırılmaz.
 *
 *   - her çağrı için bir `Topic` (NG-158): `identifier` = `<callIdentifier>#1`, son
 *     başvuru tarihleri `deadlines` (UTC + `Europe/Istanbul`), `nextDeadlineAt`,
 *     `budgetPerProjectCents` (TL → kuruş, azami destek) ve `sourceUrl`.
 *
 * Yazım iki aşamaya ayrılmıştır: `planAgencyWrites` saf fonksiyondur (DB yok, birim
 * test edilir); `persistAgencyRun` planı Prisma'ya uygular. Şemaya dokunulmaz.
 *
 * Para birimi notu: `Topic`'te para birimi alanı yok; `budgetPerProjectCents` TL
 * kuruşudur (bu modülün kapsamı yalnız TR ajansları). Döviz çevrimi yapılmaz.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAlert } from '@/lib/observability/system-alert';

const execFileAsync = promisify(execFile);

/** Programme satırı: tüm TR ajans çağrıları tek programme altında. */
export const TR_AGENCY_PROGRAMME_ID = 'TRAGENCY';
const TR_AGENCY_PROGRAMME_NAME = 'Türk kalkınma ajansları ve Ulusal Ajans';
const TR_AGENCY_SOURCE_KEY = 'tr-agency';

/** RawFetch.source ön eki: `tr-agency:istka` gibi. */
const RAW_SOURCE_PREFIX = 'tr-agency:';
const ALERT_SOURCE = 'tr_agency_calls';

/** Python `normalize.to_call` tarihleri bu saat diliminde üretir (UTC'ye çevrilmiş). */
export const TR_AGENCY_TZ = 'Europe/Istanbul';
/** Call.currency: TR ajans çağrıları TL'dir (NG-158 lider kararı; şema değişmedi). */
export const TR_AGENCY_CURRENCY = 'TRY';
/** Her TR ajans çağrısı tek topic taşır; kimlik: `<callIdentifier>#1`. */
const TOPIC_SUFFIX = '#1';

/** Topic.deadlines öğesi (`[{stage, at, tz}]`); `at` UTC ISO-8601. */
export interface TopicDeadline {
  stage: number;
  at: string;
  tz: string;
}

/** Python `normalize.to_call` çıktısının uygulama tarafındaki şekli. */
export interface AgencyCallRow {
  callIdentifier: string;
  title: string;
  sourceUrl: string | null;
  deadlineAt: string | null;
  deadlineTz: string | null;
  supportMinTl: number | null;
  supportMaxTl: number | null;
  supportRatePct: number | null;
}

/** `python -m agencies --source <key> --with-body` çıktısı. */
export interface AgencyRunSummary {
  source: string;
  fetchError?: string;
  rawFetch?: {
    url: string;
    finalUrl: string;
    httpStatus: number;
    fetchedAt: string;
    sha256: string;
    bytes: number;
    body: string;
  };
  rows: number;
  calls: AgencyCallRow[];
  systemAlert: { kind: string; source: string; message: string; rawSha256: string } | null;
}

export interface RawFetchWrite {
  source: string;
  key: string;
  hash: string;
  payload: { body: string; finalUrl: string; httpStatus: number; bytes: number };
}

/** Bir çağrının tek topic'i. Tarihsiz çağrıda `deadlines: []`, `nextDeadlineAt: null`. */
export interface TopicWrite {
  identifier: string;
  callIdentifier: string;
  title: string;
  status: 'OPEN';
  deadlines: TopicDeadline[];
  nextDeadlineAt: string | null;
  /** Azami destek (TL) × 100; tutar yoksa null. Sayısal kalır: BigInt dönüşümü persist'te. */
  budgetPerProjectCents: number | null;
  sourceUrl: string | null;
}

export interface AgencyWritePlan {
  rawFetch: RawFetchWrite | null;
  callUpserts: Array<{ callIdentifier: string; title: string; url: string | null }>;
  topicUpserts: TopicWrite[];
  alerts: Array<{
    level: 'warn' | 'error';
    message: string;
    meta: Record<string, unknown>;
    dedupeKey: string;
  }>;
}

/**
 * Saf plan: hangi ham kayıt, hangi çağrı upsert'leri, hangi uyarılar.
 * Aynı girdi her zaman aynı planı üretir (idempotentlik bu fonksiyonun ön koşulu).
 */
export function planAgencyWrites(run: AgencyRunSummary): AgencyWritePlan {
  const alerts: AgencyWritePlan['alerts'] = [];

  if (run.fetchError) {
    alerts.push({
      level: 'error',
      message: `${run.source}: kaynak çekilemedi (${run.fetchError})`,
      meta: { source: run.source },
      dedupeKey: `agency:fetch-failed:${run.source}`,
    });
  }

  if (run.systemAlert) {
    alerts.push({
      level: 'warn',
      message: `${run.source}: sayfa yapısı değişmiş olabilir; çağrılar ayrıştırılamadı`,
      meta: { kind: run.systemAlert.kind, source: run.source, rawSha256: run.systemAlert.rawSha256 },
      dedupeKey: `agency:schema-changed:${run.source}`,
    });
  }

  const rawFetch: RawFetchWrite | null = run.rawFetch
    ? {
        source: `${RAW_SOURCE_PREFIX}${run.source}`,
        key: run.rawFetch.url,
        hash: run.rawFetch.sha256,
        payload: {
          body: run.rawFetch.body,
          finalUrl: run.rawFetch.finalUrl,
          httpStatus: run.rawFetch.httpStatus,
          bytes: run.rawFetch.bytes,
        },
      }
    : null;

  // Python tarafı bir koşuda aynı callIdentifier'ı zaten tekilleştirir; yine de son
  // kayıt kazanır şeklinde tekilleştiriyoruz ki upsert sayısı girdi sırasına bağlı olmasın.
  const byId = new Map<string, AgencyCallRow>();
  for (const c of run.calls) byId.set(c.callIdentifier, c);

  const callUpserts = Array.from(byId.values()).map((c) => ({
    callIdentifier: c.callIdentifier,
    title: c.title,
    url: c.sourceUrl,
  }));

  const topicUpserts: TopicWrite[] = [];
  for (const c of byId.values()) {
    const deadlineIso = parseDeadlineIso(c.deadlineAt);
    if (c.deadlineAt && deadlineIso === null) {
      alerts.push(unparsedAlert(run.source, c.callIdentifier, 'deadline', 'son başvuru tarihi', c.deadlineAt));
    }
    const budgetTl = c.supportMaxTl ?? c.supportMinTl;
    if (budgetTl !== null && budgetTl !== undefined && !(Number.isSafeInteger(budgetTl) && budgetTl >= 0)) {
      alerts.push(unparsedAlert(run.source, c.callIdentifier, 'budget', 'destek tutarı', String(budgetTl)));
    }
    // Topic.budgetPerProjectCents = TL × 100 (kuruş), para birimi TRY. Döviz çevrimi yok.
    const budgetPerProjectCents =
      budgetTl !== null && budgetTl !== undefined && Number.isSafeInteger(budgetTl) && budgetTl >= 0
        ? budgetTl * 100
        : null;
    topicUpserts.push({
      identifier: `${c.callIdentifier}${TOPIC_SUFFIX}`,
      callIdentifier: c.callIdentifier,
      title: c.title,
      status: 'OPEN',
      deadlines: deadlineIso ? [{ stage: 1, at: deadlineIso, tz: TR_AGENCY_TZ }] : [],
      nextDeadlineAt: deadlineIso,
      budgetPerProjectCents,
      sourceUrl: c.sourceUrl,
    });
  }

  return { rawFetch, callUpserts, topicUpserts, alerts };
}

/** UTC ISO-8601 (saniye) ya da null. Boş girdi "tarihsiz" demektir; burada null döner. */
function parseDeadlineIso(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}

function unparsedAlert(source: string, callIdentifier: string, field: string, what: string, raw: string) {
  return {
    level: 'warn' as const,
    message: `${source}: ${what} ayrıştırılamadı (${callIdentifier}); çağrı yazıldı, alan boş bırakıldı`,
    meta: { source, callIdentifier, field, raw },
    dedupeKey: `agency:unparsed:${field}:${callIdentifier}`,
  };
}

export interface PersistResult {
  rawFetchWritten: boolean;
  callsCreated: number;
  callsUpdated: number;
  topicsCreated: number;
  topicsUpdated: number;
  alertsRecorded: number;
}

/** Planı DB'ye uygular. Her adım tekrar koşmaya güvenlidir. */
export async function persistAgencyRun(run: AgencyRunSummary): Promise<PersistResult> {
  const plan = planAgencyWrites(run);
  const result: PersistResult = {
    rawFetchWritten: false,
    callsCreated: 0,
    callsUpdated: 0,
    topicsCreated: 0,
    topicsUpdated: 0,
    alertsRecorded: 0,
  };

  if (plan.rawFetch) {
    // Aynı (kaynak, URL, içerik hash) daha önce yazıldıysa yeni satır yazılmaz. "Son satırla
    // karşılaştırma" yerine tam eşleşme kullanılır: geçerli ve bozuk yanıt aynı URL'den sırayla
    // gelirse (SEDIA'daki yinelenen RawFetch hatasının aynısı) her koşumda satır şişmez.
    const seen = await prisma.rawFetch.findFirst({
      where: { source: plan.rawFetch.source, key: plan.rawFetch.key, hash: plan.rawFetch.hash },
      select: { id: true },
    });
    if (!seen) {
      await prisma.rawFetch.create({
        data: {
          source: plan.rawFetch.source,
          key: plan.rawFetch.key,
          hash: plan.rawFetch.hash,
          payload: plan.rawFetch.payload,
        },
      });
      result.rawFetchWritten = true;
    }
  }

  await prisma.programme.upsert({
    where: { id: TR_AGENCY_PROGRAMME_ID },
    update: {},
    create: {
      id: TR_AGENCY_PROGRAMME_ID,
      name: TR_AGENCY_PROGRAMME_NAME,
      sourceKey: TR_AGENCY_SOURCE_KEY,
    },
  });

  for (const c of plan.callUpserts) {
    const existed = await prisma.call.findUnique({
      where: { callIdentifier: c.callIdentifier },
      select: { id: true },
    });
    const call = await prisma.call.upsert({
      where: { callIdentifier: c.callIdentifier },
      update: { title: c.title, currency: TR_AGENCY_CURRENCY, ...(c.url ? { url: c.url } : {}) },
      create: {
        callIdentifier: c.callIdentifier,
        title: c.title,
        currency: TR_AGENCY_CURRENCY,
        programmeId: TR_AGENCY_PROGRAMME_ID,
        ...(c.url ? { url: c.url } : {}),
      },
      select: { id: true },
    });
    if (existed) result.callsUpdated += 1;
    else result.callsCreated += 1;

    // Topic: identifier unique → upsert idempotent. Aynı koşu iki kez çalışırsa satır çoğalmaz.
    const t = plan.topicUpserts.find((x) => x.callIdentifier === c.callIdentifier);
    if (!t) continue;
    const topicExisted = await prisma.topic.findUnique({
      where: { identifier: t.identifier },
      select: { id: true },
    });
    const topicFields = {
      title: t.title,
      status: t.status,
      deadlines: t.deadlines as unknown as Prisma.InputJsonValue,
      nextDeadlineAt: t.nextDeadlineAt ? new Date(t.nextDeadlineAt) : null,
      budgetPerProjectCents: t.budgetPerProjectCents === null ? null : BigInt(t.budgetPerProjectCents),
      sourceUrl: t.sourceUrl,
    };
    await prisma.topic.upsert({
      where: { identifier: t.identifier },
      update: topicFields,
      create: { identifier: t.identifier, callId: call.id, ...topicFields },
    });
    if (topicExisted) result.topicsUpdated += 1;
    else result.topicsCreated += 1;
  }

  for (const a of plan.alerts) {
    const rec = await recordAlert({
      level: a.level,
      source: ALERT_SOURCE,
      message: a.message,
      meta: a.meta,
      dedupeKey: a.dedupeKey,
    });
    if (rec.status === 'recorded') result.alertsRecorded += 1;
  }

  return result;
}

/**
 * workers/agencies venv'indeki Python yolu. Windows'ta `Scripts\python.exe`,
 * diğerlerinde `bin/python`. `platform` parametresi test içindir.
 */
export function agencyPythonPath(workdir: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? path.join(workdir, '.venv', 'Scripts', 'python.exe')
    : path.join(workdir, '.venv', 'bin', 'python');
}

/** Ajans toplayıcısını Python'da çalıştırır ve özeti döndürür (ağ burada, DB'de değil). */
export async function collectAgencySource(
  sourceKey: string,
  opts: { workdir: string; pythonBin?: string; timeoutMs?: number } = { workdir: '' },
): Promise<AgencyRunSummary> {
  const python = opts.pythonBin ?? agencyPythonPath(opts.workdir);
  try {
    const { stdout } = await execFileAsync(
      python,
      ['-m', 'agencies', '--source', sourceKey, '--with-body'],
      { cwd: opts.workdir, timeout: opts.timeoutMs ?? 180_000, maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as AgencyRunSummary;
  } catch (error) {
    // Python çıkış kodu 1 (ağ hatası) durumunda da stdout JSON'u gelir.
    const stdout = (error as { stdout?: string }).stdout;
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout) as { source: string; fetchError?: string };
        return { source: parsed.source, fetchError: parsed.fetchError, rows: 0, calls: [], systemAlert: null };
      } catch {
        /* aşağıya düşer */
      }
    }
    return {
      source: sourceKey,
      fetchError: `toplayıcı çalışmadı: ${(error as Error).name}`,
      rows: 0,
      calls: [],
      systemAlert: null,
    };
  }
}
