import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { agencyPythonPath, parseDeadlineIso, planAgencyWrites, TR_AGENCY_CURRENCY, type AgencyRunSummary } from '../tr-agency-calls';

const FX = path.join(__dirname, 'fixtures', 'tr-agency');
const load = (name: string): AgencyRunSummary =>
  JSON.parse(readFileSync(path.join(FX, name), 'utf-8')) as AgencyRunSummary;

describe('planAgencyWrites (NG-148)', () => {
  it('İSTKA: bir çağrı, ham kayıt tek kaynak anahtarıyla planlanır', () => {
    const plan = planAgencyWrites(load('run-istka.json'));
    expect(plan.callUpserts).toHaveLength(1);
    expect(plan.callUpserts[0]?.callIdentifier).toMatch(/^ISTKA:İSTKA\/2026\//);
    expect(plan.rawFetch?.source).toBe('tr-agency:istka');
    expect(plan.rawFetch?.key).toBe('https://istka.org.tr/acik-destek-programlari');
    expect(plan.rawFetch?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.alerts).toHaveLength(0);
  });

  it('UA: her çağrı benzersiz callIdentifier ile upsert edilir', () => {
    const plan = planAgencyWrites(load('run-ua.json'));
    const ids = plan.callUpserts.map((c) => c.callIdentifier);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('UA:'))).toBe(true);
  });

  it('bozuk sayfa: çağrı yazılmaz, AGENCY_SCHEMA_CHANGED uyarısı üretilir (koşu kırılmaz)', () => {
    const plan = planAgencyWrites(load('run-istka-broken.json'));
    expect(plan.callUpserts).toHaveLength(0);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.alerts[0]?.level).toBe('warn');
    expect(plan.alerts[0]?.dedupeKey).toBe('agency:schema-changed:istka');
    expect(plan.alerts[0]?.meta).toMatchObject({ kind: 'AGENCY_SCHEMA_CHANGED', source: 'istka' });
  });

  it('kaynak çekilemedi: hata uyarısı, ham kayıt yok', () => {
    const plan = planAgencyWrites({
      source: 'ua',
      fetchError: 'ua: HTTP 503',
      rows: 0,
      calls: [],
      systemAlert: null,
    });
    expect(plan.rawFetch).toBeNull();
    expect(plan.alerts).toEqual([
      expect.objectContaining({ level: 'error', dedupeKey: 'agency:fetch-failed:ua' }),
    ]);
  });

  it('idempotent: aynı girdi aynı planı üretir', () => {
    const run = load('run-ua.json');
    expect(planAgencyWrites(run)).toEqual(planAgencyWrites(run));
  });

  it('aynı callIdentifier iki kez gelirse tek upsert, son kayıt kazanır', () => {
    const run = load('run-istka.json');
    const dup = { ...run, calls: [...run.calls, { ...run.calls[0]!, title: 'SON' }] };
    const plan = planAgencyWrites(dup);
    expect(plan.callUpserts).toHaveLength(1);
    expect(plan.callUpserts[0]?.title).toBe('SON');
  });
});

describe('planAgencyWrites → Topic (NG-158)', () => {
  it('tarihli çağrı: UTC tarih + Europe/Istanbul, TL → kuruş, OPEN, sourceUrl', () => {
    const [topic] = planAgencyWrites(load('run-istka.json')).topicUpserts;
    expect(topic).toEqual({
      identifier: 'ISTKA:İSTKA/2026/YEG#1',
      callIdentifier: 'ISTKA:İSTKA/2026/YEG',
      title: 'Yaratıcı Ekonominin Güçlendirilmesi Mali Destek Programı',
      status: 'OPEN',
      deadlines: [{ stage: 1, at: '2026-12-04T20:59:00Z', tz: 'Europe/Istanbul' }],
      nextDeadlineAt: '2026-12-04T20:59:00Z',
      budgetPerProjectCents: 20_000_000 * 100,
      sourceUrl: 'https://istka.org.tr/acik-destek-programlari',
    });
  });

  it('para birimi TRY; bütçe TL kuruşu: 20.000.000 TL → 2.000.000.000 kuruş (döviz çevrimi yok)', () => {
    expect(TR_AGENCY_CURRENCY).toBe('TRY');
    const [topic] = planAgencyWrites(load('run-istka.json')).topicUpserts;
    expect(topic?.budgetPerProjectCents).toBe(20_000_000 * 100);
  });

  it('tarihsiz çağrı: deadlines [] ve nextDeadlineAt null, uyarı yok', () => {
    const plan = planAgencyWrites(load('run-ua.json'));
    expect(plan.topicUpserts.length).toBeGreaterThan(0);
    for (const t of plan.topicUpserts) {
      expect(t.identifier).toBe(`${t.callIdentifier}#1`);
      expect(t.deadlines).toEqual([]);
      expect(t.nextDeadlineAt).toBeNull();
      expect(t.status).toBe('OPEN');
    }
    expect(plan.alerts).toHaveLength(0);
  });

  it('ayrıştırılamayan son başvuru: çağrı ve topic yazılır, tarih boş, uyarı üretilir', () => {
    const run = load('run-istka.json');
    const bad: AgencyRunSummary = {
      ...run,
      calls: run.calls.map((c) => ({ ...c, deadlineAt: 'yarın öğlen' })),
    };
    const plan = planAgencyWrites(bad);
    expect(plan.callUpserts).toHaveLength(1);
    expect(plan.topicUpserts[0]).toMatchObject({ deadlines: [], nextDeadlineAt: null });
    expect(plan.alerts).toEqual([
      expect.objectContaining({ level: 'warn', dedupeKey: 'agency:unparsed:deadline:ISTKA:İSTKA/2026/YEG' }),
    ]);
  });

  it('geçersiz tutar: budgetPerProjectCents null, uyarı üretilir, koşu sürer', () => {
    const run = load('run-istka.json');
    const bad: AgencyRunSummary = {
      ...run,
      calls: run.calls.map((c) => ({ ...c, supportMaxTl: -5, supportMinTl: null })),
    };
    const plan = planAgencyWrites(bad);
    expect(plan.topicUpserts[0]?.budgetPerProjectCents).toBeNull();
    expect(plan.alerts).toEqual([expect.objectContaining({ dedupeKey: 'agency:unparsed:budget:ISTKA:İSTKA/2026/YEG' })]);
  });

  it('ikinci koşu aynı topic kimliklerini üretir (idempotent)', () => {
    const run = load('run-istka.json');
    const first = planAgencyWrites(run).topicUpserts.map((t) => t.identifier);
    const second = planAgencyWrites(run).topicUpserts.map((t) => t.identifier);
    expect(second).toEqual(first);
    expect(new Set(second).size).toBe(second.length);
  });
});

describe('parseDeadlineIso (NG-163)', () => {
  it('ofsetsiz girdi null döner: sunucunun saat dilimine göre kayar, kabul edilmez', () => {
    expect(parseDeadlineIso('2026-12-04T23:59:00')).toBeNull();
    expect(parseDeadlineIso('2026-12-04')).toBeNull();
  });

  it('Z ve ofsetli girdi UTC saniyeye çevrilir', () => {
    expect(parseDeadlineIso('2026-12-04T20:59:00Z')).toBe('2026-12-04T20:59:00Z');
    expect(parseDeadlineIso('2026-12-04T20:59:00+00:00')).toBe('2026-12-04T20:59:00Z');
    expect(parseDeadlineIso('2026-12-04T23:59:00+03:00')).toBe('2026-12-04T20:59:00Z');
    expect(parseDeadlineIso('2026-12-04T23:59:00+0300')).toBe('2026-12-04T20:59:00Z');
  });

  it('ofsetsiz tarih planda uyarı üretir, çağrı yazılır', () => {
    const run = load('run-istka.json');
    const plan = planAgencyWrites({ ...run, calls: run.calls.map((c) => ({ ...c, deadlineAt: '2026-12-04T23:59:00' })) });
    expect(plan.topicUpserts[0]).toMatchObject({ deadlines: [], nextDeadlineAt: null });
    expect(plan.alerts).toEqual([expect.objectContaining({ level: 'warn' })]);
  });
});

describe('agencyPythonPath (NG-158)', () => {
  it('mac/Linux: .venv/bin/python', () => {
    expect(agencyPythonPath('/w/agencies', 'darwin')).toBe(path.join('/w/agencies', '.venv', 'bin', 'python'));
    expect(agencyPythonPath('/w/agencies', 'linux')).toBe(path.join('/w/agencies', '.venv', 'bin', 'python'));
  });

  it('Windows: .venv/Scripts/python.exe', () => {
    expect(agencyPythonPath('C:\\w\\agencies', 'win32')).toBe(
      path.join('C:\\w\\agencies', '.venv', 'Scripts', 'python.exe'),
    );
  });
});
