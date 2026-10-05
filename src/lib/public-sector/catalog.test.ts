import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  PUBLIC_SECTOR_ORG_TYPES,
  PUBLIC_SECTOR_PROGRAMMES,
  coversTurkishProvince,
  getPublicSectorProgramme,
  isOpenToTurkishApplicants,
  matchesSediaTopic,
} from './catalog';

const nonEmpty = z.string().trim().min(1);

const ProgrammeSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.object({ tr: nonEmpty, en: nonEmpty }),
    sourceKey: nonEmpty.nullable(),
    sediaTopicPattern: nonEmpty.nullable(),
    eligibleOrgTypes: z.array(z.enum(PUBLIC_SECTOR_ORG_TYPES)).min(1),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    typicalGrantEur: z
      .object({
        minCents: z.number().int().positive().nullable(),
        maxCents: z.number().int().positive().nullable(),
        currency: z.literal('EUR'),
      })
      .nullable(),
    cofinancingPct: z.number().min(0).max(100).nullable(),
    needsPic: z.boolean(),
    needsPartners: z.enum(['none', 'national', 'transnational']),
    turkeyEligibility: z.enum(['eligible', 'partial', 'not_eligible', 'check_call']),
    turkeyRegions: z.array(nonEmpty).min(1).nullable(),
    plainTr: nonEmpty,
    officialUrl: z.string().url().startsWith('https://'),
    sourceNote: z
      .array(
        z.object({
          url: z.string().url().startsWith('https://'),
          accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          note: nonEmpty,
        })
      )
      .min(1),
  })
  .strict();

describe('PUBLIC_SECTOR_PROGRAMMES', () => {
  it('every entry satisfies the catalogue schema', () => {
    for (const p of PUBLIC_SECTOR_PROGRAMMES) {
      const r = ProgrammeSchema.safeParse(p);
      expect(r.success, `${p.key}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('keys are unique', () => {
    const keys = PUBLIC_SECTOR_PROGRAMMES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries the programmes the card requires', () => {
    const keys = new Set(PUBLIC_SECTOR_PROGRAMMES.map((p) => p.key));
    for (const k of [
      'cerv-town-twinning',
      'cerv-networks-of-towns',
      'erasmus-ka2-partnerships',
      'life',
      'cities-mission',
      'new-european-bauhaus',
      'dut-partnership',
      'interreg-ipa-bulgaria-turkiye',
      'interreg-next-black-sea-basin',
      'ulusal-ajans-decentralised',
      'oka-financial-support',
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it('a SEDIA pattern exists exactly when there is a SEDIA source, and compiles', () => {
    for (const p of PUBLIC_SECTOR_PROGRAMMES) {
      expect(p.sediaTopicPattern === null, p.key).toBe(p.sourceKey === null);
      if (p.sediaTopicPattern) expect(() => new RegExp(p.sediaTopicPattern!)).not.toThrow();
    }
  });

  it('a grant range never runs backwards', () => {
    for (const p of PUBLIC_SECTOR_PROGRAMMES) {
      const r = p.typicalGrantEur;
      if (r?.minCents != null && r.maxCents != null) {
        expect(r.minCents, p.key).toBeLessThanOrEqual(r.maxCents);
      }
    }
  });

  it('plainTr stays short: 2–3 sentences', () => {
    for (const p of PUBLIC_SECTOR_PROGRAMMES) {
      const sentences = p.plainTr.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
      expect(sentences, p.key).toBeGreaterThanOrEqual(2);
      expect(sentences, p.key).toBeLessThanOrEqual(3);
    }
  });
});

describe('Türkiye eligibility facts', () => {
  it('CERV and LIFE are not open to Turkish applicants (official country lists)', () => {
    for (const k of ['cerv-town-twinning', 'cerv-networks-of-towns', 'life']) {
      const p = getPublicSectorProgramme(k)!;
      expect(isOpenToTurkishApplicants(p), k).toBe(false);
      expect(p.plainTr, k).toMatch(/Türkiye/);
    }
  });

  it('Horizon Europe and Erasmus+ entries are open', () => {
    for (const k of ['cities-mission', 'new-european-bauhaus', 'erasmus-ka2-partnerships']) {
      expect(isOpenToTurkishApplicants(getPublicSectorProgramme(k)!), k).toBe(true);
    }
  });

  it('Samsun is inside Black Sea Basin and OKA, outside Bulgaria–Türkiye', () => {
    expect(coversTurkishProvince(getPublicSectorProgramme('interreg-next-black-sea-basin')!, 'Samsun')).toBe(true);
    expect(coversTurkishProvince(getPublicSectorProgramme('oka-financial-support')!, 'samsun')).toBe(true);
    expect(coversTurkishProvince(getPublicSectorProgramme('interreg-ipa-bulgaria-turkiye')!, 'Samsun')).toBe(false);
    expect(coversTurkishProvince(getPublicSectorProgramme('cities-mission')!, 'Samsun')).toBe(true);
  });
});

describe('matchesSediaTopic', () => {
  const p = (k: string) => getPublicSectorProgramme(k)!;

  it('routes real SEDIA identifiers to the right programme', () => {
    expect(matchesSediaTopic(p('cerv-town-twinning'), 'CERV-2026-CITIZENS-TOWN-TT')).toBe(true);
    expect(matchesSediaTopic(p('cerv-town-twinning'), 'CERV-2026-CITIZENS-TOWN-NT')).toBe(false);
    expect(matchesSediaTopic(p('cerv-networks-of-towns'), 'CERV-2026-CITIZENS-TOWN-NT')).toBe(true);
    expect(matchesSediaTopic(p('life'), 'LIFE-2026-SAP-ENV-GOV')).toBe(true);
    expect(matchesSediaTopic(p('life'), 'LIFE-2026-CET-ENERCOM')).toBe(true);
    expect(matchesSediaTopic(p('life'), 'LIFE-2026-NGO-OG-SGA')).toBe(false);
    expect(matchesSediaTopic(p('cities-mission'), 'HORIZON-MISS-2027-04-CIT-01')).toBe(true);
    expect(matchesSediaTopic(p('cities-mission'), 'HORIZON-MISS-2027-07-CLIMA-CIT-NEB-01')).toBe(true);
    expect(matchesSediaTopic(p('cities-mission'), 'HORIZON-MISS-2027-03-OCEAN-01')).toBe(false);
    expect(matchesSediaTopic(p('new-european-bauhaus'), 'HORIZON-NEB-2026-01-REGEN-01')).toBe(true);
    expect(matchesSediaTopic(p('dut-partnership'), 'HORIZON-NEB-2026-01-REGEN-01')).toBe(false);
  });
});
