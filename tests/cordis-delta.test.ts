import { describe, test, expect, vi } from 'vitest';
import { fetchLiveCordisDelta, getCordisLiveStreamLogs } from '../src/lib/cordis-delta';

vi.mock('../src/lib/db', () => ({
  prisma: {
    organization: {
      upsert: vi.fn().mockResolvedValue({ id: 'org-delta-1' }),
    },
    document: {
      create: vi.fn().mockResolvedValue({ id: 'doc-delta-1' }),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  },
}));

describe('Boşluk 3: CORDIS Live Delta API Ingestion Engine', () => {
  test('fetchLiveCordisDelta queries EU Portal API and indexes delta project vectors', async () => {
    const res = await fetchLiveCordisDelta(7);

    expect(res.success).toBe(true);
    expect(res.sinceDays).toBe(7);
    expect(res.deltaCount).toBeGreaterThan(0);
    expect(res.totalNewGrantEUR).toBeGreaterThan(0);
    expect(res.ingestedProjects[0].acronym).toBeDefined();
  });

  test('getCordisLiveStreamLogs returns recent delta sync audit trail', async () => {
    const logs = await getCordisLiveStreamLogs();

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].status).toBe('COMPLETED');
  });
});
