import { describe, it, expect } from 'vitest';
import { SediaAdapter } from '../src/lib/adapters/sedia';

/**
 * Live integration tests — they hit the real upstream endpoints.
 *
 * Off by default so CI never depends on the network or on the EC portal being up.
 * The offline coverage of the same behaviour lives in `tests/k1-adapters.test.ts`.
 * Run them with:  RUN_LIVE_ADAPTER_TESTS=1 pnpm test
 */
const live = describe.skipIf(!process.env.RUN_LIVE_ADAPTER_TESTS);

live('SediaAdapter & Live SEDIA Search API', () => {
  it('should query live SEDIA API and return topics matching search term', async () => {
    const adapter = new SediaAdapter();
    const result = await adapter.searchSedia({
      text: 'climate',
      pageSize: 5,
      maxPages: 1,
    });

    expect(result).toBeDefined();
    expect(result.totalResults).toBeGreaterThan(0);
    expect(Array.isArray(result.topics)).toBe(true);
    expect(result.topics.length).toBeGreaterThan(0);

    const firstTopic = result.topics[0];
    expect(firstTopic).toBeDefined();
    expect(firstTopic?.identifier).toBeDefined();
    expect(firstTopic?.title).toBeDefined();
    expect(['FORTHCOMING', 'OPEN', 'CLOSED']).toContain(firstTopic?.status);
  }, 10000);

  it('should format framework programme filters correctly', async () => {
    const adapter = new SediaAdapter();
    // 43108390 = Horizon Europe
    const result = await adapter.searchSedia({
      frameworkProgrammes: ['43108390'],
      pageSize: 3,
      maxPages: 1,
    });

    expect(result).toBeDefined();
    expect(result.topics.length).toBeGreaterThan(0);
  }, 10000);
});
