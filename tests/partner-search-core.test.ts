import { describe, expect, it } from 'vitest';
import {
  WITHDRAW_AFTER_MISSED_SCANS,
  orgTypeFor,
  planTopicWrite,
} from '@/modules/m1/server/partner-search/ingestor';

const NOW = new Date('2026-10-22T03:00:00.000Z');

describe('orgTypeFor', () => {
  it.each([
    ['Research Organisation', 'REC'],
    ['Higher or Secondary Education Establishment', 'HES'],
    ['Private for-profit entities (excluding Higher or Secondary Education Establishments)', 'PRC'],
    ['Public body', 'PUB'],
    ['Non-profit organisation', 'OTH'],
    ['', 'OTH'],
    [null, 'OTH'],
    [undefined, 'OTH'],
  ])('%j → %s', (raw, expected) => {
    expect(orgTypeFor(raw)).toBe(expected);
  });
});

describe('planTopicWrite', () => {
  it('creates rows the scan has never seen and leaves none withdrawn', () => {
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: ['a', 'b'],
      stored: [],
      now: NOW,
    });
    expect(writes).toEqual([
      { externalId: 'a', kind: 'create', missedScans: 0, withdrawnAt: null },
      { externalId: 'b', kind: 'create', missedScans: 0, withdrawnAt: null },
    ]);
    expect(withdrawn).toEqual([]);
  });

  it('one absent scan is a miss, not a withdrawal', () => {
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: ['a'],
      stored: [
        { externalId: 'a', withdrawnAt: null, missedScans: 0 },
        { externalId: 'gone', withdrawnAt: null, missedScans: 0 },
      ],
      now: NOW,
    });
    expect(writes.find((w) => w.externalId === 'gone')).toEqual({
      externalId: 'gone',
      kind: 'update',
      missedScans: 1,
      withdrawnAt: null,
    });
    expect(withdrawn).toEqual([]);
  });

  it('two consecutive absent scans withdraw the row', () => {
    expect(WITHDRAW_AFTER_MISSED_SCANS).toBe(2);
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: [],
      stored: [{ externalId: 'gone', withdrawnAt: null, missedScans: 1 }],
      now: NOW,
    });
    expect(withdrawn).toEqual(['gone']);
    expect(writes).toEqual([{ externalId: 'gone', kind: 'update', missedScans: 2, withdrawnAt: NOW }]);
  });

  it('a row seen again resets its miss counter and is un-withdrawn', () => {
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: ['back'],
      stored: [{ externalId: 'back', withdrawnAt: new Date('2026-10-20T00:00:00Z'), missedScans: 2 }],
      now: NOW,
    });
    expect(withdrawn).toEqual([]);
    expect(writes).toEqual([{ externalId: 'back', kind: 'update', missedScans: 0, withdrawnAt: null }]);
  });

  it('an already-withdrawn row is not counted again', () => {
    const past = new Date('2026-10-20T00:00:00Z');
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: [],
      stored: [{ externalId: 'old', withdrawnAt: past, missedScans: 2 }],
      now: NOW,
    });
    expect(writes).toEqual([]);
    expect(withdrawn).toEqual([]);
  });
});
