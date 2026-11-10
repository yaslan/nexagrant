import { describe, it, expect } from 'vitest';
import {
  extractG0Features,
  isCountryEligible,
  isFilledSeat,
  isNoHistoryPartner,
  isPartnerRole,
  keywordCoverageScore,
  topicPrefixOf,
  type G0Snapshot,
} from '../src/lib/scoring/g0-features';
import { scoreG0, decideG0 } from '../src/lib/scoring/g0-canonical';
import { DEFAULT_SCORING_WEIGHTS } from '../src/lib/scoring/defaults';

/**
 * A snapshot with every source present. Individual tests strip what they want to be absent, so a
 * test that asserts "missing X scores 0" cannot accidentally be missing Y as well.
 */
function fullSnapshot(overrides: Partial<G0Snapshot> = {}): G0Snapshot {
  return {
    tenant: { country: 'TR', pic: 'PIC-1' },
    profile: { keywords: ['hydrogen', 'district heating', 'digital twin'] },
    topic: {
      id: 'topic-1',
      identifier: 'HORIZON-CL5-2026-09-D4-01',
      keywords: ['hydrogen', 'district heating'],
      isLumpSum: true,
      isTwoStage: false,
      budgetPerProjectCents: 5_000_000_00,
      eligibility: { restricted: null, countriesExcluded: [] },
    },
    topicFitScore: 82,
    baseRatePct: 12,
    intendedRole: 'coordinator',
    seats: [
      { roleKey: 'research', status: 'CONFIRMED' },
      { roleKey: 'end_user', status: 'CONFIRMED' },
    ],
    cordis: { coordinationsInTopicFamily: 2, coordinationsOverall: 5, distinctCollaborators: 18, participationsOverall: 9 },
    ...overrides,
  };
}

/** Everything a brand-new opportunity with no linked topic and no imported data looks like. */
function emptySnapshot(): G0Snapshot {
  return {
    tenant: { country: null, pic: null },
    profile: null,
    topic: null,
    topicFitScore: null,
    baseRatePct: null,
    intendedRole: null,
    seats: [],
    cordis: null,
  };
}

describe('topicPrefixOf()', () => {
  it('drops the trailing topic number', () => {
    expect(topicPrefixOf('HORIZON-CL5-2026-09-D4-01')).toBe('HORIZON-CL5-2026-09-D4');
  });

  it('leaves an identifier with no separator alone', () => {
    expect(topicPrefixOf('EUROSTARS')).toBe('EUROSTARS');
  });
});

describe('keywordCoverageScore()', () => {
  it('measures how much of the topic the profile covers, not the other way round', () => {
    // The profile has four keywords, the topic two, and both topic keywords are covered: 100.
    expect(keywordCoverageScore(['a', 'b', 'c', 'd'], ['a', 'b'])).toBe(100);
  });

  it('scores partial coverage', () => {
    expect(keywordCoverageScore(['a'], ['a', 'b', 'c', 'd'])).toBe(25);
  });

  it('is case and whitespace insensitive', () => {
    expect(keywordCoverageScore([' Hydrogen '], ['hydrogen'])).toBe(100);
  });

  it('returns null (not 0) when there is nothing to compare', () => {
    expect(keywordCoverageScore([], ['a'])).toBeNull();
    expect(keywordCoverageScore(['a'], [])).toBeNull();
  });
});

describe('isCountryEligible()', () => {
  it('accepts an EU country on an EU/EEA/CH-restricted call', () => {
    expect(isCountryEligible('DE', { restricted: 'EU_EEA_CH_ONLY' }).eligible).toBe(true);
  });

  it('refuses an associated country on an EU/EEA/CH-restricted call', () => {
    const result = isCountryEligible('TR', { restricted: 'EU_EEA_CH_ONLY' });
    expect(result.eligible).toBe(false);
    expect(result.note).toContain('EU/EEA/CH only');
  });

  it('honours the per-call exclusion list ahead of the restriction', () => {
    expect(isCountryEligible('DE', { restricted: null, countriesExcluded: ['DE'] }).eligible).toBe(false);
  });

  it('is eligible when the call carries no restriction at all', () => {
    expect(isCountryEligible('TR', null).eligible).toBe(true);
  });

  it('refuses a tenant with no country on file rather than assuming one', () => {
    expect(isCountryEligible(null, null).eligible).toBe(false);
  });
});

describe('extractG0Features()', () => {
  it('reports full coverage and every source as measured when everything is on file', () => {
    const { coverage, sources } = extractG0Features(fullSnapshot());
    expect(coverage).toBe(1);
    expect(sources.filter((s) => s.status === 'missing')).toHaveLength(0);
  });

  it('scores nothing and reports zero coverage for an opportunity with no evidence', () => {
    const { features, coverage, sources } = extractG0Features(emptySnapshot());
    expect(coverage).toBe(0);
    expect(Object.values(features).every((v) => v === 0)).toBe(true);
    expect(sources.every((s) => s.status === 'missing')).toBe(true);
  });

  it('prefers the K1 topic match over the keyword fallback for alignment', () => {
    const { features, sources } = extractG0Features(fullSnapshot({ topicFitScore: 40 }));
    expect(features.alignment).toBe(40);
    expect(sources.find((s) => s.feature === 'alignment')?.source).toBe('TopicMatch.fitScore');
  });

  it('falls back to keyword coverage when there is no topic match, and says so', () => {
    const { features, sources } = extractG0Features(fullSnapshot({ topicFitScore: null }));
    // Both topic keywords are in the profile → 100.
    expect(features.alignment).toBe(100);
    expect(sources.find((s) => s.feature === 'alignment')?.source).toContain('TenantProfile.keywords');
  });

  it('maps the base rate through the canonical curve and mirrors it into the hard facts', () => {
    const { features, facts } = extractG0Features(fullSnapshot({ baseRatePct: 10 }));
    expect(features.baseRate).toBe(50); // full marks at 20 %
    expect(facts.baseRatePct).toBe(10);
  });

  it('leaves the base rate hard fact at 0 when no success rate is imported', () => {
    const { features, facts, sources } = extractG0Features(fullSnapshot({ baseRatePct: null }));
    expect(features.baseRate).toBe(0);
    expect(facts.baseRatePct).toBe(0);
    expect(sources.find((s) => s.feature === 'baseRatePct')?.status).toBe('missing');
  });

  it('gives full coordinator marks at three coordinations in the topic family', () => {
    const s = fullSnapshot({
      cordis: { coordinationsInTopicFamily: 3, coordinationsOverall: 3, distinctCollaborators: 0, participationsOverall: 3 },
    });
    expect(extractG0Features(s).features.coordinatorHistory).toBe(100);
  });

  it('caps coordination outside the topic family at half marks', () => {
    const s = fullSnapshot({
      cordis: { coordinationsInTopicFamily: 0, coordinationsOverall: 12, distinctCollaborators: 0, participationsOverall: 12 },
    });
    expect(extractG0Features(s).features.coordinatorHistory).toBe(50);
  });

  it('splits the research/end-user feature evenly between the two seat roles', () => {
    const both = extractG0Features(fullSnapshot()).features.researchAndEndUser;
    const researchOnly = extractG0Features(
      fullSnapshot({ seats: [{ roleKey: 'research', status: 'CONFIRMED' }] }),
    ).features.researchAndEndUser;
    expect(both).toBe(100);
    expect(researchOnly).toBe(50);
  });

  it('gives no research/end-user marks for OPEN seats: no partner is attached yet (FO-382)', () => {
    const s = fullSnapshot({
      seats: [
        { roleKey: 'research', status: 'OPEN' },
        { roleKey: 'end_user', status: 'OPEN' },
      ],
    });
    const { features, sources } = extractG0Features(s);
    expect(features.researchAndEndUser).toBe(0);
    // Missing, not measured: no seat has a named organisation, so there is no evidence about the
    // research / end-user roles. Scored 0 either way; only the coverage changes (FO-382 review, B2).
    expect(sources.find((x) => x.feature === 'researchAndEndUser')?.status).toBe('missing');
  });

  // NG-59, patron K-579082 = A: the general G0 score counts only CONFIRMED seats. A candidate or an
  // invitee has not agreed to join yet, so it earns nothing (it used to earn the full 6 points).
  it('scores a CONFIRMED seat', () => {
    const s = fullSnapshot({ seats: [{ roleKey: 'research', status: 'CONFIRMED' }] });
    expect(extractG0Features(s).features.researchAndEndUser).toBe(50);
  });

  it.each(['CANDIDATE', 'INVITED', 'OPEN', 'DECLINED'])('gives no research/end-user marks for a %s seat (K-579082)', (status) => {
    const s = fullSnapshot({
      seats: [
        { roleKey: 'research', status },
        { roleKey: 'end_user', status },
      ],
    });
    const { features, sources } = extractG0Features(s);
    expect(features.researchAndEndUser).toBe(0);
    // No confirmed partner is no evidence on the roles: missing, as for OPEN (FO-382 review, B2).
    expect(sources.find((x) => x.feature === 'researchAndEndUser')?.status).toBe('missing');
  });

  it('counts only the confirmed seat when an invited one sits next to it (K-579082)', () => {
    const s = fullSnapshot({
      seats: [
        { roleKey: 'research', status: 'CONFIRMED' },
        { roleKey: 'end_user', status: 'INVITED' },
      ],
    });
    expect(extractG0Features(s).features.researchAndEndUser).toBe(50);
  });

  it('reads the seat status case- and space-insensitively, as the no-history gate does', () => {
    const s = fullSnapshot({ seats: [{ roleKey: 'research', status: ' confirmed ' }] });
    expect(extractG0Features(s).features.researchAndEndUser).toBe(50);
  });

  it('does not count a declined seat as a partner', () => {
    const s = fullSnapshot({
      seats: [
        { roleKey: 'research', status: 'CONFIRMED' },
        { roleKey: 'end_user', status: 'DECLINED' },
      ],
    });
    expect(extractG0Features(s).features.researchAndEndUser).toBe(50);
  });

  it('reads a coordinator budget slice more strictly than a partner one', () => {
    // €5m project: coordinator takes 20 % = €1m, partner takes 10 % = €500k.
    const asCoordinator = extractG0Features(fullSnapshot({ intendedRole: 'coordinator' })).features
      .budgetRoleEconomy;
    const asPartner = extractG0Features(fullSnapshot({ intendedRole: 'partner' })).features
      .budgetRoleEconomy;
    expect(asPartner).toBe(100); // €500k is past the €450k partner ceiling
    expect(asCoordinator).toBeLessThan(100); // €1m sits inside the €400k–€1.2m coordinator band
    expect(asCoordinator).toBeGreaterThan(0);
  });

  it('scores 0 for a budget too small to be worth the role', () => {
    const s = fullSnapshot({
      intendedRole: 'coordinator',
      topic: { ...fullSnapshot().topic!, budgetPerProjectCents: 500_000_00 },
    });
    // 20 % of €500k = €100k, below the €400k coordinator floor.
    expect(extractG0Features(s).features.budgetRoleEconomy).toBe(0);
  });

  it('adds lump sum and two stage as 50 each', () => {
    const base = fullSnapshot().topic!;
    const neither = extractG0Features(
      fullSnapshot({ topic: { ...base, isLumpSum: false, isTwoStage: false } }),
    );
    const both = extractG0Features(
      fullSnapshot({ topic: { ...base, isLumpSum: true, isTwoStage: true } }),
    );
    expect(neither.features.lumpSumTwoStage).toBe(0);
    expect(both.features.lumpSumTwoStage).toBe(100);
    // "Neither flag set" is a real measurement, unlike "no topic at all".
    expect(neither.sources.find((s) => s.feature === 'lumpSumTwoStage')?.status).toBe('measured');
  });

  it('drops the weight of a missing source out of coverage rather than guessing a value', () => {
    // No CORDIS → coordinatorHistory (15) and networkCentrality (10) unmeasured out of 100.
    const { coverage, features } = extractG0Features(fullSnapshot({ cordis: null }));
    expect(coverage).toBe(0.75);
    expect(features.coordinatorHistory).toBe(0);
    expect(features.networkCentrality).toBe(0);
  });

  it('is deterministic: the same snapshot always produces the same score', () => {
    const snapshot = fullSnapshot();
    const first = extractG0Features(snapshot);
    const second = extractG0Features(fullSnapshot());
    expect(second.features).toEqual(first.features);
    expect(scoreG0(second.features)).toBe(scoreG0(first.features));
    // Ten more runs, in case anything ever reaches for a clock or a random number.
    for (let i = 0; i < 10; i++) {
      expect(scoreG0(extractG0Features(fullSnapshot()).features)).toBe(scoreG0(first.features));
    }
  });
});

// ───────────────────────── FO-382: partner with no CORDIS history ─────────────────────────

describe('partner with no CORDIS history (FO-382)', () => {
  const noHistory = { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 };

  it('excludes coordinatorHistory and networkCentrality for a partner with a measured empty CORDIS record', () => {
    const ex = extractG0Features(fullSnapshot({ intendedRole: 'partner', cordis: noHistory }));
    expect(ex.scoringBasis).toBe('no_history_evidence');
    expect(ex.excludedFeatures).toEqual(['coordinatorHistory', 'networkCentrality']);
  });

  it('keeps the standard basis for a coordinator with no CORDIS history (coordinator rule unchanged)', () => {
    const ex = extractG0Features(fullSnapshot({ intendedRole: 'coordinator', cordis: noHistory }));
    expect(ex.scoringBasis).toBe('standard');
    expect(ex.excludedFeatures).toEqual([]);
  });

  it('keeps the standard basis when the intended role is unset: the rule never applies to null', () => {
    const ex = extractG0Features(fullSnapshot({ intendedRole: null, cordis: noHistory }));
    expect(ex.scoringBasis).toBe('standard');
  });

  it('keeps the standard basis when CORDIS data is missing (empty table), so a data gap is not read as no history', () => {
    const ex = extractG0Features(fullSnapshot({ intendedRole: 'partner', cordis: null }));
    expect(ex.scoringBasis).toBe('standard');
    expect(ex.excludedFeatures).toEqual([]);
  });

  it('keeps the standard basis for a partner who has any CORDIS participation', () => {
    const ex = extractG0Features(
      fullSnapshot({
        intendedRole: 'partner',
        cordis: { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 1 },
      }),
    );
    expect(ex.scoringBasis).toBe('standard');
  });

  it('leaves excluded features out of coverage instead of counting them as measured', () => {
    // Partner, no history, no seats or topic budget: the two excluded features (25) and the
    // other unmeasured ones must not inflate coverage. Only the excluded pair is removed here.
    const ex = extractG0Features(
      fullSnapshot({ intendedRole: 'partner', cordis: noHistory, seats: [] }),
    );
    // Scored: alignment 30, baseRate 15, researchAndEndUser 12 (missing), budget 10, lumpSum 8
    // measured = 30+15+10+8 = 63 of 75 scored weight.
    expect(ex.coverage).toBeCloseTo(63 / 75, 2);
  });

  it('scores the same evidence on the 75-point denominator: the excluded score is the standard score × 100/75', () => {
    const snap = fullSnapshot({ intendedRole: 'partner', cordis: noHistory });
    const std = scoreG0(extractG0Features(snap).features, undefined);
    // Standard: the two excluded features contribute 0 (no history), so only the denominator moves.
    const excludedWeights = { ...DEFAULT_SCORING_WEIGHTS, coordinatorHistory: 0, networkCentrality: 0 };
    const excl = scoreG0(extractG0Features(snap).features, excludedWeights);
    expect(excl).toBeCloseTo(std * (100 / 75), 1);
  });
});

// ───────────────────────── FO-382 hard rule: no history needs a filled seat ─────────────────────────

describe('FO-382 normalisation: status and role spelling', () => {
  const noHistory = { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 };

  it.each(['invited', ' Candidate ', 'confirmed'])('counts the seat status %j as filled (M7)', (status) => {
    expect(isFilledSeat({ status })).toBe(true);
  });

  it.each([' Partner ', 'PARTNER', 'partner'])('applies the no-history rule to the role %j (M10)', (role) => {
    expect(isNoHistoryPartner({ intendedRole: role, cordis: noHistory })).toBe(true);
    const ex = extractG0Features(fullSnapshot({ intendedRole: role, cordis: noHistory }));
    expect(ex.scoringBasis).toBe('no_history_evidence');
  });

  // FO-382 review B4: the compute path (`g0-compute.ts`, record lookup) and the scorer share this one
  // helper, so a spelling that breaks one breaks both and is caught here.
  it.each([' Partner ', 'PARTNER', 'partner'])('isPartnerRole accepts %j', (role) => {
    expect(isPartnerRole(role)).toBe(true);
  });

  it.each(['coordinator', 'partners', '', null])('isPartnerRole rejects %j', (role) => {
    expect(isPartnerRole(role)).toBe(false);
  });
});

describe('no-history partner needs a filled seat (FO-382 hard rule)', () => {
  const noHistory = { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 };
  const partner = (seats: G0Snapshot['seats']) => fullSnapshot({ intendedRole: 'partner', cordis: noHistory, seats });

  it('refuses a no-history partner with no seats at all (84 was passing this before)', () => {
    const ex = extractG0Features(partner([]));
    expect(ex.filledSeats).toBe(0);
    expect(ex.facts.noHistoryWithoutFilledSeat).toBe(true);
  });

  it.each(['OPEN', 'DECLINED'])('refuses a no-history partner whose only seat is %s', (status) => {
    const ex = extractG0Features(partner([{ roleKey: 'research', status }]));
    expect(ex.filledSeats).toBe(0);
    expect(ex.facts.noHistoryWithoutFilledSeat).toBe(true);
  });

  it.each(['CANDIDATE', 'INVITED', 'CONFIRMED'])('lets a no-history partner through with one %s seat', (status) => {
    const ex = extractG0Features(partner([{ roleKey: 'research', status }]));
    expect(ex.filledSeats).toBe(1);
    expect(ex.facts.noHistoryWithoutFilledSeat).toBe(false);
  });

  // K-576980 stays as it was: the no-history rule still takes a candidate or an invitee. Only the
  // general score changed (K-579082), so the same seat lets the partner through and scores nothing.
  it.each(['CANDIDATE', 'INVITED'])('a %s seat satisfies the no-history rule but earns no score (K-576980 + K-579082)', (status) => {
    const ex = extractG0Features(partner([{ roleKey: 'research', status }]));
    expect(ex.filledSeats).toBe(1);
    expect(ex.facts.noHistoryWithoutFilledSeat).toBe(false);
    expect(ex.features.researchAndEndUser).toBe(0);
  });

  it('counts only filled seats: an OPEN seat next to a DECLINED one is still zero', () => {
    const ex = extractG0Features(
      partner([
        { roleKey: 'research', status: 'OPEN' },
        { roleKey: 'end_user', status: 'DECLINED' },
      ]),
    );
    expect(ex.filledSeats).toBe(0);
    expect(ex.facts.noHistoryWithoutFilledSeat).toBe(true);
  });

  it('never fires for a coordinator, an unset role, or a partner with CORDIS history', () => {
    const coord = extractG0Features(fullSnapshot({ intendedRole: 'coordinator', cordis: noHistory, seats: [] }));
    const unset = extractG0Features(fullSnapshot({ intendedRole: null, cordis: noHistory, seats: [] }));
    const hasHistory = extractG0Features(
      fullSnapshot({
        intendedRole: 'partner',
        cordis: { ...noHistory, participationsOverall: 2 },
        seats: [],
      }),
    );
    expect(coord.facts.noHistoryWithoutFilledSeat).toBe(false);
    expect(unset.facts.noHistoryWithoutFilledSeat).toBe(false);
    expect(hasHistory.facts.noHistoryWithoutFilledSeat).toBe(false);
  });

  it('the decision carries the rule as a refusal reason and a code; the other rules are untouched', () => {
    const ex = extractG0Features(partner([]));
    const refused = decideG0(ex.features, ex.facts, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(refused.decision).toBe('NO_GO');
    expect(refused.reasonDetails.map((r) => r.code)).toContain('G0_NO_HISTORY_NO_FILLED_SEAT');

    const withSeat = extractG0Features(partner([{ roleKey: 'research', status: 'INVITED' }]));
    const passed = decideG0(withSeat.features, withSeat.facts, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(passed.reasonDetails.map((r) => r.code)).not.toContain('G0_NO_HISTORY_NO_FILLED_SEAT');
  });
});
