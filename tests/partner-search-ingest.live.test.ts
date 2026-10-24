import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { PartnerSearchClient } from '@/lib/adapters/partner-search';
import { PARTNER_SEARCH_FLAG_KEY } from '@/modules/m1/server/partner-search/flag';
import { runPartnerSearchIngestion } from '@/modules/m1/server/partner-search/ingestor';

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
  await prisma.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: TOPIC } });
  await prisma.rawFetch.deleteMany({ where: { source: 'partner_search', key: TOPIC } });
  await prisma.topic.deleteMany({ where: { identifier: TOPIC } });
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
    await prisma.$disconnect();
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

  it('a row absent from two consecutive scans is withdrawn; one miss is not enough', async () => {
    const smaller = structuredClone(FIXTURE);
    const gone = smaller.topicOrganizations.shift();
    const goneId = String(gone.id);

    await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => smaller)),
    });
    let row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: goneId } });
    expect(row?.missedScans).toBe(1);
    expect(row?.withdrawnAt).toBeNull();

    await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: client(portal(() => smaller)),
    });
    row = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: goneId } });
    expect(row?.missedScans).toBe(2);
    expect(row?.withdrawnAt).not.toBeNull();
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
