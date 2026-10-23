import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerSearchBlockedError, type PartnerSearchClient } from '@/lib/adapters/partner-search';

const db = vi.hoisted(() => ({
  platformSetting: { findUnique: vi.fn() },
  partnerSearchIngestionRun: { create: vi.fn(), update: vi.fn() },
  partnerSearchTopicStat: { upsert: vi.fn() },
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
