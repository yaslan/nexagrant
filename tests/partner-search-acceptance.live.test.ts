import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PARTNER_SEARCH_INGESTION_LOCK, holdTestDbLock } from './helpers/test-db-lock';
import { requireId } from './helpers/teardown-guard';

/**
 * FO-66 (PS-K7) — the five acceptance criteria of M1 Partner Search, against real
 * Postgres. The portal is the only fake (`fetchImpl` answers from the masked fixture);
 * the ingestor, Prisma, RawFetch, SystemAlert and the readers the app serves from
 * (`readPartnerSignal`, `readAnnouncementsForExport`) are the real ones.
 *
 *   1. an open topic's announcements are visible within 24 h
 *   2. a withdrawn announcement drops within 48 h (two scans)
 *   3. an ingestion error raises an admin alarm
 *   4. no person-profile data is stored (SQL over the stored rows and the columns)
 *   5. the export carries the source note
 *
 * The flag module is mocked ON: the flag row is one global PlatformSetting that
 * partner-search-ingest.live toggles. Rows use their own ids (FO66-*, 66xxxxxx),
 * so no other file's announcement is moved or withdrawn; the ingestion lock keeps the
 * run count and the `partner_search_adapter` alerts of the two files apart.
 *
 * Runs only on an isolated database (the shared `fabrika` is refused outside CI).
 * Set FO66_EVIDENCE=1 to print the SQL results quoted in docs/agent-results/FO-66-fe-fb.md.
 */
vi.mock('@/modules/m1/server/partner-search/flag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/m1/server/partner-search/flag')>()),
  isPartnerSearchIngestionEnabled: async () => true,
}));

const { prisma, withTenant } = await import('@/lib/db');
const { PartnerSearchClient, PARTNER_SEARCH_SOURCE } = await import('@/lib/adapters/partner-search');
const { runPartnerSearchIngestion } = await import('@/modules/m1/server/partner-search/ingestor');
const { readPartnerSignal, readAnnouncementsForExport, toAnnouncementDto, toExportCsv, toExportJson } = await import(
  '@/modules/m1/server/partner-search/api'
);

const dbName = new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname.replace('/', '');
const HAS_DB = Boolean(process.env.DATABASE_URL);
const SHARED = dbName === 'fabrika' && process.env.CI !== 'true';
const RUN = HAS_DB && !SHARED;
const EVIDENCE = process.env.FO66_EVIDENCE === '1';

const CALL = 'FO66-ACC-CALL';
const TOPIC_NEW = 'FO66-ACC-TOPIC-NEW'; // created by K1, scanned by the INCREMENTAL run
const TOPIC_LATE = 'FO66-ACC-TOPIC-LATE'; // created by K1, queue down: waits for the 03:00 FULL scan
const TOPIC_GONE = 'FO66-ACC-TOPIC-GONE'; // withdrawal
const TOPIC_ERR = 'FO66-ACC-TOPIC-ERR'; // drift / 403
const TOPICS = [TOPIC_NEW, TOPIC_LATE, TOPIC_GONE, TOPIC_ERR];
const CCM2: Record<string, string> = {
  [TOPIC_NEW]: '966001',
  [TOPIC_LATE]: '966002',
  [TOPIC_GONE]: '966003',
  [TOPIC_ERR]: '966004',
};
const TOPIC_PREFIX: Record<string, string> = { [TOPIC_NEW]: '661', [TOPIC_LATE]: '662', [TOPIC_GONE]: '663', [TOPIC_ERR]: '664' };
const PERSON_NAME = '<masked-person>';
const PERSON_ECAS = 'ECAS-TEST-0000';

type FixtureRow = { id: string | number; pic: string | null; type: string; organisationName: string; ecasId?: string };
type Fixture = { topicOrganizations: FixtureRow[] } & Record<string, unknown>;

const FIXTURE: Fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tests/fixtures/partner-search/topicOrganisations.sample.json'), 'utf8')
);

/**
 * The fixture under one topic's own ids and PICs: `externalId` is globally unique and
 * the unmatched-PIC queue is keyed by PIC, so the fixture's own values would collide
 * with partner-search-ingest.live.
 */
function fixtureFor(topic: string): Fixture {
  const copy = structuredClone(FIXTURE);
  const prefix = TOPIC_PREFIX[topic] ?? '669';
  for (const row of copy.topicOrganizations) {
    row.id = `${prefix}${String(row.id)}`;
    if (row.pic) row.pic = `${prefix}${row.pic.slice(3)}`;
  }
  return copy;
}

/** Every PIC the four topic fixtures carry, for the unmatched-queue cleanup. */
const MATCH_KEYS = TOPICS.flatMap((t) =>
  fixtureFor(t)
    .topicOrganizations.filter((r) => r.pic)
    .map((r) => `pic:${r.pic}`)
);

/** The SEDIA listing (topic → ccm2Id) and topicOrganisations, per topic. */
function portal(bodyFor: (topic: string) => unknown, status = 200) {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('api.tech.ec.europa.eu')) {
      return new Response(
        JSON.stringify({
          totalResults: TOPICS.length,
          results: TOPICS.map((t) => ({ metadata: { identifier: [t], ccm2Id: [CCM2[t]] } })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (status !== 200) return new Response('refused', { status });
    const topic = Object.keys(CCM2).find((t) => u.includes(CCM2[t] ?? '-'));
    if (!topic) return new Response(JSON.stringify({ topicOrganizations: [] }), { status: 200 });
    return new Response(JSON.stringify(bodyFor(topic)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

const noSleep = async () => {};
const client = (f: typeof fetch) => new PartnerSearchClient({ fetchImpl: f, sleep: noSleep, minIntervalMs: 0 });

let tenantId: string | undefined;
let releaseLock: (() => Promise<void>) | undefined;

const signal = (topic: string) => withTenant(requireId(tenantId, 'tenantId'), (tx) => readPartnerSignal(tx, topic));

async function createTopic(identifier: string, fetchedAt: Date) {
  const call = await prisma.call.findUniqueOrThrow({ where: { callIdentifier: CALL }, select: { id: true } });
  await prisma.topic.create({
    data: {
      identifier,
      callId: call.id,
      title: `FO66 ${identifier}`,
      status: 'OPEN',
      deadlines: [],
      eligibility: {},
      keywords: [],
      fetchedAt, // when K1 wrote it
    },
  });
}

async function cleanup() {
  await prisma.partnerSearchTopicStat.deleteMany({ where: { topicIdentifier: { in: TOPICS } } });
  await prisma.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: { in: TOPICS } } });
  await prisma.rawFetch.deleteMany({ where: { source: 'partner_search', key: { in: TOPICS } } });
  await prisma.unmatchedOrganization.deleteMany({ where: { matchKey: { in: MATCH_KEYS } } });
  await prisma.topic.deleteMany({ where: { identifier: { in: TOPICS } } });
  await prisma.call.deleteMany({ where: { callIdentifier: CALL } });
}

function evidence(label: string, value: unknown) {
  if (EVIDENCE) console.log(`[FO66-EVIDENCE] ${label}: ${JSON.stringify(value)}`);
}

const HOUR = 3_600_000;

describe.skipIf(!RUN)('FO-66 Partner Search acceptance (live database)', () => {
  beforeAll(async () => {
    releaseLock = await holdTestDbLock(process.env.DATABASE_URL ?? '', PARTNER_SEARCH_INGESTION_LOCK);
    await cleanup();
    await prisma.programme.upsert({
      where: { id: 'HE' },
      update: {},
      create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' },
    });
    await prisma.call.create({ data: { callIdentifier: CALL, title: 'FO66 acceptance call', programmeId: 'HE' } });
    const tenant = await prisma.tenant.create({
      data: { name: 'FO66 acceptance', slug: `fo66-acc-${Date.now().toString(36)}`, country: 'TR' },
      select: { id: true },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    try {
      await cleanup();
      // Alerts of this source fold into one open row per dedupe key; the other ingestion
      // file deletes them the same way, under the same lock.
      await prisma.systemAlert.deleteMany({ where: { source: 'partner_search_adapter' } });
      if (tenantId) await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
    } finally {
      await releaseLock?.();
    }
  });

  describe('criterion 1: an open topic is visible within 24 h', () => {
    it('K1 creates a topic at T; the INCREMENTAL run it queues makes the announcements visible minutes later', async () => {
      const t = new Date('2026-10-20T07:00:00.000Z'); // k1-daily-calls
      await createTopic(TOPIC_NEW, t);
      expect((await signal(TOPIC_NEW)).total).toBe(0);

      const runAt = new Date(t.getTime() + 5 * 60_000);
      const outcome = await runPartnerSearchIngestion({
        trigger: 'INCREMENTAL',
        topicIdentifiers: [TOPIC_NEW],
        client: client(portal(fixtureFor)),
        now: () => runAt,
      });
      expect(outcome.kind === 'done' && outcome.status).toBe('SUCCESS');

      const s = await signal(TOPIC_NEW);
      expect(s.total).toBe(3); // three organisations; the person row is not an announcement
      const rows = await prisma.partnerSearchAnnouncement.findMany({
        where: { topicIdentifier: TOPIC_NEW },
        select: { externalId: true, lastSeenAt: true },
      });
      const topic = await prisma.topic.findUniqueOrThrow({ where: { identifier: TOPIC_NEW } });
      const lagHours = Math.max(...rows.map((r) => r.lastSeenAt.getTime() - topic.fetchedAt.getTime())) / HOUR;
      expect(lagHours).toBeLessThanOrEqual(24);
      evidence('C1 incremental', { signalTotal: s.total, lagHours, run: outcome.kind === 'done' ? outcome.summary : null });
    });

    it('when the queue was down, the next 03:00 FULL scan picks the topic up, still within 24 h', async () => {
      const t = new Date('2026-10-20T07:00:00.000Z');
      await createTopic(TOPIC_LATE, t);

      const nextTick = new Date('2026-10-21T03:00:00.000Z'); // cron 0 3 * * *
      const outcome = await runPartnerSearchIngestion({
        trigger: 'FULL',
        client: client(portal(fixtureFor)),
        now: () => nextTick,
      });
      expect(outcome.kind).toBe('done');
      // Other OPEN topics of this database are not in the fake SEDIA listing: they are
      // skipped with an error line (PARTIAL), and none of them is written.
      expect((await signal(TOPIC_LATE)).total).toBe(3);
      const lagHours = (nextTick.getTime() - t.getTime()) / HOUR;
      expect(lagHours).toBeLessThanOrEqual(24);
      evidence('C1 full', { status: outcome.kind === 'done' ? outcome.status : null, lagHours, total: 3 });
    });
  });

  describe('criterion 2: a withdrawn announcement drops within 48 h', () => {
    it('absent on two daily scans → withdrawn on the second; one transient miss does not hide it', async () => {
      await createTopic(TOPIC_GONE, new Date('2026-10-19T07:00:00.000Z'));
      const full = fixtureFor(TOPIC_GONE);
      const smaller = structuredClone(full);
      const gone = smaller.topicOrganizations.shift();
      const goneId = String(gone?.id);
      const scan = (at: Date, body: Fixture) =>
        runPartnerSearchIngestion({
          trigger: 'MANUAL',
          topicIdentifiers: [TOPIC_GONE],
          client: client(portal(() => body)),
          now: () => at,
        });

      const day0 = new Date('2026-10-20T03:00:00.000Z');
      await scan(day0, full);
      expect((await signal(TOPIC_GONE)).total).toBe(3);

      // The owner withdraws it on the portal right after the day-0 scan (worst case).
      const day1 = new Date('2026-10-21T03:00:00.000Z');
      await scan(day1, smaller);
      let row = await prisma.partnerSearchAnnouncement.findUniqueOrThrow({ where: { externalId: goneId } });
      expect(row.missedScans).toBe(1);
      expect(row.withdrawnAt).toBeNull();
      expect((await signal(TOPIC_GONE)).total).toBe(3); // one miss may be a portal hiccup

      // A same-day re-run (K1 incremental, retry) is not a second miss.
      await scan(new Date('2026-10-21T09:30:00.000Z'), smaller);
      row = await prisma.partnerSearchAnnouncement.findUniqueOrThrow({ where: { externalId: goneId } });
      expect(row.missedScans).toBe(1);
      expect(row.withdrawnAt).toBeNull();

      const day2 = new Date('2026-10-22T03:00:00.000Z');
      await scan(day2, smaller);
      row = await prisma.partnerSearchAnnouncement.findUniqueOrThrow({ where: { externalId: goneId } });
      expect(row.missedScans).toBe(2);
      expect(row.withdrawnAt?.toISOString()).toBe(day2.toISOString());
      const hours = ((row.withdrawnAt?.getTime() ?? Infinity) - row.lastSeenAt.getTime()) / HOUR;
      expect(hours).toBeLessThanOrEqual(48);
      expect((await signal(TOPIC_GONE)).total).toBe(2);

      // The export (and every list) leaves it out too.
      const exported = await withTenant(requireId(tenantId, 'tenantId'), (tx) =>
        readAnnouncementsForExport(tx, { topic: TOPIC_GONE })
      );
      expect(exported.rows.map((r) => r.id)).not.toContain(row.id);
      evidence('C2', {
        lastSeenAt: row.lastSeenAt.toISOString(),
        withdrawnAt: row.withdrawnAt?.toISOString(),
        hours,
        signalAfter: 2,
      });
    });
  });

  describe('criterion 3: an ingestion error raises an admin alarm', () => {
    it('schema drift: run FAILED, an open SystemAlert, nothing written', async () => {
      await createTopic(TOPIC_ERR, new Date('2026-10-19T07:00:00.000Z'));
      const broken = fixtureFor(TOPIC_ERR);
      const first = broken.topicOrganizations[0] as Record<string, unknown>;
      first.requestDate = '19/10/2026';

      const outcome = await runPartnerSearchIngestion({
        trigger: 'MANUAL',
        topicIdentifiers: [TOPIC_ERR],
        client: client(portal(() => broken)),
      });
      expect(outcome.kind).toBe('done');
      if (outcome.kind !== 'done') return;
      expect(outcome.status).toBe('FAILED');
      expect(await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC_ERR } })).toBe(0);

      const run = await prisma.partnerSearchIngestionRun.findUniqueOrThrow({ where: { id: outcome.runId } });
      expect(run.status).toBe('FAILED');
      // What /admin/alerts lists: every open SystemAlert, newest first.
      const alert = await prisma.systemAlert.findFirst({
        where: { source: `${PARTNER_SEARCH_SOURCE}_adapter`, resolvedAt: null, message: { contains: 'API schema change' } },
      });
      expect(alert).not.toBeNull();
      evidence('C3 drift', { runStatus: run.status, alert: { source: alert?.source, level: alert?.level, message: alert?.message } });
    });

    it('portal refuses (403): run FAILED, an open error-level SystemAlert', async () => {
      const outcome = await runPartnerSearchIngestion({
        trigger: 'MANUAL',
        topicIdentifiers: [TOPIC_ERR],
        client: client(portal(() => ({}), 403)),
      });
      expect(outcome.kind === 'done' && outcome.status).toBe('FAILED');
      const alert = await prisma.systemAlert.findFirst({
        where: { source: `${PARTNER_SEARCH_SOURCE}_adapter`, resolvedAt: null, message: { contains: 'HTTP 403/429' } },
      });
      expect(alert?.level).toBe('error');
      evidence('C3 blocked', { source: alert?.source, level: alert?.level, message: alert?.message });
    });

    /**
     * FO-66 BUG-1 (product code, not fixed here): the admin console's "Open alerts"
     * figure (src/app/[locale]/admin/partner-search/page.tsx) counts
     * `source = PARTNER_SEARCH_SOURCE` ('partner_search'), but the ingestor's alerts go
     * through createAdapterAlert, which stores `'partner_search_adapter'`. The alarm is
     * on /admin/alerts; the console figure stays 0. `it.fails` pins that: when the
     * page query is fixed, this goes red — turn it into a plain `it`.
     */
    it.fails('BUG-1: the console figure counts the open ingestion alerts', async () => {
      const consoleFigure = await prisma.systemAlert.count({ where: { source: PARTNER_SEARCH_SOURCE, resolvedAt: null } });
      const open = await prisma.systemAlert.count({ where: { source: `${PARTNER_SEARCH_SOURCE}_adapter`, resolvedAt: null } });
      evidence('C3 BUG-1', { consoleFigure, openIngestionAlerts: open });
      expect(open).toBeGreaterThan(0);
      expect(consoleFigure).toBe(open);
    });
  });

  describe('criterion 4: no person-profile data is stored (SQL)', () => {
    it('no column can hold it', async () => {
      const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name IN ('PartnerSearchAnnouncement', 'PartnerSearchTopicStat', 'PartnerSearchIngestionRun',
                              'UnmatchedOrganization', 'PartnerProfileSnapshot')
           AND column_name ~* '(ecas|person|first_?name|last_?name|surname|email|phone)'
         ORDER BY 1, 2`;
      // The only matches are counts of person rows (per run, per topic): numbers, no person in them.
      expect(cols).toEqual([
        { table_name: 'PartnerSearchIngestionRun', column_name: 'personAnnouncementCount' },
        { table_name: 'PartnerSearchTopicStat', column_name: 'personAnnouncementCount' },
      ]);
      const countTypes = await prisma.$queryRaw<{ data_type: string }[]>`
        SELECT DISTINCT data_type FROM information_schema.columns
         WHERE table_schema = current_schema() AND column_name = 'personAnnouncementCount'`;
      expect(countTypes).toEqual([{ data_type: 'integer' }]);
      const types = await prisma.$queryRaw<{ v: string }[]>`
        SELECT unnest(enum_range(NULL::"PartnerSearchAnnouncementType"))::text AS v`;
      expect(types.map((t) => t.v).sort()).toEqual(['EXPERTISE_OFFER', 'EXPERTISE_REQUEST']);
      evidence('C4 columns', cols);
      evidence('C4 announcement types', types.map((t) => t.v));
    });

    it('no stored row carries the person: announcements, raw payloads, unmatched queue, topic stat', async () => {
      // The fixture's person row was in every scan above (ecasId + name).
      const pattern = `(ecas|${PERSON_ECAS}|${PERSON_NAME}|"PERSON")`;
      const [hits] = await prisma.$queryRaw<
        { announcements: bigint; raw: bigint; unmatched: bigint; snapshots: bigint }[]
      >`
        SELECT
          (SELECT count(*) FROM "PartnerSearchAnnouncement" t WHERE row_to_json(t)::text ~* ${pattern}) AS announcements,
          (SELECT count(*) FROM "RawFetch" t WHERE t."source" = 'partner_search' AND row_to_json(t)::text ~* ${pattern}) AS raw,
          (SELECT count(*) FROM "UnmatchedOrganization" t WHERE row_to_json(t)::text ~* ${pattern}) AS unmatched,
          (SELECT count(*) FROM "PartnerProfileSnapshot" t WHERE row_to_json(t)::text ~* ${pattern}) AS snapshots`;
      const counts = Object.fromEntries(Object.entries(hits ?? {}).map(([k, v]) => [k, Number(v)]));
      expect(counts).toEqual({ announcements: 0, raw: 0, unmatched: 0, snapshots: 0 });

      // The scans above did store things, so the zero is not an empty table.
      const stored = await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: { in: TOPICS } } });
      expect(stored).toBeGreaterThanOrEqual(9);
      const rawRows = await prisma.rawFetch.count({ where: { source: 'partner_search', key: { in: TOPICS } } });
      expect(rawRows).toBeGreaterThanOrEqual(3);

      const stats = await prisma.$queryRaw<{ topicIdentifier: string; personAnnouncementCount: number }[]>`
        SELECT "topicIdentifier", "personAnnouncementCount" FROM "PartnerSearchTopicStat"
         WHERE "topicIdentifier" = ANY(${TOPICS}) ORDER BY 1`;
      expect(stats.map((s) => s.personAnnouncementCount)).toEqual(stats.map(() => 1));
      expect(stats.length).toBeGreaterThanOrEqual(3);
      evidence('C4 rows', { pattern, counts, storedAnnouncements: stored, rawRows, stats });
    });
  });

  describe('criterion 5: the export carries the source note', () => {
    it('CSV and JSON of ingested rows open with the portal attribution and CC BY 4.0', async () => {
      const { rows, truncated } = await withTenant(requireId(tenantId, 'tenantId'), (tx) =>
        readAnnouncementsForExport(tx, { topic: TOPIC_NEW })
      );
      expect(rows).toHaveLength(3);
      const dtos = rows.map(toAnnouncementDto);

      // "fetched" is the newest lastSeenAt: the 03:00 FULL scan of criterion 1 saw these rows again.
      const fetched = '2026-10-21T03:00:00.000Z';
      expect(dtos.map((d) => d.lastSeenAt).sort().at(-1)).toBe(fetched);

      const csv = toExportCsv(dtos, truncated);
      const [line1, line2, header] = csv.split('\r\n');
      // Each `#` line is one CSV cell; the first is quoted because it holds a comma.
      expect(line1).toBe(
        `"# Source: EU Funding & Tenders Portal, fetched ${fetched} (https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/partner-search)"`
      );
      expect(line2).toBe(
        '# License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). © European Union. Contact details in summaries are masked.'
      );
      expect(header?.startsWith('id,topicIdentifier,')).toBe(true);

      const json = toExportJson(dtos, new Date('2026-10-20T08:00:00.000Z'), truncated);
      expect(json.source.name).toBe('EU Funding & Tenders Portal');
      expect(json.source.license).toBe('CC BY 4.0');
      expect(json.source.notice).toBe(
        `Source: EU Funding & Tenders Portal, fetched ${fetched}. © European Union, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Contact details in summaries are masked.`
      );
      expect(json.count).toBe(3);
      evidence('C5 csv head', [line1, line2]);
      evidence('C5 json source', json.source);
    });
  });
});
