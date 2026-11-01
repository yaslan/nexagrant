/**
 * FO-66 (PS-K7) acceptance criterion 1, the trigger half: "open topic announcements
 * are visible within 24 hours" rests on two paths into the ingestor.
 *
 *   nightly  `partner-search` runs at 03:00 UTC every day (one tick per 24 h), over
 *            every OPEN/FORTHCOMING topic: the FULL trigger;
 *   K1       `k1-daily-calls` queues an INCREMENTAL run for the topics it has just
 *            created, so a new topic does not wait for the next 03:00 tick.
 *
 * Neither path had a test of its own: `jobs-schedule.test.ts` pins the cron text, and
 * nothing checked that K1 actually queues the run, with which payload, or that the job
 * hands that payload to the ingestor as INCREMENTAL. The ingestor itself is covered
 * (tests/partner-search-ingestor.test.ts, tests/partner-search-ingest.live.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';
import type { AdapterResult, BaseTopic } from '../src/lib/adapters/schemas/common';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  topics: new Map<string, Record<string, unknown>>(),
  enqueue: vi.fn(async (..._args: unknown[]) => ({ added: true })),
  ingest: vi.fn(async (..._args: unknown[]) => ({ kind: 'skipped', reason: 'flag-off' })),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    systemAlert: { create: vi.fn(async ({ data }: { data: Row }) => data) },
    rawFetch: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Row }) => data),
    },
    programme: { upsert: vi.fn(async ({ create }: { create: Row }) => create) },
    call: {
      upsert: vi.fn(async ({ where, create }: { where: { callIdentifier: string }; create: Row }) => ({
        id: `call-${where.callIdentifier}`,
        ...create,
      })),
    },
    topic: {
      findUnique: vi.fn(async ({ where }: { where: { identifier: string } }) => h.topics.get(where.identifier) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `topic-${String(data.identifier)}`, ...data };
        h.topics.set(String(data.identifier), row);
        return row;
      }),
      update: vi.fn(async ({ data }: { data: Row }) => data),
    },
  },
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: h.enqueue }));
vi.mock('../src/lib/jobs/enqueue', () => ({ enqueueJob: h.enqueue }));
vi.mock('@/modules/m1/server/partner-search/ingestor', () => ({ runPartnerSearchIngestion: h.ingest }));

const { syncK1Topics } = await import('../src/lib/jobs/tasks/k1-daily-calls');
const { partnerSearchTask } = await import('../src/lib/jobs/tasks/partner-search');
const { SCHEDULE } = await import('../src/lib/jobs/schedule');

function topic(identifier: string, status: BaseTopic['status'] = 'OPEN'): BaseTopic {
  return {
    identifier,
    title: `Topic ${identifier}`,
    status,
    callIdentifier: 'HORIZON-CL4-2027-01',
    isLumpSum: false,
    isTwoStage: false,
    deadlines: [],
    ageInDays: null,
    eligibility: { restricted: null, eligibleCountries: [], countriesExcluded: [] },
    keywords: [],
  } as BaseTopic;
}

function sedia(list: BaseTopic[]): AdapterResult<BaseTopic> {
  return { source: 'sedia', status: 'ok', topicsProcessed: list.length, topics: list, schemaDrift: [] } as AdapterResult<BaseTopic>;
}

function helpers(): JobHelpers {
  return {
    job: { id: '1', attempts: 1, max_attempts: 5 },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as JobHelpers;
}

beforeEach(() => {
  h.topics.clear();
  h.enqueue.mockClear();
  h.enqueue.mockImplementation(async () => ({ added: true }));
  h.ingest.mockClear();
});

describe('K1 → partner-search incremental trigger (criterion 1)', () => {
  it('a K1 run that creates topics queues one INCREMENTAL partner-search run for exactly those topics', async () => {
    const out = await syncK1Topics([sedia([topic('HORIZON-NEW-01'), topic('HORIZON-NEW-02', 'FORTHCOMING')])]);

    expect(out.inserted).toBe(2);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledWith('partner-search', {
      trigger: 'INCREMENTAL',
      topicIdentifiers: ['HORIZON-NEW-01', 'HORIZON-NEW-02'],
    });
  });

  it('topics K1 already knew are not re-queued: only the new one goes to the incremental run', async () => {
    await syncK1Topics([sedia([topic('HORIZON-OLD-01')])]);
    h.enqueue.mockClear();

    await syncK1Topics([sedia([topic('HORIZON-OLD-01'), topic('HORIZON-NEW-03')])]);

    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.enqueue.mock.calls[0]?.[1]).toEqual({ trigger: 'INCREMENTAL', topicIdentifiers: ['HORIZON-NEW-03'] });
  });

  it('a K1 run with no new topic queues nothing (the nightly scan covers known topics)', async () => {
    await syncK1Topics([sedia([topic('HORIZON-OLD-02')])]);
    h.enqueue.mockClear();

    await syncK1Topics([sedia([topic('HORIZON-OLD-02')])]);

    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it('a queue that cannot be reached does not fail the K1 run: topics still land', async () => {
    h.enqueue.mockImplementation(async () => {
      throw new Error('connect ECONNREFUSED');
    });

    const out = await syncK1Topics([sedia([topic('HORIZON-NEW-04')])]);

    expect(out.inserted).toBe(1);
    expect(h.topics.has('HORIZON-NEW-04')).toBe(true);
  });
});

describe('partner-search job: payload → ingestor trigger', () => {
  it('the K1 payload runs the ingestor INCREMENTAL over those topics', async () => {
    await partnerSearchTask({ trigger: 'INCREMENTAL', topicIdentifiers: ['HORIZON-NEW-01', 42, 'HORIZON-NEW-02'] }, helpers());

    expect(h.ingest).toHaveBeenCalledWith({ trigger: 'INCREMENTAL', topicIdentifiers: ['HORIZON-NEW-01', 'HORIZON-NEW-02'] });
  });

  it('the 03:00 cron tick runs a FULL scan over every open topic (no topic list)', async () => {
    await partnerSearchTask({ _cron: { ts: '2026-11-01T03:00:00.000Z' } }, helpers());

    expect(h.ingest).toHaveBeenCalledWith({ trigger: 'FULL', topicIdentifiers: undefined });
  });

  it('a hand-queued run without a trigger is MANUAL', async () => {
    await partnerSearchTask({}, helpers());

    expect(h.ingest).toHaveBeenCalledWith({ trigger: 'MANUAL', topicIdentifiers: undefined });
  });

  it('the nightly run is scheduled once a day, so a FULL scan is never more than 24 h away', () => {
    const job = SCHEDULE.find((j) => j.id === 'partner-search');
    expect(job?.cron).toBe('0 3 * * *');
    // A missed tick is caught up within the fill window and raises an alert.
    expect(job?.missedTickAlert).toBe(true);
  });
});
