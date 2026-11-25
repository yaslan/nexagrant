import { afterEach, beforeEach } from 'vitest';
import { DEFAULT_GATE_RULES } from '../../src/lib/scoring/defaults';

/**
 * NG-364: the G1 letter-of-intent rule ships off (owner decision 25.11.2026) until the NG-20 Phase 2
 * screen lets people enter letters. Suites that test the rule itself set it explicitly with this,
 * so their expectations do not depend on the shipped default. Returns the restore function.
 */
export function setLetterOfIntentRule(on: boolean): () => void {
  const before = DEFAULT_GATE_RULES.G1.requireLetterOfIntentForCriticalSeats;
  DEFAULT_GATE_RULES.G1.requireLetterOfIntentForCriticalSeats = on;
  return () => {
    DEFAULT_GATE_RULES.G1.requireLetterOfIntentForCriticalSeats = before;
  };
}

/** Turns the rule on for every test of the enclosing `describe` (or file) and restores it after each. */
export function withLetterOfIntentRule(on: boolean): void {
  let restore: (() => void) | undefined;
  beforeEach(() => {
    restore = setLetterOfIntentRule(on);
  });
  afterEach(() => {
    restore?.();
    restore = undefined;
  });
}
