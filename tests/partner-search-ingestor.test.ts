import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PartnerSearchBlockedError,
  PartnerSearchClient,
  type PartnerSearchAllowlistedRow,
  type PartnerSearchTopicResult,
} from '@/lib/adapters/partner-search';

const db = vi.hoisted(() => ({
  platformSetting: { findUnique: vi.fn() },
  partnerSearchIngestionRun: { create: vi.fn(), update: vi.fn() },
  partnerSearchTopicStat: { upsert: vi.fn() },
  partnerSearchAnnouncement: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  cordisOrganization: { findMany: vi.fn(), updateMany: vi.fn() },
  unmatchedOrganization: { upsert: vi.fn() },
  rawFetch: { findFirst: vi.fn(), create: vi.fn() },
  topic: { findMany: vi.fn() },
}));
const alerts = vi.hoisted(() => ({
  createAdapterAlert: vi.fn(),
  reportSchemaDrift: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/adapters/alerts', () => alerts);
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runPartnerSearchIngestion } from '@/modules/m1/server/partner-search/ingestor';

/** A client double: only the two methods and the circuit flag the ingestor reads. */
function fakeClient(overrides: {
  fetchTopic?: PartnerSearchClient['fetchTopic'];
}): PartnerSearchClient {
  return {
    fetchCcm2Map: vi.fn(async () => new Map([['HORIZON-TEST-1', '123']])),
    fetchTopic: overrides.fetchTopic ?? vi.fn(),
    circuitOpen: false,
  } as unknown as PartnerSearchClient;
}

function enableFlag(value: unknown) {
  db.platformSetting.findUnique.mockResolvedValue({ value });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.topic.findMany.mockResolvedValue([{ identifier: 'HORIZON-TEST-1' }]);
  db.partnerSearchIngestionRun.create.mockResolvedValue({ id: 'run-1' });
  db.partnerSearchIngestionRun.update.mockResolvedValue({});
});

describe('runPartnerSearchIngestion — global flag', () => {
  it('is a no-op while the flag is off: no run row, no portal call', async () => {
    enableFlag(false);
    const client = fakeClient({});

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(outcome).toEqual({ kind: 'skipped', reason: 'flag-off' });
    expect(db.partnerSearchIngestionRun.create).not.toHaveBeenCalled();
    expect(client.fetchCcm2Map).not.toHaveBeenCalled();
  });

  it('treats a missing row as off', async () => {
    db.platformSetting.findUnique.mockResolvedValue(null);
    const client = fakeClient({});

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(outcome.kind).toBe('skipped');
    expect(client.fetchCcm2Map).not.toHaveBeenCalled();
  });

  it('treats a non-boolean value as off', async () => {
    enableFlag('true');
    const client = fakeClient({});

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(outcome.kind).toBe('skipped');
  });

  it('treats an unreadable flag as off instead of ingesting on a guess', async () => {
    db.platformSetting.findUnique.mockRejectedValue(new Error('connection lost'));
    const client = fakeClient({});

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(outcome.kind).toBe('skipped');
    expect(client.fetchCcm2Map).not.toHaveBeenCalled();
  });
});

describe('runPartnerSearchIngestion — stop and alert paths', () => {
  it('403/429 stops the run, raises one blocked alert, and marks the run FAILED', async () => {
    enableFlag(true);
    const fetchTopic = vi.fn(async () => {
      throw new PartnerSearchBlockedError(403);
    });
    const client = fakeClient({ fetchTopic });

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.status).toBe('FAILED');
    expect(alerts.createAdapterAlert).toHaveBeenCalledTimes(1);
    expect(alerts.createAdapterAlert).toHaveBeenCalledWith(
      expect.any(String),
      'error',
      expect.stringContaining('403/429'),
      expect.any(Object),
      'partner_search:blocked'
    );
    expect(db.partnerSearchIngestionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('schema drift raises a drift alert, stops, and writes no topic rows', async () => {
    enableFlag(true);
    const fetchTopic = vi.fn(async () => ({
      status: 'drift' as const,
      topicIdentifier: 'HORIZON-TEST-1',
      schemaDrift: ['topicOrganisations[0].pic: missing'],
    }));
    const client = fakeClient({ fetchTopic });

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') return;
    expect(outcome.status).toBe('FAILED');
    expect(alerts.reportSchemaDrift).toHaveBeenCalledWith(
      expect.any(String),
      ['topicOrganisations[0].pic: missing']
    );
    expect(alerts.createAdapterAlert).not.toHaveBeenCalled();
    expect(db.partnerSearchTopicStat.upsert).not.toHaveBeenCalled();
  });
});

/** A stored announcement with every field a scan compares; the defaults match an unmatched organisation row. */
function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    externalId: 'a',
    topicIdentifier: 'HORIZON-TEST-1',
    type: 'EXPERTISE_OFFER',
    description: null,
    publishedAt: null,
    organizationName: 'Org A',
    organizationType: 'OTH',
    country: 'BE',
    organizationPic: null,
    withdrawnAt: null,
    missedScans: 0,
    missedScanAt: null,
    ...overrides,
  };
}

function orgRow(overrides: Partial<PartnerSearchAllowlistedRow> = {}): PartnerSearchAllowlistedRow {
  return {
    id: 'a',
    organisationName: 'Org A',
    organisationType: null,
    country: 'BE',
    pic: null,
    summary: null,
    expertise: 'Expertise_offer',
    interestStatus: null,
    requestDate: null,
    topicIdentifier: 'HORIZON-TEST-1',
    ...overrides,
  };
}

function okResult(rows: PartnerSearchAllowlistedRow[]): PartnerSearchTopicResult {
  return { status: 'ok', topicIdentifier: 'HORIZON-TEST-1', rows, personCount: 0, withdrawnCount: 0, schemaDrift: [] };
}

/** A real client over a routed fetch: the SEDIA listing and the topic endpoint. The adapter's own checks run. */
function portalClient(topicBody: unknown) {
  const fetchImpl = vi.fn(async (url: string) => {
    const body = String(url).includes('api.tech.ec.europa.eu')
      ? { totalResults: 1, results: [{ metadata: { identifier: ['HORIZON-TEST-1'], ccm2Id: ['123'] } }] }
      : topicBody;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return new PartnerSearchClient({ fetchImpl, sleep: async () => {}, minIntervalMs: 0 });
}

/** The topic's stored rows; the portal-move lookup and the active-PIC refresh find nothing. */
function storedOnly(rows: Array<ReturnType<typeof storedRow>>) {
  db.partnerSearchAnnouncement.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.externalId || where.organizationPic ? [] : rows
  );
}

describe('runPartnerSearchIngestion — FO-60 review 2: an invalid requestDate is drift', () => {
  it('raises one drift alert, writes no topic rows, and the run stops', async () => {
    enableFlag(true);
    const body = {
      topicOrganizations: [
        {
          id: 'a',
          organisationName: 'Org A',
          type: 'ORGANISATION',
          expertise: 'Expertise_offer',
          topicIdentifier: 'HORIZON-TEST-1',
          requestDate: '19/10/2026',
          pic: '100',
        },
      ],
    };

    const outcome = await runPartnerSearchIngestion({ trigger: 'FULL', client: portalClient(body) });

    expect(outcome.kind === 'done' && outcome.status).toBe('FAILED');
    expect(alerts.reportSchemaDrift).toHaveBeenCalledTimes(1);
    expect(db.partnerSearchAnnouncement.create).not.toHaveBeenCalled();
    expect(db.partnerSearchAnnouncement.update).not.toHaveBeenCalled();
  });
});

describe('runPartnerSearchIngestion — FO-60 review 4: an empty scan is not a withdrawal', () => {
  it('a 0-row scan of a topic with stored announcements withdraws nothing and raises one alert', async () => {
    enableFlag(true);
    // Two misses on earlier days would withdraw this row on the empty scan.
    storedOnly([storedRow({ missedScans: 1, missedScanAt: new Date('2026-10-22T03:00:00.000Z') })]);
    db.partnerSearchAnnouncement.update.mockResolvedValue({});
    const client = fakeClient({ fetchTopic: vi.fn(async () => okResult([])) });

    await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(db.partnerSearchAnnouncement.update).not.toHaveBeenCalled();
    expect(alerts.createAdapterAlert).toHaveBeenCalledTimes(1);
    expect(alerts.createAdapterAlert).toHaveBeenCalledWith(
      expect.any(String),
      'warn',
      expect.stringContaining('empty'),
      expect.any(Object),
      'partner_search:empty_scan:HORIZON-TEST-1'
    );
  });
});

describe('runPartnerSearchIngestion — FO-60 review 5 and 6: PIC refresh and updated count', () => {
  it("a row seen again refreshes the PIC it had before, so that organisation's flag is recomputed", async () => {
    enableFlag(true);
    storedOnly([storedRow({ organizationPic: 'OLDPIC' })]);
    db.cordisOrganization.findMany.mockResolvedValue([]);
    db.unmatchedOrganization.upsert.mockResolvedValue({});
    db.partnerSearchAnnouncement.update.mockResolvedValue({});
    db.rawFetch.findFirst.mockResolvedValue(null);
    db.rawFetch.create.mockResolvedValue({});
    db.cordisOrganization.updateMany.mockResolvedValue({ count: 1 });
    const client = fakeClient({ fetchTopic: vi.fn(async () => okResult([orgRow()])) });

    await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(db.cordisOrganization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: 'OLDPIC' } })
    );
  });

  it('a scan that changes no field counts zero updated rows', async () => {
    enableFlag(true);
    storedOnly([storedRow()]);
    db.cordisOrganization.findMany.mockResolvedValue([]);
    db.unmatchedOrganization.upsert.mockResolvedValue({});
    db.partnerSearchAnnouncement.update.mockResolvedValue({});
    db.rawFetch.findFirst.mockResolvedValue(null);
    db.rawFetch.create.mockResolvedValue({});
    const client = fakeClient({ fetchTopic: vi.fn(async () => okResult([orgRow()])) });

    await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(db.partnerSearchIngestionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ updated: 0, created: 0 }) })
    );
  });
});

describe('runPartnerSearchIngestion — FO-64 review B1: a manual PIC link survives the next scan', () => {
  const LINKED = '998877665';

  /** CORDIS knows the PIC under another name, so matchPic stays unmatched; the admin has resolved the queue row. */
  function adminLinked(stored: Array<ReturnType<typeof storedRow>>) {
    enableFlag(true);
    db.partnerSearchAnnouncement.findMany.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.externalId) return [];
        if (where.organizationPic) return where.organizationPic === LINKED ? [{ lastSeenAt: new Date() }] : [];
        return stored;
      }
    );
    db.cordisOrganization.findMany.mockResolvedValue([]);
    db.unmatchedOrganization.upsert.mockResolvedValue({ resolvedPic: LINKED });
    db.partnerSearchAnnouncement.update.mockResolvedValue({});
    db.partnerSearchAnnouncement.create.mockResolvedValue({});
    db.rawFetch.findFirst.mockResolvedValue(null);
    db.rawFetch.create.mockResolvedValue({});
    db.cordisOrganization.updateMany.mockResolvedValue({ count: 1 });
  }

  it('keeps the linked PIC on an announcement seen again and leaves its organisation flagged active', async () => {
    adminLinked([storedRow({ organizationName: 'Live Demo Labs', organizationPic: LINKED })]);
    const client = fakeClient({
      fetchTopic: vi.fn(async () => okResult([orgRow({ organisationName: 'Live Demo Labs' })])),
    });

    await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(db.partnerSearchAnnouncement.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: 'a' }, data: expect.objectContaining({ organizationPic: LINKED }) })
    );
    expect(db.cordisOrganization.updateMany).toHaveBeenCalledWith({
      where: { organisationId: LINKED },
      data: expect.objectContaining({ hasActiveAnnouncements: true }),
    });
    expect(db.partnerSearchIngestionRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ updated: 0 }) })
    );
  });

  it("links the same organisation's new announcement to the resolved PIC", async () => {
    adminLinked([]);
    const client = fakeClient({
      fetchTopic: vi.fn(async () => okResult([orgRow({ id: 'b', organisationName: 'Live Demo Labs' })])),
    });

    await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(db.partnerSearchAnnouncement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ externalId: 'b', organizationPic: LINKED }),
    });
  });

  it('an unresolved queue row still writes no PIC', async () => {
    adminLinked([storedRow({ organizationName: 'Live Demo Labs' })]);
    db.unmatchedOrganization.upsert.mockResolvedValue({ resolvedPic: null });
    const client = fakeClient({
      fetchTopic: vi.fn(async () => okResult([orgRow({ organisationName: 'Live Demo Labs' })])),
    });

    await runPartnerSearchIngestion({ trigger: 'FULL', client });

    expect(db.partnerSearchAnnouncement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationPic: null }) })
    );
  });
});
