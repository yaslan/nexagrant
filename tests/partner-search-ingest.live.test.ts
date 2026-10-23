import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { PartnerSearchClient } from '@/lib/adapters/partner-search';
import pg from 'pg';
import { PARTNER_SEARCH_FLAG_KEY, setPartnerSearchIngestionFlag } from '@/modules/m1/server/partner-search/flag';
import { runPartnerSearchIngestion } from '@/modules/m1/server/partner-search/ingestor';
import { EMAIL_MASK, PHONE_MASK } from '@/modules/m1/server/partner-search/mask';
import { runPartnerSearchRetention } from '@/modules/m1/server/partner-search/retention';

/**
 * Partner Search ingestion against real Postgres (FO-60 / TASK-MVCH2J271U5VY).
 *
 * The portal is the only fake: `fetchImpl` answers from the masked fixture. Everything
 * else is real: Prisma, the flag row, the RawFetch / SystemAlert / run writes.
 *
 * Runs only on an isolated database. The `fabrika` name is refused outside CI
 * (the shared dev DB), so point DATABASE_URL at a copy, e.g. `fabrika_fo60`.
 */
const dbName = new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname.replace('/', '');
const HAS_DB = Boolean(process.env.DATABASE_URL);
const SHARED = dbName === 'fabrika' && process.env.CI !== 'true';
const RUN = HAS_DB && !SHARED;

const FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), 'tests/fixtures/partner-search/topicOrganisations.sample.json'), 'utf8')
);
const TOPIC = 'FO60-TEST-HORIZON-CL4-01';
const CALL = 'FO60-TEST-CALL';
const CCM2 = '900777';
const OTHER_TOPIC = 'FO60-TEST-OTHER-TOPIC';
const MOVED_ID = '900099';

/** Routes the two portal endpoints: the SEDIA listing (ccm2 map) and topicOrganisations. */
function portal(topicBody: () => unknown, status = 200) {
  return (async (url: string) => {
    if (String(url).includes('api.tech.ec.europa.eu')) {
      return new Response(
        JSON.stringify({
          totalResults: 1,
          results: [{ metadata: { identifier: [TOPIC], ccm2Id: [CCM2] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (status !== 200) return new Response('refused', { status });
    return new Response(JSON.stringify(topicBody()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

const noSleep = async () => {};
const client = (f: typeof fetch) => new PartnerSearchClient({ fetchImpl: f, sleep: noSleep, minIntervalMs: 0 });

async function setFlag(on: boolean) {
  await prisma.platformSetting.upsert({
    where: { key: PARTNER_SEARCH_FLAG_KEY },
    update: { value: on },
    create: { key: PARTNER_SEARCH_FLAG_KEY, value: on },
  });
}

async function cleanup() {
  await prisma.partnerSearchTopicStat.deleteMany({ where: { topicIdentifier: TOPIC } });
  await prisma.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: { in: [TOPIC, OTHER_TOPIC] } } });
  await prisma.rawFetch.deleteMany({ where: { source: 'partner_search', key: TOPIC } });
  await prisma.topic.deleteMany({ where: { identifier: { in: [TOPIC, OTHER_TOPIC] } } });
  await prisma.call.deleteMany({ where: { callIdentifier: CALL } });
}

describe.skipIf(!RUN)('partner-search ingestion (live database)', () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.programme.upsert({
      where: { id: 'HE' },
      update: {},
      create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' },
    });
    const call = await prisma.call.create({
      data: { callIdentifier: CALL, title: 'FO60 test call', programmeId: 'HE' },
    });
    await prisma.topic.create({
      data: {
        identifier: TOPIC,
        callId: call.id,
        title: 'FO60 test topic',
        status: 'OPEN',
        deadlines: [],
        eligibility: {},
        keywords: [],
      },
    });
  });

  afterAll(async () => {
    await setFlag(false);
    await cleanup();
  });

  it('flag OFF (default): the run is a no-op and writes no run row', async () => {
    await setFlag(false);
    const before = await prisma.partnerSearchIngestionRun.count();
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => FIXTURE)),
    });
    expect(outcome).toEqual({ kind: 'skipped', reason: 'flag-off' });
    expect(await prisma.partnerSearchIngestionRun.count()).toBe(before);
  });

  it('flag ON: stores organisation rows only, counts the person row, never stores ecasId', async () => {
    await setFlag(true);
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => FIXTURE)),
    });
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.summary.created).toBe(3);

    const rows = await prisma.partnerSearchAnnouncement.findMany({ where: { topicIdentifier: TOPIC } });
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toMatch(/ecas/i);

    const stat = await prisma.partnerSearchTopicStat.findUnique({ where: { topicIdentifier: TOPIC } });
    expect(stat?.personAnnouncementCount).toBe(1);

    const run = await prisma.partnerSearchIngestionRun.findUnique({ where: { id: outcome.runId } });
    expect(run?.status).toBe('SUCCESS');
    expect(run?.created).toBe(3);

    const raw = await prisma.rawFetch.findMany({ where: { source: 'partner_search', key: TOPIC } });
    expect(raw.length).toBe(1);
    expect(JSON.stringify(raw)).not.toMatch(/ecas/i);
  });

  it('an unchanged second scan stores no new RawFetch row', async () => {
    await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => FIXTURE)),
    });
    expect(await prisma.rawFetch.count({ where: { source: 'partner_search', key: TOPIC } })).toBe(1);
  });

  it('the same rows in a different order store no new RawFetch row (the portal does not order them)', async () => {
    const reordered = structuredClone(FIXTURE);
    reordered.topicOrganizations.reverse();
    await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => reordered)),
    });
    expect(await prisma.rawFetch.count({ where: { source: 'partner_search', key: TOPIC } })).toBe(1);
  });

  it('a row absent from scans on two different days is withdrawn; a same-day re-run is not a second miss', async () => {
    const smaller = structuredClone(FIXTURE);
    const gone = smaller.topicOrganizations.shift();
    const goneId = String(gone.id);
    const day1 = new Date('2026-10-20T03:00:00.000Z');
    const scan = (at: Date) =>
      runPartnerSearchIngestion({
        trigger: 'MANUAL',
        topicIdentifiers: [TOPIC],
        client: client(portal(() => smaller)),
        now: () => at,
      });

    await scan(day1);
    let row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: goneId } });
    expect(row?.missedScans).toBe(1);
    expect(row?.withdrawnAt).toBeNull();

    // FO-60 review 2: the K1 incremental or a re-run after a failed run, same UTC day.
    await scan(new Date('2026-10-20T03:40:00.000Z'));
    row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: goneId } });
    expect(row?.missedScans).toBe(1);
    expect(row?.withdrawnAt).toBeNull();

    await scan(new Date('2026-10-21T03:00:00.000Z'));
    row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: goneId } });
    expect(row?.missedScans).toBe(2);
    expect(row?.withdrawnAt).not.toBeNull();
  });

  it('e-mail and phone in a summary are masked in the row and in RawFetch (FO-65 F3)', async () => {
    const withContact = structuredClone(FIXTURE);
    const target = withContact.topicOrganizations.find((r: { type: string }) => r.type === 'ORGANISATION');
    target.summary = 'Contact jane.doe@example-org.eu or +32 2 123 45 67 for the consortium.';
    await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => withContact)),
    });
    const row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: String(target.id) } });
    expect(row?.description).toBe(`Contact ${EMAIL_MASK} or ${PHONE_MASK} for the consortium.`);
    const raw = await prisma.rawFetch.findMany({ where: { source: 'partner_search', key: TOPIC } });
    const payload = JSON.stringify(raw.map((r) => r.payload));
    expect(payload).toContain(EMAIL_MASK);
    expect(payload).not.toMatch(/jane\.doe|123 45 67/);
  });

  it('a row the portal moved here from another topic is updated, and the run still succeeds (FO-60 review 3)', async () => {
    const call = await prisma.call.findUniqueOrThrow({ where: { callIdentifier: CALL } });
    await prisma.topic.create({
      data: { identifier: OTHER_TOPIC, callId: call.id, title: 'FO60 other topic', status: 'OPEN', deadlines: [], eligibility: {}, keywords: [] },
    });
    await prisma.partnerSearchAnnouncement.create({
      data: {
        externalId: MOVED_ID,
        topicIdentifier: OTHER_TOPIC,
        type: 'EXPERTISE_OFFER',
        description: 'moved fixture',
        lastSeenAt: new Date('2026-10-01T03:00:00.000Z'),
        organizationName: 'Moved Org',
        source: 'PORTAL_API',
        keywords: [],
        programmeCodes: [],
      },
    });
    const withMoved = structuredClone(FIXTURE);
    withMoved.topicOrganizations.push({ ...structuredClone(FIXTURE.topicOrganizations[0]), id: MOVED_ID, pic: null });
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => withMoved)),
    });
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.status).toBe('SUCCESS');
    const moved = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: MOVED_ID } });
    expect(moved?.topicIdentifier).toBe(TOPIC);
  });

  it('schema drift: run FAILED, SystemAlert written, no stored announcement deleted', async () => {
    const before = await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC } });
    const broken = structuredClone(FIXTURE);
    broken.topicOrganizations[0].expertise = 'Something_new';
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => broken)),
    });
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.status).toBe('FAILED');
    expect(await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC } })).toBe(before);
    // createAdapterAlert stores the source as `<source>_adapter`.
    const alert = await prisma.systemAlert.findFirst({
      where: { source: 'partner_search_adapter', message: { contains: 'schema change' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(alert).not.toBeNull();
  });

  it('403 from the portal: run FAILED, blocked alert, nothing deleted', async () => {
    const before = await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC } });
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => FIXTURE, 403)),
    });
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.status).toBe('FAILED');
    expect(await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC } })).toBe(before);
    const alert = await prisma.systemAlert.findFirst({
      where: { source: 'partner_search_adapter', message: { contains: 'HTTP 403/429' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(alert?.level).toBe('error');
  });
});

/*
 * Retention and the flag write path (FO-65 F2 + F4 / TASK-MVL3LMW9R7S5E). In this
 * file, not its own: both suites flip the one global flag row, and vitest runs
 * files in parallel, so two files would switch it under each other.
 * `DATABASE_URL_RLS_TEST` is the app role `fabrika_app`: the write-guard checks run
 * under it, because the superuser connection would pass them anyway.
 */
const RET_TOPIC = 'FO65-RET-CLOSED-01';
const RET_CALL = 'FO65-RET-CALL';
const APP_URL = process.env.DATABASE_URL_RLS_TEST;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function retentionRow(externalId: string, extra: Record<string, unknown>) {
  return {
    externalId,
    topicIdentifier: RET_TOPIC,
    type: 'EXPERTISE_OFFER' as const,
    description: 'retention fixture',
    lastSeenAt: ago(1),
    organizationName: 'Retention Test Org',
    source: 'PORTAL_API' as const,
    keywords: [],
    programmeCodes: [],
    ...extra,
  };
}

async function retentionCleanup() {
  await prisma.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: RET_TOPIC } });
  await prisma.rawFetch.deleteMany({ where: { source: 'partner_search', key: RET_TOPIC } });
  await prisma.topic.deleteMany({ where: { identifier: RET_TOPIC } });
  await prisma.call.deleteMany({ where: { callIdentifier: RET_CALL } });
}

describe.skipIf(!RUN)('partner-search retention and flag write path (live database)', () => {
  beforeAll(async () => {
    await retentionCleanup();
    await prisma.programme.upsert({
      where: { id: 'HE' },
      update: {},
      create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' },
    });
    const call = await prisma.call.create({
      data: { callIdentifier: RET_CALL, title: 'FO65 retention call', programmeId: 'HE' },
    });
    await prisma.topic.create({
      data: {
        identifier: RET_TOPIC,
        callId: call.id,
        title: 'FO65 closed topic',
        status: 'CLOSED',
        deadlines: [],
        eligibility: {},
        keywords: [],
      },
    });
  });

  afterAll(async () => {
    await setPartnerSearchIngestionFlag(false, 'fo65-test');
    await retentionCleanup();
  });

  it('app role cannot UPDATE PlatformSetting; the writer does, and leaves an AuditEvent', async () => {
    expect(APP_URL).toBeTruthy();
    const app = new pg.Client({ connectionString: APP_URL });
    await app.connect();
    try {
      await expect(
        app.query(`UPDATE "PlatformSetting" SET value = 'true'::jsonb WHERE key = $1`, [PARTNER_SEARCH_FLAG_KEY])
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        app.query(`INSERT INTO "PlatformSetting" (key, value, "updatedAt") VALUES ('x', 'true'::jsonb, now())`)
      ).rejects.toMatchObject({ code: '42501' });

      await app.query(`SELECT public.set_platform_setting($1, 'true'::jsonb, 'fo65-admin')`, [PARTNER_SEARCH_FLAG_KEY]);
      const audit = await prisma.auditEvent.findFirst({
        where: { type: 'platform.setting.changed', target: PARTNER_SEARCH_FLAG_KEY, actorId: 'fo65-admin' },
      });
      expect(audit?.data).toEqual({ value: true });
    } finally {
      await app.end();
    }
    expect((await prisma.platformSetting.findUnique({ where: { key: PARTNER_SEARCH_FLAG_KEY } }))?.value).toBe(true);
  });

  it('the writer refuses an unknown key and a non-boolean value', async () => {
    const app = new pg.Client({ connectionString: APP_URL });
    await app.connect();
    try {
      await expect(app.query(`SELECT public.set_platform_setting('other_key', 'true'::jsonb, 'x')`)).rejects.toThrow(
        /unknown key/
      );
      await expect(
        app.query(`SELECT public.set_platform_setting($1, '"yes"'::jsonb, 'x')`, [PARTNER_SEARCH_FLAG_KEY])
      ).rejects.toThrow(/takes a boolean/);
    } finally {
      await app.end();
    }
  });

  it('flag OFF: retention is a no-op and deletes nothing', async () => {
    await setPartnerSearchIngestionFlag(false, 'fo65-test');
    await prisma.partnerSearchAnnouncement.create({ data: retentionRow('off-91', { lastSeenAt: ago(91) }) });
    const outcome = await runPartnerSearchRetention(NOW);
    expect(outcome).toEqual({ kind: 'skipped', reason: 'flag-off' });
    expect(await prisma.partnerSearchAnnouncement.count({ where: { externalId: 'off-91' } })).toBe(1);
    await prisma.partnerSearchAnnouncement.delete({ where: { externalId: 'off-91' } });
  });

  it('flag ON: closed-topic rows at 91 days go, at 89 days stay; withdrawn at 31 go, at 29 stay', async () => {
    await setPartnerSearchIngestionFlag(true, 'fo65-test');
    await prisma.partnerSearchAnnouncement.createMany({
      data: [
        retentionRow('closed-91', { lastSeenAt: ago(91), organizationPic: null }),
        retentionRow('closed-89', { lastSeenAt: ago(89) }),
        retentionRow('withdrawn-31', { lastSeenAt: ago(60), withdrawnAt: ago(31) }),
        retentionRow('withdrawn-29', { lastSeenAt: ago(60), withdrawnAt: ago(29) }),
      ],
    });
    await prisma.rawFetch.createMany({
      data: [
        { source: 'partner_search', key: RET_TOPIC, hash: 'old', fetchedAt: ago(91) },
        { source: 'partner_search', key: RET_TOPIC, hash: 'recent', fetchedAt: ago(89) },
      ],
    });

    const outcome = await runPartnerSearchRetention(NOW);
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.summary).toEqual({ closedDeleted: 1, withdrawnDeleted: 1, rawFetchDeleted: 1 });

    const left = await prisma.partnerSearchAnnouncement.findMany({
      where: { externalId: { in: ['closed-91', 'closed-89', 'withdrawn-31', 'withdrawn-29'] } },
      select: { externalId: true },
    });
    expect(left.map((r) => r.externalId).sort()).toEqual(['closed-89', 'withdrawn-29']);
    const raw = await prisma.rawFetch.findMany({ where: { source: 'partner_search', key: RET_TOPIC }, select: { hash: true } });
    expect(raw.map((r) => r.hash)).toEqual(['recent']);
  });

  it('flag ON: an OPEN topic keeps its old rows', async () => {
    await prisma.topic.update({ where: { identifier: RET_TOPIC }, data: { status: 'OPEN' } });
    await prisma.partnerSearchAnnouncement.create({ data: retentionRow('open-200', { lastSeenAt: ago(200) }) });
    await runPartnerSearchRetention(NOW);
    expect(await prisma.partnerSearchAnnouncement.count({ where: { externalId: 'open-200' } })).toBe(1);
    await prisma.topic.update({ where: { identifier: RET_TOPIC }, data: { status: 'CLOSED' } });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
