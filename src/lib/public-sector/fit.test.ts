import { describe, expect, it } from 'vitest';
import { getPublicSectorProgramme } from './catalog';
import { assessFit, requiredChecks, type FitAnswers } from './fit';

const ALL_YES: FitAnswers = { hasPic: true, hasPartner: true, canCofinance: true };
const ALL_NO: FitAnswers = { hasPic: false, hasPartner: false, canCofinance: false };
const p = (k: string) => getPublicSectorProgramme(k)!;

describe('requiredChecks', () => {
  it('asks only what the programme needs', () => {
    // HE mission: PIC + transnational partners, 0% co-financing for public bodies.
    expect(requiredChecks(p('cities-mission'))).toEqual(['pic', 'partner']);
    // OKA: no PIC, no partners, rate unknown -> co-financing still asked.
    expect(requiredChecks(p('oka-financial-support'))).toEqual(['cofinancing']);
  });
});

describe('assessFit', () => {
  it('all needed answers yes -> fit', () => {
    expect(assessFit(p('cities-mission'), ALL_YES)).toEqual({ verdict: 'fit', gaps: [] });
  });

  it('a missing requirement -> prepare, with the gaps named', () => {
    expect(assessFit(p('cities-mission'), { ...ALL_YES, hasPic: false })).toEqual({
      verdict: 'prepare',
      gaps: ['pic'],
    });
    expect(assessFit(p('cities-mission'), ALL_NO)).toEqual({ verdict: 'prepare', gaps: ['pic', 'partner'] });
  });

  it('an answer the programme does not need never blocks', () => {
    // 0% co-financing: "cannot co-finance" is irrelevant.
    expect(assessFit(p('new-european-bauhaus'), { ...ALL_YES, canCofinance: false }).verdict).toBe('fit');
  });

  it('unknown co-financing rate is treated as required, not as free', () => {
    expect(assessFit(p('oka-financial-support'), { ...ALL_YES, canCofinance: false })).toEqual({
      verdict: 'prepare',
      gaps: ['cofinancing'],
    });
  });

  it('a programme Türkiye does not take part in is never "fit"', () => {
    expect(assessFit(p('cerv-town-twinning'), ALL_YES)).toEqual({ verdict: 'not_eligible', gaps: [] });
  });
});
