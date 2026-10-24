import { describe, expect, it } from 'vitest';
import {
  WITHDRAW_AFTER_MISSED_SCANS,
  announcementChanged,
  orgTypeFor,
  planTopicWrite,
  suspectEmptyScan,
} from '@/modules/m1/server/partner-search/ingestor';
import { retentionCutoffs } from '@/modules/m1/server/partner-search/retention';

const NOW = new Date('2026-10-22T03:00:00.000Z');
const YESTERDAY = new Date('2026-10-21T03:00:00.000Z');

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
      { externalId: 'a', kind: 'create', missedScans: 0, withdrawnAt: null, missedScanAt: null },
      { externalId: 'b', kind: 'create', missedScans: 0, withdrawnAt: null, missedScanAt: null },
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
      missedScanAt: NOW,
    });
    expect(withdrawn).toEqual([]);
  });

  it('two consecutive absent scans withdraw the row', () => {
    expect(WITHDRAW_AFTER_MISSED_SCANS).toBe(2);
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: [],
      stored: [{ externalId: 'gone', withdrawnAt: null, missedScans: 1, missedScanAt: YESTERDAY }],
      now: NOW,
    });
    expect(withdrawn).toEqual(['gone']);
    expect(writes).toEqual([{ externalId: 'gone', kind: 'update', missedScans: 2, withdrawnAt: NOW, missedScanAt: NOW }]);
  });

  it('a row seen again resets its miss counter and is un-withdrawn', () => {
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: ['back'],
      stored: [{ externalId: 'back', withdrawnAt: new Date('2026-10-20T00:00:00Z'), missedScans: 2 }],
      now: NOW,
    });
    expect(withdrawn).toEqual([]);
    expect(writes).toEqual([{ externalId: 'back', kind: 'update', missedScans: 0, withdrawnAt: null, missedScanAt: null }]);
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

describe('planTopicWrite: one counted miss per UTC day (FO-60 review 2)', () => {
  it('a second run on the same day does not count the same gap again', () => {
    const { writes, withdrawn } = planTopicWrite({
      seenExternalIds: [],
      stored: [{ externalId: 'gone', withdrawnAt: null, missedScans: 1, missedScanAt: new Date('2026-10-22T02:00:00.000Z') }],
      now: NOW,
    });
    expect(withdrawn).toEqual([]);
    expect(writes).toEqual([
      { externalId: 'gone', kind: 'update', missedScans: 1, withdrawnAt: null, missedScanAt: new Date('2026-10-22T02:00:00.000Z') },
    ]);
  });

  it('the second miss on a later day withdraws the row', () => {
    const { withdrawn } = planTopicWrite({
      seenExternalIds: [],
      stored: [{ externalId: 'gone', withdrawnAt: null, missedScans: 1, missedScanAt: YESTERDAY }],
      now: NOW,
    });
    expect(withdrawn).toEqual(['gone']);
  });
});

describe('planTopicWrite: rows the portal moved between topics', () => {
  it('an externalId that exists under another topic is an update, not a create', () => {
    const { writes } = planTopicWrite({
      seenExternalIds: ['moved'],
      stored: [],
      elsewhereExternalIds: ['moved'],
      now: NOW,
    });
    expect(writes).toEqual([{ externalId: 'moved', kind: 'update', missedScans: 0, withdrawnAt: null, missedScanAt: null }]);
  });
});

describe('announcementChanged (FO-60 review 6: updated counts real changes only)', () => {
  const stored = {
    type: 'EXPERTISE_OFFER' as const,
    description: 'Looking for a partner',
    publishedAt: YESTERDAY,
    organizationName: 'Org',
    organizationType: 'OTH' as const,
    country: 'BE',
    organizationPic: '100000000',
    topicIdentifier: 'T',
    withdrawnAt: null,
  };

  it('the same fields, even as a different Date instance, are not a change', () => {
    expect(announcementChanged(stored, { ...stored, publishedAt: new Date(YESTERDAY) })).toBe(false);
  });

  it.each([
    ['description', { description: 'Changed' }],
    ['organisation name', { organizationName: 'Org renamed' }],
    ['publication date', { publishedAt: NOW }],
    ['PIC match', { organizationPic: null }],
    ['withdrawal lifted', { withdrawnAt: NOW }],
  ])('a changed %s is a change', (_label, patch) => {
    expect(announcementChanged(stored, { ...stored, ...patch })).toBe(true);
  });
});

describe('suspectEmptyScan (FO-60 review 4: an empty scan is not a withdrawal)', () => {
  it('no rows while live announcements are stored is suspect', () => {
    expect(suspectEmptyScan(0, [{ withdrawnAt: null }, { withdrawnAt: null }])).toBe(true);
  });

  it('no rows and nothing live stored is an ordinary empty topic', () => {
    expect(suspectEmptyScan(0, [])).toBe(false);
    expect(suspectEmptyScan(0, [{ withdrawnAt: YESTERDAY }])).toBe(false);
  });

  it('any row seen is never suspect', () => {
    expect(suspectEmptyScan(1, [{ withdrawnAt: null }])).toBe(false);
  });
});

describe('retentionCutoffs (FO-65 F4)', () => {
  it('closed topics keep 90 days, withdrawn rows 30', () => {
    expect(retentionCutoffs(NOW)).toEqual({
      closedBefore: new Date('2026-07-24T03:00:00.000Z'),
      withdrawnBefore: new Date('2026-09-22T03:00:00.000Z'),
    });
  });

  it('refuses an invalid date instead of deleting without a bound', () => {
    expect(() => retentionCutoffs(new Date('nope'))).toThrow(RangeError);
  });
});
