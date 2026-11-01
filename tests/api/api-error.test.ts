/**
 * TASK-MUNY0O53ITDU4 — `internalError()`, the only builder of a 5xx body.
 *
 * The runtime half checks the response. The type half is the point: each
 * `@ts-expect-error` below is a way a thrown value used to reach a 500 body,
 * and `tsc --noEmit` (which covers tests/) fails if any of them type-checks.
 */
import { describe, test, expect } from 'vitest';
import { internalError } from '@/lib/api-error';

describe('internalError()', () => {
  test('defaults to 500 { error: internal_error }', async () => {
    const res = internalError();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });

  test('takes literal fields, a 5xx status, headers and the named ids', async () => {
    const res = internalError(
      { success: false, error: 'import_failed' },
      { status: 503, headers: { 'Retry-After': '30' }, ids: { runId: 'run-42' } }
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toEqual({ success: false, error: 'import_failed', runId: 'run-42' });
  });
});

/** Never called: it only has to type-check (or, where marked, not). */
export function typeLevelChecks(err: Error, s: string, n: number, flag: boolean) {
  internalError({ error: flag ? 'a' : 'b', retryable: true, code: 42 });
  // @ts-expect-error — an error's message is `string`, not a literal
  internalError({ error: err.message });
  // @ts-expect-error — the stack carries file paths
  internalError({ error: err.stack });
  // @ts-expect-error — String(err) is `string`
  internalError({ error: String(err) });
  // @ts-expect-error — a template with a run-time part is not a literal
  internalError({ error: `failed: ${s}` });
  // @ts-expect-error — the thrown value itself
  internalError({ error: err });
  // @ts-expect-error — a number computed at run time
  internalError({ error: 'x', length: n });
  // @ts-expect-error — `boolean` rather than a written `true`/`false`
  internalError({ error: 'x', retryable: flag });
  const body = { error: s };
  // @ts-expect-error — a body built beforehand is still `string` inside
  internalError(body);
  // @ts-expect-error — a 4xx is not an internal error
  internalError({ error: 'x' }, { status: 400 });
  // @ts-expect-error — only runId / requestId may carry a run-time value
  internalError({ error: 'x' }, { ids: { detail: s } });
}
