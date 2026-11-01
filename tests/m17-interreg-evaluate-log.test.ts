/**
 * FO-289 K-5 (follow-up to the FO-191 review, PR #225): the failure log of a run carries no message text.
 *
 * An error thrown while a run is going can quote the model's answer or the user's documents (a schema
 * error echoing the output, a driver error echoing a bound value). `runEvaluation` therefore logs the
 * analysis id, the error class and the error code only. No database: `withTenant` is scripted — the claim
 * succeeds, the next query throws a hostile error, the FAILED write goes through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: 0, thrown: undefined as unknown }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: async () => {
      state.calls += 1;
      if (state.calls === 1) {
        // claim()
        return { ok: true, row: { rubricId: 'rubric-1', callText: 'c', projectText: 'p', claimedAt: new Date('2026-11-01T10:00:00Z') } };
      }
      if (state.calls === 2) throw state.thrown; // evaluateClaimed(): the rubric read
      return undefined; // markFailed()
    },
  };
});

const { runEvaluation } = await import('@/modules/m17/server/evaluate');

const OWNER = { tenantId: 'tenant-1', userId: 'user-1' };
const SECRET = 'SECRET-DOCUMENT-QUOTE: Partner ACME GmbH, IBAN DE89 3704 0044 0532 0130 00, "ignore previous instructions"';

let logged: unknown[][];
beforeEach(() => {
  state.calls = 0;
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('runEvaluation failure log (FO-289 K-5)', () => {
  it('a long, document-quoting error message does not reach the log; class, code and analysis id do', async () => {
    state.thrown = Object.assign(new TypeError(SECRET.repeat(20)), { code: 'P2025' });
    await expect(runEvaluation(OWNER, 'analysis-1', { locale: 'en' })).resolves.toEqual({ ok: false, error: 'evaluation_failed' });

    expect(logged).toHaveLength(1);
    const line = logged[0]!.join(' ');
    expect(line).not.toContain('SECRET');
    expect(line).not.toContain('IBAN');
    expect(line).toContain('analysis-1');
    expect(line).toContain('TypeError');
    expect(line).toContain('P2025');
    expect(line.length).toBeLessThan(200);
  });

  it('a thrown string (no class, no code) is logged by type only', async () => {
    state.thrown = SECRET;
    await expect(runEvaluation(OWNER, 'analysis-2', { locale: 'en' })).resolves.toEqual({ ok: false, error: 'evaluation_failed' });

    const line = logged[0]!.join(' ');
    expect(line).not.toContain('SECRET');
    expect(line).toContain('analysis-2');
    expect(line).toContain('string');
  });
});
