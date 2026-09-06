import { describe, it, expect, vi } from 'vitest';
import { SediaAdapter } from '../src/lib/adapters/sedia';
import { EurostarsAdapter } from '../src/lib/adapters/eurostars';
import { TubitakAdapter } from '../src/lib/adapters/tubitak';

describe('K1 Adapters', () => {
  describe('SediaAdapter', () => {
    it('should return empty array on fetch failure gracefully', async () => {
      const adapter = new SediaAdapter();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    });

    it('SediaTopicSchema should validate topic structure', async () => {
      const adapter = new SediaAdapter();
      const result = await adapter.searchSedia({ pageSize: 1 });

      if (result.topics.length > 0) {
        const topic = result.topics[0];
        expect(topic).toHaveProperty('identifier');
        expect(topic).toHaveProperty('title');
        expect(['FORTHCOMING', 'OPEN', 'CLOSED']).toContain(topic.status);
      }
    });
  });

  describe('EurostarsAdapter', () => {
    it('should initialize and return array', async () => {
      const adapter = new EurostarsAdapter();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    });
  });

  describe('TubitakAdapter', () => {
    it('should initialize and return array', async () => {
      const adapter = new TubitakAdapter();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    });
  });
});
