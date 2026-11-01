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
import { PARTNER_SEARCH_INGESTION_LOCK, holdTestDbLock } from './helpers/test-db-lock';

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
// FO-64 review B1: the fixture's first row (PIC 100000000) is not in CORDIS, so it is queued
// under this key; an admin links it to a CORDIS organisation with another PIC.
const LINKED_ID = '900000';
const LINKED_KEY = 'pic:100000000';
const LINKED_PIC = '999064001';

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
  await prisma.unmatchedOrganization.deleteMany({ where: { matchKey: LINKED_KEY } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: LINKED_PIC } });
}

describe.skipIf(!RUN)('partner-search ingestion (live database)', () => {
  // FO-66: partner-search-acceptance.live also runs the ingestor and raises alerts.
  let releaseLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseLock = await holdTestDbLock(process.env.DATABASE_URL ?? '', PARTNER_SEARCH_INGESTION_LOCK);
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
    await releaseLock?.();
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

    // FO-60 review 1: the person's name never reaches a row, not only the ecasId.
    expect(await prisma.partnerSearchAnnouncement.count({ where: { organizationName: '<masked-person>' } })).toBe(0);

    const stat = await prisma.partnerSearchTopicStat.findUnique({ where: { topicIdentifier: TOPIC } });
    expect(stat?.personAnnouncementCount).toBe(1);

    const run = await prisma.partnerSearchIngestionRun.findUnique({ where: { id: outcome.runId } });
    expect(run?.status).toBe('SUCCESS');
    expect(run?.created).toBe(3);

    const raw = await prisma.rawFetch.findMany({ where: { source: 'partner_search', key: TOPIC } });
    expect(raw.length).toBe(1);
    expect(JSON.stringify(raw)).not.toMatch(/ecas/i);
  });

  it('an invalid requestDate raises a SystemAlert, stops the run, and writes no rows (FO-60 review 2)', async () => {
    await setFlag(true);
    const broken = structuredClone(FIXTURE);
    broken.topicOrganizations[0].requestDate = '19/10/2026';
    // A repeat of the same drift folds into one open alert (recordAlert dedupes), so the
    // test counts open drift alerts, not new rows: the spec is exactly one.
    const driftAlerts = () =>
      prisma.systemAlert.count({
        where: { source: 'partner_search_adapter', resolvedAt: null, message: { contains: 'API schema change detected' } },
      });
    await prisma.systemAlert.deleteMany({ where: { source: 'partner_search_adapter' } });
    const rowsBefore = await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC } });
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => broken)),
    });
    expect(outcome.kind === 'done' && outcome.status).toBe('FAILED');
    expect(await driftAlerts()).toBe(1);
    expect(await prisma.partnerSearchAnnouncement.count({ where: { topicIdentifier: TOPIC } })).toBe(rowsBefore);
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

  it('a manual PIC link survives the next scan (FO-64 review B1)', async () => {
    await setFlag(true);
    const scan = () =>
      runPartnerSearchIngestion({ trigger: 'MANUAL', topicIdentifiers: [TOPIC], client: client(portal(() => FIXTURE)) });
    await scan();
    const queued = await prisma.unmatchedOrganization.findUnique({ where: { matchKey: LINKED_KEY } });
    expect(queued?.resolvedPic).toBeNull();

    // What resolveUnmatchedOrganization writes (admin action, audited there).
    await prisma.cordisOrganization.create({ data: { organisationId: LINKED_PIC, name: 'FO64 linked org' } });
    await prisma.unmatchedOrganization.update({ where: { matchKey: LINKED_KEY }, data: { resolvedPic: LINKED_PIC } });
    await prisma.partnerSearchAnnouncement.update({ where: { externalId: LINKED_ID }, data: { organizationPic: LINKED_PIC } });

    const outcome = await scan();
    expect(outcome.kind === 'done' && outcome.status).toBe('SUCCESS');
    const row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: LINKED_ID } });
    expect(row?.organizationPic).toBe(LINKED_PIC);
    const org = await prisma.cordisOrganization.findUnique({ where: { organisationId: LINKED_PIC } });
    expect(org?.hasActiveAnnouncements).toBe(true);
    const after = await prisma.unmatchedOrganization.findUnique({ where: { matchKey: LINKED_KEY } });
    expect(after?.resolvedPic).toBe(LINKED_PIC);
  });
});

/*
 * Retention and the flag write path (FO-65 F2 + F4 / TASK-MVL3LMW9R7S5E). In this
 * file, not its own: both suites flip the one global flag row, and vitest runs
 * files in parallel, so two files would switch it under each other.
 * `DATABASE_URL_RLS_TEST` is the app role `fabrika_app`: the write-guard checks run
 * under it, because the superuser connection would pass them anyway. `prisma` here
 * is the owner connection, the only one allowed to call the writer (PR #163, crw-fb B1).
 */
const RET_TOPIC = 'FO65-RET-CLOSED-01';
const RET_OPEN_TOPIC = 'FO65-RET-OPEN-01';
const RET_SOLO_KEY = 'FO65-RET-OPEN-SOLO';
const RET_CALL = 'FO65-RET-CALL';
const RET_PIC = '999065001';
const ADMIN_ID = 'fo65-test-admin';
const NON_ADMIN_ID = 'fo65-test-member';
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
  await prisma.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: { in: [RET_TOPIC, RET_OPEN_TOPIC] } } });
  await prisma.rawFetch.deleteMany({
    where: { source: 'partner_search', key: { in: [RET_TOPIC, RET_OPEN_TOPIC, RET_SOLO_KEY] } },
  });
  await prisma.topic.deleteMany({ where: { identifier: { in: [RET_TOPIC, RET_OPEN_TOPIC] } } });
  await prisma.call.deleteMany({ where: { callIdentifier: RET_CALL } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: RET_PIC } });
  await prisma.auditEvent.deleteMany({ where: { type: 'platform.setting.changed', actorId: ADMIN_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, NON_ADMIN_ID] } } });
}

async function withApp<T>(fn: (app: pg.Client) => Promise<T>): Promise<T> {
  const app = new pg.Client({ connectionString: APP_URL });
  await app.connect();
  try {
    return await fn(app);
  } finally {
    await app.end();
  }
}

describe.skipIf(!RUN)('partner-search retention and flag write path (live database)', () => {
  beforeAll(async () => {
    await retentionCleanup();
    await prisma.user.createMany({
      data: [
        { id: ADMIN_ID, email: 'fo65-admin@example.test', isPlatformAdmin: true },
        { id: NON_ADMIN_ID, email: 'fo65-member@example.test', isPlatformAdmin: false },
      ],
    });
    await prisma.programme.upsert({
      where: { id: 'HE' },
      update: {},
      create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' },
    });
    const call = await prisma.call.create({
      data: { callIdentifier: RET_CALL, title: 'FO65 retention call', programmeId: 'HE' },
    });
    for (const [identifier, status] of [
      [RET_TOPIC, 'CLOSED'],
      [RET_OPEN_TOPIC, 'OPEN'],
    ] as const) {
      await prisma.topic.create({
        data: { identifier, callId: call.id, title: `FO65 ${status} topic`, status, deadlines: [], eligibility: {}, keywords: [] },
      });
    }
  });

  afterAll(async () => {
    await setPartnerSearchIngestionFlag(prisma, false, ADMIN_ID);
    await retentionCleanup();
  });

  it('app role can neither write PlatformSetting nor call the writer (42501)', async () => {
    expect(APP_URL).toBeTruthy();
    await withApp(async (app) => {
      await expect(
        app.query(`UPDATE "PlatformSetting" SET value = 'true'::jsonb WHERE key = $1`, [PARTNER_SEARCH_FLAG_KEY])
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        app.query(`INSERT INTO "PlatformSetting" (key, value, "updatedAt") VALUES ('x', 'true'::jsonb, now())`)
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        app.query(`SELECT public.set_platform_setting($1, 'true'::jsonb, $2)`, [PARTNER_SEARCH_FLAG_KEY, ADMIN_ID])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('owner path: the writer sets the flag and leaves an AuditEvent naming the admin', async () => {
    await setPartnerSearchIngestionFlag(prisma, true, ADMIN_ID);
    expect((await prisma.platformSetting.findUnique({ where: { key: PARTNER_SEARCH_FLAG_KEY } }))?.value).toBe(true);
    const audit = await prisma.auditEvent.findFirst({
      where: { type: 'platform.setting.changed', target: PARTNER_SEARCH_FLAG_KEY, actorId: ADMIN_ID },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.data).toEqual({ value: true });
    expect(audit?.tenantId).toBeNull();
  });

  it('the writer refuses a blank, unknown or non-admin actor, an unknown key and a non-boolean value', async () => {
    const call = (key: string, value: string, actor: string | null) =>
      prisma.$executeRawUnsafe(`SELECT public.set_platform_setting($1, $2::jsonb, $3)`, key, value, actor);
    await expect(call(PARTNER_SEARCH_FLAG_KEY, 'true', null)).rejects.toThrow(/actor is required/);
    await expect(call(PARTNER_SEARCH_FLAG_KEY, 'true', '  ')).rejects.toThrow(/actor is required/);
    await expect(call(PARTNER_SEARCH_FLAG_KEY, 'true', 'anyone-at-all')).rejects.toThrow(/not a platform admin/);
    await expect(call(PARTNER_SEARCH_FLAG_KEY, 'true', NON_ADMIN_ID)).rejects.toThrow(/not a platform admin/);
    await expect(call('other_key', 'true', ADMIN_ID)).rejects.toThrow(/unknown key/);
    await expect(call(PARTNER_SEARCH_FLAG_KEY, '"yes"', ADMIN_ID)).rejects.toThrow(/takes a boolean/);
    await expect(setPartnerSearchIngestionFlag(prisma, true, ' ')).rejects.toThrow(/actorId is required/);
    expect(
      await prisma.auditEvent.count({ where: { type: 'platform.setting.changed', actorId: { in: ['anyone-at-all', NON_ADMIN_ID] } } })
    ).toBe(0);
  });

  it('flag OFF: retention is a no-op and deletes nothing', async () => {
    await setPartnerSearchIngestionFlag(prisma, false, ADMIN_ID);
    await prisma.partnerSearchAnnouncement.create({ data: retentionRow('off-91', { lastSeenAt: ago(91) }) });
    const outcome = await runPartnerSearchRetention(NOW);
    expect(outcome).toEqual({ kind: 'skipped', reason: 'flag-off' });
    expect(await prisma.partnerSearchAnnouncement.count({ where: { externalId: 'off-91' } })).toBe(1);
    await prisma.partnerSearchAnnouncement.delete({ where: { externalId: 'off-91' } });
  });

  it('flag ON: 90-day closed rule, 30-day withdrawn rule, RawFetch rules, PIC flag refresh; a second run deletes nothing', async () => {
    await setPartnerSearchIngestionFlag(prisma, true, ADMIN_ID);
    await prisma.cordisOrganization.create({
      data: { organisationId: RET_PIC, name: 'Retention PIC Org', hasActiveAnnouncements: true, lastAnnouncementAt: ago(91) },
    });
    await prisma.partnerSearchAnnouncement.createMany({
      data: [
        // CLOSED topic: 91 days goes (its PIC loses its only active row), 89 stays.
        retentionRow('closed-91', { lastSeenAt: ago(91), organizationPic: RET_PIC }),
        retentionRow('closed-89', { lastSeenAt: ago(89) }),
        // Withdrawn rows only appear on topics still being scanned: an OPEN one.
        retentionRow('withdrawn-31', { topicIdentifier: RET_OPEN_TOPIC, lastSeenAt: ago(60), withdrawnAt: ago(31) }),
        retentionRow('withdrawn-29', { topicIdentifier: RET_OPEN_TOPIC, lastSeenAt: ago(60), withdrawnAt: ago(29) }),
        // OPEN topic, not withdrawn: kept however old.
        retentionRow('open-200', { topicIdentifier: RET_OPEN_TOPIC, lastSeenAt: ago(200) }),
      ],
    });
    await prisma.rawFetch.createMany({
      data: [
        // CLOSED topic: 90-day rule.
        { source: 'partner_search', key: RET_TOPIC, hash: 'closed-91', fetchedAt: ago(91) },
        { source: 'partner_search', key: RET_TOPIC, hash: 'closed-89', fetchedAt: ago(89) },
        // OPEN topic: older than 30 days and not the newest goes; the newest stays.
        { source: 'partner_search', key: RET_OPEN_TOPIC, hash: 'open-200', fetchedAt: ago(200) },
        { source: 'partner_search', key: RET_OPEN_TOPIC, hash: 'open-31', fetchedAt: ago(31) },
        { source: 'partner_search', key: RET_OPEN_TOPIC, hash: 'open-29', fetchedAt: ago(29) },
        { source: 'partner_search', key: RET_OPEN_TOPIC, hash: 'open-5', fetchedAt: ago(5) },
        // An only snapshot stays at any age while its topic is not closed.
        { source: 'partner_search', key: RET_SOLO_KEY, hash: 'solo-200', fetchedAt: ago(200) },
      ],
    });

    const outcome = await runPartnerSearchRetention(NOW);
    expect(outcome).toEqual({ kind: 'done', summary: { closedDeleted: 1, withdrawnDeleted: 1, rawFetchDeleted: 3 } });

    const left = await prisma.partnerSearchAnnouncement.findMany({
      where: { topicIdentifier: { in: [RET_TOPIC, RET_OPEN_TOPIC] } },
      select: { externalId: true },
    });
    expect(left.map((r) => r.externalId).sort()).toEqual(['closed-89', 'open-200', 'withdrawn-29']);

    const raw = await prisma.rawFetch.findMany({
      where: { source: 'partner_search', key: { in: [RET_TOPIC, RET_OPEN_TOPIC, RET_SOLO_KEY] } },
      select: { hash: true },
    });
    expect(raw.map((r) => r.hash).sort()).toEqual(['closed-89', 'open-29', 'open-5', 'solo-200']);

    const org = await prisma.cordisOrganization.findUnique({
      where: { organisationId: RET_PIC },
      select: { hasActiveAnnouncements: true, lastAnnouncementAt: true },
    });
    expect(org).toEqual({ hasActiveAnnouncements: false, lastAnnouncementAt: null });

    expect(await runPartnerSearchRetention(NOW)).toEqual({
      kind: 'done',
      summary: { closedDeleted: 0, withdrawnDeleted: 0, rawFetchDeleted: 0 },
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
