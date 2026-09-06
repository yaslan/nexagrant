import { describe, it, expect } from 'vitest';
import { SediaAdapter } from '../src/lib/adapters/sedia';
import { EurostarsAdapter } from '../src/lib/adapters/eurostars';
import { TubitakAdapter } from '../src/lib/adapters/tubitak';

/**
 * Live integration tests — they hit the real upstream endpoints.
 *
 * Off by default so CI never depends on the network or on the EC portal being up.
 * The offline coverage of the same behaviour lives in `tests/k1-adapters.test.ts`.
 * Run them with:  RUN_LIVE_ADAPTER_TESTS=1 pnpm test
 */
const live = describe.skipIf(!process.env.RUN_LIVE_ADAPTER_TESTS);

live('K1 Adapters', () => {
  describe('SediaAdapter', () => {
    it('should return empty array on fetch failure gracefully', async () => {
      const adapter = new SediaAdapter();
      const topics = await adapter.fetchTopics({ maxPages: 1, pageSize: 5 });
      expect(Array.isArray(topics)).toBe(true);
    }, 30000);

    it('SediaTopicSchema should validate topic structure', async () => {
      const adapter = new SediaAdapter();
      const result = await adapter.searchSedia({ pageSize: 1, maxPages: 1 });

      if (result.topics.length > 0) {
        const topic = result.topics[0];
        expect(topic).toHaveProperty('identifier');
        expect(topic).toHaveProperty('title');
        expect(['FORTHCOMING', 'OPEN', 'CLOSED']).toContain(topic.status);
      }
    }, 30000);
  });

  describe('EurostarsAdapter', () => {
    it('should initialize and return array', async () => {
      const adapter = new EurostarsAdapter();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    }, 30000);
  });

  describe('TubitakAdapter', () => {
    it('should initialize and return array', async () => {
      const adapter = new TubitakAdapter();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    }, 30000);
  });
});
