/**
 * FO-281 K-2 (follow-up to the FO-191 review, PR #225): `claim()` refuses an invalid clock.
 *
 * An Invalid Date turns `callTextExpiresAt: { gt: now }` into a filter that matches nothing, so every
 * analysis would answer `not_ready` with no hint why. `claim()` therefore throws before it opens a
 * transaction. The where-guard exception for `evaluate.ts gt: now` (tests/where-guard-src.test.ts)
 * rests on this check; this test is what keeps that exception honest.
 *
 * No database: `withTenant` is replaced by a spy that must stay uncalled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ withTenantCalls: 0 }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: async () => {
      state.withTenantCalls += 1;
      throw new Error('withTenant must not be reached with an invalid clock');
    },
  };
});

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm')>();
  // The credit pre-check runs before the claim; give the tenant plenty so the run reaches it.
  return { ...actual, getCreditBalance: async () => 1_000_000 };
});

const { runEvaluation } = await import('@/modules/m17/server/evaluate');

const OWNER = { tenantId: 'tenant-1', userId: 'user-1' };

beforeEach(() => {
  state.withTenantCalls = 0;
});

describe('claim() clock check (FO-191 B4, FO-281 K-2)', () => {
  it('an Invalid Date `now` throws before any query, instead of answering not_ready', async () => {
    await expect(runEvaluation(OWNER, 'analysis-1', { locale: 'en', now: new Date(Number.NaN) })).rejects.toThrow(
      'claim: now must be a valid Date',
    );
    expect(state.withTenantCalls).toBe(0);
  });

  it('a valid `now` gets past the check (the spy is reached, so the check is not simply always throwing)', async () => {
    await expect(runEvaluation(OWNER, 'analysis-1', { locale: 'en', now: new Date('2026-10-31T12:00:00Z') })).rejects.toThrow(
      'withTenant must not be reached',
    );
    expect(state.withTenantCalls).toBe(1);
  });
});
