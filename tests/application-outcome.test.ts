import { describe, expect, test } from 'vitest';
import type { OppStatus } from '@prisma/client';

import { nextApplicationStatus } from '../src/lib/k5-pipeline/applicationOutcome';

/**
 * FB KAMU B7 (TASK-MULRRU63LWC6E) — the declaration state machine, without a database.
 * The funnel only stays a funnel if a result can never exist without a submission.
 */
describe('nextApplicationStatus', () => {
  test('ACTIVE → submitted → SUBMITTED', () => {
    expect(nextApplicationStatus('ACTIVE', false, 'submitted')).toEqual({ status: 'SUBMITTED' });
  });

  test('a result before a submission is refused', () => {
    expect(nextApplicationStatus('ACTIVE', false, 'accepted')).toEqual({ refused: 'NOT_SUBMITTED' });
    expect(nextApplicationStatus('ACTIVE', false, 'rejected')).toEqual({ refused: 'NOT_SUBMITTED' });
  });

  test('SUBMITTED → accepted / rejected', () => {
    expect(nextApplicationStatus('SUBMITTED', true, 'accepted')).toEqual({ status: 'FUNDED' });
    expect(nextApplicationStatus('SUBMITTED', true, 'rejected')).toEqual({ status: 'REJECTED' });
  });

  test('a recorded result can be corrected to the other result', () => {
    expect(nextApplicationStatus('FUNDED', true, 'rejected')).toEqual({ status: 'REJECTED' });
    expect(nextApplicationStatus('REJECTED', true, 'accepted')).toEqual({ status: 'FUNDED' });
  });

  test('declaring submitted again after a result is refused (it would erase the result)', () => {
    for (const s of ['FUNDED', 'REJECTED'] as OppStatus[]) {
      expect(nextApplicationStatus(s, true, 'submitted')).toEqual({ refused: 'ALREADY_DECIDED' });
    }
  });

  test('repeating the current declaration is a no-op, not an error', () => {
    expect(nextApplicationStatus('SUBMITTED', true, 'submitted')).toEqual({ status: 'SUBMITTED' });
    expect(nextApplicationStatus('FUNDED', true, 'accepted')).toEqual({ status: 'FUNDED' });
  });

  test('a withdrawn opportunity takes no declaration', () => {
    for (const d of ['submitted', 'accepted', 'rejected'] as const) {
      expect(nextApplicationStatus('WITHDRAWN', true, d)).toEqual({ refused: 'WITHDRAWN' });
    }
  });
});
