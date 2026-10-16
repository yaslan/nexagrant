import { describe, expect, test, vi, beforeEach } from 'vitest';

/**
 * TASK-MVBBPXU1ZW0F5 (FO-5) — unit level: the topic-prefix validator and the
 * mapping around the raw query. The SQL itself (prefix match, role filter,
 * de-duplication, ordering) runs against Postgres in
 * tests/cordis-coordinator-leaders.live.test.ts; a mock cannot show that.
 */

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/db', () => ({ prisma: { $queryRaw: queryRaw } }));

import { cordisTopicPrefixSchema, coordinatorLeadersQuerySchema } from '../src/lib/k2-cordis/api-query';
import { coordinatorLeaders, COORDINATOR_LEADERS_MAX_LIMIT } from '../src/lib/k2-cordis/coordinator-leaders';

describe('cordisTopicPrefixSchema', () => {
  test('accepts a CORDIS topic-code prefix and upper-cases it', () => {
    expect(cordisTopicPrefixSchema.parse('HORIZON-CL5-')).toBe('HORIZON-CL5-');
    expect(cordisTopicPrefixSchema.parse(' horizon-cl5- ')).toBe('HORIZON-CL5-');
  });

  test('refuses a prefix shorter than 3 characters', () => {
    expect(cordisTopicPrefixSchema.safeParse('').success).toBe(false);
    expect(cordisTopicPrefixSchema.safeParse('H').success).toBe(false);
    expect(cordisTopicPrefixSchema.safeParse('HO').success).toBe(false);
  });

  test('refuses LIKE metacharacters and anything outside [A-Z0-9-]', () => {
    expect(cordisTopicPrefixSchema.safeParse('HORIZON%').success).toBe(false);
    expect(cordisTopicPrefixSchema.safeParse('HORIZON_CL').success).toBe(false);
    expect(cordisTopicPrefixSchema.safeParse("HOR'; DROP").success).toBe(false);
    expect(cordisTopicPrefixSchema.safeParse('HORIZON CL5').success).toBe(false);
  });

  test('refuses a prefix longer than 40 characters', () => {
    expect(cordisTopicPrefixSchema.safeParse('A'.repeat(41)).success).toBe(false);
  });
});

describe('coordinatorLeadersQuerySchema', () => {
  test('requires topicPrefix and defaults limit to 20', () => {
    expect(coordinatorLeadersQuerySchema.safeParse({}).success).toBe(false);
    const ok = coordinatorLeadersQuerySchema.parse({ topicPrefix: 'HORIZON-CL5-' });
    expect(ok.limit).toBe(20);
    expect(ok.country).toBeUndefined();
  });

  test('clamps limit to 1–50 and rejects non-digit limits', () => {
    expect(coordinatorLeadersQuerySchema.parse({ topicPrefix: 'HORIZON-CL5-', limit: '999' }).limit).toBe(50);
    expect(coordinatorLeadersQuerySchema.parse({ topicPrefix: 'HORIZON-CL5-', limit: '0' }).limit).toBe(1);
    expect(coordinatorLeadersQuerySchema.safeParse({ topicPrefix: 'HORIZON-CL5-', limit: 'zz' }).success).toBe(false);
  });

  test('country must be two letters and is upper-cased', () => {
    expect(coordinatorLeadersQuerySchema.parse({ topicPrefix: 'HORIZON-CL5-', country: 'de' }).country).toBe('DE');
    expect(coordinatorLeadersQuerySchema.safeParse({ topicPrefix: 'HORIZON-CL5-', country: 'DEU' }).success).toBe(false);
  });
});

describe('coordinatorLeaders', () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  test('maps the raw row to the typed row, keeping the euro total exact as bigint', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        organisationId: '999984059',
        name: 'FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.',
        shortName: 'Fraunhofer-Gesellschaft',
        country: 'DE',
        coordinatedProjects: 3,
        totalEcContribution: '12345678901234567890',
      },
    ]);
    const rows = await coordinatorLeaders({ topicPrefix: 'HORIZON-CL5-', limit: 10 });
    expect(rows).toEqual([
      {
        organisationId: '999984059',
        name: 'FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.',
        shortName: 'Fraunhofer-Gesellschaft',
        country: 'DE',
        coordinatedProjects: 3,
        totalEcContribution: 12345678901234567890n,
      },
    ]);
  });

  test('passes the prefix as a LIKE pattern and a null country when none is given', async () => {
    queryRaw.mockResolvedValueOnce([]);
    await coordinatorLeaders({ topicPrefix: 'HORIZON-CL5-', limit: 10 });
    const values = queryRaw.mock.calls[0]!.slice(1);
    expect(values).toContain('HORIZON-CL5-%');
    expect(values).toContain(null);
    expect(values).toContain(10);
  });

  test('passes the country filter through when given', async () => {
    queryRaw.mockResolvedValueOnce([]);
    await coordinatorLeaders({ topicPrefix: 'HORIZON-CL5-', limit: 10, country: 'DE' });
    const values = queryRaw.mock.calls[0]!.slice(1);
    expect(values).toContain('DE');
  });

  test('caps limit at the maximum even when a caller passes more', async () => {
    queryRaw.mockResolvedValueOnce([]);
    await coordinatorLeaders({ topicPrefix: 'HORIZON-CL5-', limit: 500 });
    const values = queryRaw.mock.calls[0]!.slice(1);
    expect(values).toContain(COORDINATOR_LEADERS_MAX_LIMIT);
  });
});
