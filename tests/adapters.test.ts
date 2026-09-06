import { describe, it, expect } from 'vitest';
import { EurostarsTopicSchema, EurostarsAdapter } from '../src/lib/adapters/eurostars';
import { TubitakTopicSchema, TubitakAdapter } from '../src/lib/adapters/tubitak';
import { SediaTopicSchema } from '../src/lib/adapters/sedia';

describe('K1 Topic Adapters - Schema Validation', () => {
  describe('EurostarsTopicSchema', () => {
    it('should validate a minimal Eurostars topic', () => {
      const topic = {
        identifier: 'EUROSTARS-2026-01',
        title: 'Eurostars Call 2026-01',
        status: 'OPEN' as const,
        isLumpSum: false,
        isTwoStage: true,
        deadlines: [{
          stage: 1,
          at: '2026-09-15T17:00:00Z',
          tz: 'Europe/Brussels'
        }],
        eligibility: {
          restricted: null,
          countriesExcluded: []
        },
        keywords: ['research', 'innovation'],
        description: 'Eurostars research call'
      };

      const result = EurostarsTopicSchema.safeParse(topic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.identifier).toBe('EUROSTARS-2026-01');
        expect(result.data.status).toBe('OPEN');
      }
    });

    it('should fill defaults for optional fields', () => {
      const minimal = {
        identifier: 'ES-2026',
        title: 'Test',
        status: 'FORTHCOMING' as const,
      };

      const result = EurostarsTopicSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isLumpSum).toBe(false);
        expect(result.data.isTwoStage).toBe(false);
        expect(result.data.deadlines).toEqual([]);
        expect(result.data.keywords).toEqual([]);
      }
    });
  });

  describe('TubitakTopicSchema', () => {
    it('should validate a minimal TÜBİTAK topic', () => {
      const topic = {
        identifier: 'TUBITAK-2026-1',
        title: 'TÜBİTAK Call 2026-1',
        status: 'OPEN' as const,
        isLumpSum: false,
        isTwoStage: false,
        deadlines: [{
          stage: 1,
          at: '2026-10-31T20:00:00Z',
          tz: 'Europe/Istanbul'
        }],
        eligibility: {
          restricted: 'TR',
          countriesExcluded: [],
          notes: 'Turkish institutions eligible'
        },
        keywords: ['tubitak', 'research'],
        description: 'TÜBİTAK research call'
      };

      const result = TubitakTopicSchema.safeParse(topic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.identifier).toBe('TUBITAK-2026-1');
        expect(result.data.eligibility.restricted).toBe('TR');
      }
    });
  });

  describe('SediaTopicSchema', () => {
    it('should validate a SEDIA topic', () => {
      const topic = {
        identifier: 'HORIZON-CL5-2026-09-D4-01',
        title: 'Climate adaptation and resilience',
        status: 'OPEN' as const,
        typeOfAction: 'RIA',
        callIdentifier: 'HORIZON-CL5-2026-09',
        isLumpSum: false,
        isTwoStage: true,
        deadlines: [{
          stage: 1,
          at: '2026-09-15T17:00:00Z',
          tz: 'Europe/Brussels'
        }],
        eligibility: {
          restricted: null,
          countriesExcluded: []
        },
        keywords: ['climate', 'adaptation'],
        description: 'Support for climate resilience projects'
      };

      const result = SediaTopicSchema.safeParse(topic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callIdentifier).toBe('HORIZON-CL5-2026-09');
      }
    });
  });

  describe('Adapter implementations', () => {
    it('EurostarsAdapter should initialize', async () => {
      const adapter = new EurostarsAdapter();
      expect(adapter).toBeDefined();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    });

    it('TubitakAdapter should initialize', async () => {
      const adapter = new TubitakAdapter();
      expect(adapter).toBeDefined();
      const topics = await adapter.fetchTopics();
      expect(Array.isArray(topics)).toBe(true);
    });
  });
});
