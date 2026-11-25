import { describe, expect, test } from 'vitest';
import {
  EVIDENCE_OBJECT_REMOVAL_RETRY_WAITS_MS as WAITS,
  objectRemovalDecision,
  type ObjectRemovalAttempt,
} from '@/lib/evidence-scan';

/** NG-279: when is the removal of an infected file's object tried (again)? */
const T0 = new Date('2026-11-25T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const failed = (ms: number): ObjectRemovalAttempt => ({ objectDeleted: false, at: at(ms) });
const deleted = (ms: number): ObjectRemovalAttempt => ({ objectDeleted: true, at: at(ms) });

describe('objectRemovalDecision (NG-279)', () => {
  test('no recorded outcome: due now, no failures', () => {
    expect(objectRemovalDecision([], T0)).toEqual({ due: true, failures: 0, firstFailureAt: null });
  });

  test('the last outcome deleted the object: never due again', () => {
    expect(objectRemovalDecision([deleted(0)], at(365 * 86_400_000))).toEqual({ due: false, why: 'removed' });
    expect(objectRemovalDecision([failed(0), deleted(WAITS[0])], at(365 * 86_400_000))).toEqual({ due: false, why: 'removed' });
  });

  test('one failure: waits the first wait, then due', () => {
    expect(objectRemovalDecision([failed(0)], at(WAITS[0] - 1))).toEqual({ due: false, why: 'waiting', nextAt: at(WAITS[0]) });
    expect(objectRemovalDecision([failed(0)], at(WAITS[0]))).toEqual({ due: true, failures: 1, firstFailureAt: T0 });
  });

  test('the wait grows with each failure and stops at the last one', () => {
    let clock = 0;
    const history: ObjectRemovalAttempt[] = [failed(0)];
    for (let n = 1; n <= WAITS.length + 3; n++) {
      const wait = WAITS[Math.min(n, WAITS.length) - 1]!;
      expect(objectRemovalDecision(history, at(clock + wait - 1)).due, `failure ${n}, 1 ms early`).toBe(false);
      expect(objectRemovalDecision(history, at(clock + wait)), `failure ${n}`).toEqual({ due: true, failures: n, firstFailureAt: T0 });
      clock += wait;
      history.push(failed(clock));
    }
    expect(WAITS[WAITS.length - 1]).toBe(24 * 60 * 60_000);
  });
});
