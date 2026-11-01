import { describe, expect, it } from 'vitest';
import { READINESS_QUESTIONS, type AnswerValue, type ReadinessAnswers } from './questions';
import { getPublicSectorProgramme, isOpenToTurkishApplicants } from '@/lib/public-sector/catalog';
import {
  LEVEL_THRESHOLDS,
  READINESS_ORG_TYPES,
  levelFor,
  recommendProgrammes,
  scoreReadiness,
  type RecommendableProgramme,
} from './score';

/** Every question answered with the same value. */
function all(value: AnswerValue): ReadinessAnswers {
  return Object.fromEntries(READINESS_QUESTIONS.map((q) => [q.id, value]));
}

/** A hand-made catalogue, so the matcher's rules are tested apart from the real data. */
function prog(key: string, over: Partial<Omit<RecommendableProgramme, 'key'>> = {}): RecommendableProgramme {
  return {
    key,
    name: { tr: key, en: key },
    sourceKey: null,
    sediaTopicPattern: null,
    eligibleOrgTypes: ['municipality'],
    difficulty: 2,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: true,
    needsPartners: 'none',
    turkeyEligibility: 'eligible',
    turkeyRegions: null,
    plainTr: '',
    officialUrl: 'https://example.org',
    sourceNote: [],
    ...over,
  };
}

const MUNI = { orgType: 'municipality' } as const;

const FAKE_CATALOG: RecommendableProgramme[] = [
  prog('hard-a', {
    difficulty: 3,
    cofinancingPct: 40,
    needsPartners: 'transnational',
  }),
  prog('easy-a', {
    difficulty: 1,
    cofinancingPct: 0,
    needsPartners: 'transnational',
  }),
  prog('mid-a', {
    difficulty: 2,
    cofinancingPct: 20,
    needsPartners: 'national',
  }),
  prog('easy-b', {
    difficulty: 1,
    cofinancingPct: null,
    needsPartners: 'none',
  }),
  prog('hard-b', {
    difficulty: 3,
    cofinancingPct: 45,
    needsPartners: 'transnational',
  }),
  prog('agency-only', {
    difficulty: 1,
    eligibleOrgTypes: ['development_agency'],
  }),
];

describe('scoreReadiness — totals and levels', () => {
  it('zero readiness scores 0, level baslangic, and every question is a critical gap', () => {
    const r = scoreReadiness(all(0), 'municipality', { catalog: FAKE_CATALOG });
    expect(r.total0to100).toBe(0);
    expect(r.level).toBe('baslangic');
    expect(Object.values(r.byDimension)).toEqual([0, 0, 0, 0, 0]);
    expect(r.gaps).toHaveLength(15);
    expect(r.gaps.every((g) => g.severity === 'critical')).toBe(true);
    // The PIC gap carries the official register link.
    expect(r.gaps.find((g) => g.questionId === 'pic')?.guideUrl).toMatch(/^https:\/\/ec\.europa\.eu\//);
  });

  it('full readiness scores 100, level hazir, no gaps', () => {
    const r = scoreReadiness(all(2), 'municipality', { catalog: FAKE_CATALOG });
    expect(r.total0to100).toBe(100);
    expect(r.level).toBe('hazir');
    expect(Object.values(r.byDimension)).toEqual([100, 100, 100, 100, 100]);
    expect(r.gaps).toEqual([]);
  });

  it('all-1 answers score 50 (gelisen) with 15 improve gaps', () => {
    const r = scoreReadiness(all(1), 'municipality', { catalog: FAKE_CATALOG });
    expect(r.total0to100).toBe(50);
    expect(r.level).toBe('gelisen');
    expect(r.gaps.every((g) => g.severity === 'improve')).toBe(true);
  });

  it('level boundaries sit exactly on the thresholds', () => {
    expect(levelFor(LEVEL_THRESHOLDS.gelisen - 1)).toBe('baslangic');
    expect(levelFor(LEVEL_THRESHOLDS.gelisen)).toBe('gelisen');
    expect(levelFor(LEVEL_THRESHOLDS.hazir - 1)).toBe('gelisen');
    expect(levelFor(LEVEL_THRESHOLDS.hazir)).toBe('hazir');
  });

  it('12 of 30 points is 40 → gelisen; 11 of 30 is 37 → baslangic', () => {
    const ids = READINESS_QUESTIONS.map((q) => q.id);
    const twelve: ReadinessAnswers = Object.fromEntries(ids.map((id, i) => [id, i < 6 ? 2 : 0]));
    expect(scoreReadiness(twelve, 'municipality', { catalog: FAKE_CATALOG })).toMatchObject({
      total0to100: 40,
      level: 'gelisen',
    });
    const eleven: ReadinessAnswers = { ...twelve, [ids[0]!]: 1 };
    expect(scoreReadiness(eleven, 'municipality', { catalog: FAKE_CATALOG })).toMatchObject({
      total0to100: 37,
      level: 'baslangic',
    });
  });

  it('an unanswered question counts as 0, not as a crash', () => {
    const r = scoreReadiness({ pic: 2 }, 'municipality', {
      catalog: FAKE_CATALOG,
    });
    expect(r.total0to100).toBe(7);
    expect(r.byDimension.registration).toBe(33);
    expect(r.gaps).toHaveLength(14);
  });

  it('critical gaps come before improve gaps, question order kept inside each group', () => {
    const answers: ReadinessAnswers = {
      ...all(2),
      pic: 1,
      data: 0,
      cofinancing: 0,
      lear: 1,
    };
    const r = scoreReadiness(answers, 'municipality', {
      catalog: FAKE_CATALOG,
    });
    expect(r.gaps.map((g) => `${g.severity}:${g.questionId}`)).toEqual([
      'critical:cofinancing',
      'critical:data',
      'improve:pic',
      'improve:lear',
    ]);
  });

  it('is deterministic — same input, same output', () => {
    const a = { ...all(1), pic: 2 as const };
    expect(scoreReadiness(a, 'municipality', { catalog: FAKE_CATALOG })).toEqual(
      scoreReadiness(a, 'municipality', { catalog: FAKE_CATALOG }),
    );
  });
});

describe('recommendProgrammes — matcher rules', () => {
  it('low readiness is steered to the easy programmes first', () => {
    expect(recommendProgrammes(all(0), MUNI, 'baslangic', FAKE_CATALOG)).toEqual([
      'easy-b',
      'easy-a',
      'mid-a',
    ]);
  });

  it('full readiness is pointed at the large (hard) programmes', () => {
    const rec = recommendProgrammes(all(2), MUNI, 'hazir', FAKE_CATALOG);
    expect(rec.slice(0, 2)).toEqual(['hard-a', 'hard-b']);
    expect(rec).toHaveLength(3);
  });

  it('never recommends a programme the org type is not eligible for', () => {
    expect(recommendProgrammes(all(0), MUNI, 'baslangic', FAKE_CATALOG)).not.toContain('agency-only');
    expect(recommendProgrammes(all(0), { orgType: 'development_agency' }, 'baslangic', FAKE_CATALOG)).toEqual(
      ['agency-only'],
    );
  });

  it('missing transnational partners pushes a transnational programme down', () => {
    const noAbroad = { ...all(2), twinCity: 0 as const, network: 0 as const };
    const catalog = [
      prog('abroad', { difficulty: 3, needsPartners: 'transnational' }),
      prog('home', { difficulty: 3, needsPartners: 'none' }),
    ];
    expect(recommendProgrammes(noAbroad, MUNI, 'hazir', catalog)).toEqual(['home', 'abroad']);
    expect(recommendProgrammes(all(2), MUNI, 'hazir', catalog)).toEqual(['abroad', 'home']);
  });

  it('co-financing only up to ~20% pushes a 40% programme below a 20% one', () => {
    const answers = { ...all(2), cofinancing: 1 as const };
    const catalog = [prog('forty', { cofinancingPct: 40 }), prog('twenty', { cofinancingPct: 20 })];
    expect(recommendProgrammes(answers, MUNI, 'gelisen', catalog)).toEqual(['twenty', 'forty']);
  });
});

describe('recommendProgrammes — Türkiye eligibility and territory', () => {
  const catalog = [
    prog('closed-to-tr', { difficulty: 1, turkeyEligibility: 'not_eligible' }),
    prog('samsun-only', { difficulty: 1, turkeyRegions: ['Samsun', 'Tokat'] }),
    prog('whole-tr', { difficulty: 1 }),
    prog('per-call', { difficulty: 1, turkeyEligibility: 'check_call' }),
  ];

  it('never recommends a programme Türkiye does not participate in', () => {
    expect(recommendProgrammes(all(0), MUNI, 'baslangic', catalog)).not.toContain('closed-to-tr');
  });

  it('a territorial programme needs a province inside its area', () => {
    expect(recommendProgrammes(all(0), MUNI, 'baslangic', catalog)).toEqual(['whole-tr', 'per-call']);
    expect(recommendProgrammes(all(0), { ...MUNI, province: 'İzmir' }, 'baslangic', catalog)).not.toContain(
      'samsun-only',
    );
    expect(recommendProgrammes(all(0), { ...MUNI, province: 'Samsun' }, 'baslangic', catalog)).toEqual([
      'samsun-only',
      'whole-tr',
      'per-call',
    ]);
  });
});

describe('scoreReadiness — against the real public-sector catalogue', () => {
  it('zero readiness in Samsun → the easy entry routes (OKA, National Agency, Erasmus+), never CERV/LIFE', () => {
    const r = scoreReadiness(all(0), 'municipality', { province: 'Samsun' });
    expect(r.recommended).toEqual([
      'oka-financial-support',
      'ulusal-ajans-decentralised',
      'erasmus-ka2-partnerships',
    ]);
  });

  it('zero readiness without a province → National Agency and Erasmus+ first, no territorial programme', () => {
    const r = scoreReadiness(all(0), 'municipality');
    expect(r.recommended.slice(0, 2)).toEqual(['ulusal-ajans-decentralised', 'erasmus-ka2-partnerships']);
    expect(r.recommended).not.toContain('oka-financial-support');
  });

  it('full readiness → the large Horizon programmes, led by the Cities Mission', () => {
    const r = scoreReadiness(all(2), 'metropolitan');
    expect(r.recommended[0]).toBe('cities-mission');
    expect(r.recommended).toHaveLength(3);
    for (const key of r.recommended) {
      expect(getPublicSectorProgramme(key)?.difficulty).toBe(3);
    }
  });

  it('no org type or level ever gets a programme closed to Türkiye', () => {
    for (const orgType of READINESS_ORG_TYPES) {
      for (const v of [0, 1, 2] as const) {
        const rec = scoreReadiness(all(v), orgType, {
          province: 'Samsun',
        }).recommended;
        expect(rec.length).toBeGreaterThan(0);
        for (const key of rec) {
          const p = getPublicSectorProgramme(key);
          expect(p && isOpenToTurkishApplicants(p)).toBe(true);
          expect(p?.eligibleOrgTypes).toContain(orgType);
        }
      }
    }
  });
});
