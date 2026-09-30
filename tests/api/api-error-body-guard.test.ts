/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-2) — source guard.
 *
 * A route's 500 body used to be `errorMessage(error)`: whatever the thrown value
 * said, which for Prisma is the query shape with table and column names. The
 * detail belongs in the server log; the body is a fixed code.
 *
 * İNCELEME-70 Y-1 (TASK-MUNVVMJDEO932) widened the pattern list; İNCELEME-75
 * D-1 (TASK-MUNY0O53ITDU4) then got 13 more shapes past it, and the GDPR routes
 * leaked through one of them in production code (`{ status }` from a variable,
 * the text arriving through an action's `{ error }`). A pattern list cannot be
 * finished, so the rule is now positive: a response whose status is, or might
 * be, 5xx is only ever built by `internalError()`, whose fields must be
 * literals (see src/lib/api-error.ts and tests/api/api-error.test.ts). What a
 * hand-built 5xx body contains is no longer a question the guard has to answer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, test, expect } from 'vitest';
import { catchReturnLeaks, unguardedServerErrors } from './response-status-scan';

const ROOT = resolve(__dirname, '../..');
const APP_DIR = join(ROOT, 'src/app');
const SRC_DIR = join(ROOT, 'src');
/** The one file allowed to build a 5xx response. */
const HELPER = join(ROOT, 'src/lib/api-error.ts');

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, keep);
    return keep(name) ? [full] : [];
  });
}

const isSource = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);
const routeFiles = () => walk(APP_DIR, (name) => name === 'route.ts');
/** Route handlers and every helper outside src/app that can build a response for one. */
const responseBuilders = () => [
  ...routeFiles(),
  ...walk(SRC_DIR, isSource).filter(
    (f) => !f.startsWith(APP_DIR) && f !== HELPER && /\b(?:NextResponse|Response)\b/.test(readFileSync(f, 'utf8'))
  ),
];
/** Server actions: a `'use server'` module is its own HTTP entry point. */
const serverActionFiles = () =>
  walk(SRC_DIR, isSource).filter((f) => /^\s*['"]use server['"]/.test(readFileSync(f, 'utf8')));

/** Repo-relative with `/`, so the expectations below hold on Windows too. */
const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

describe('API route 5xx bodies', () => {
  test('the guard sees the files it is meant to guard', () => {
    const routes = routeFiles().map(rel);
    expect(routes).toEqual(
      expect.arrayContaining([
        'src/app/api/cagrilar/route.ts',
        'src/app/api/user/export/route.ts',
        'src/app/api/gdpr/delete/route.ts',
        'src/app/[locale]/(app)/[workspace]/dashboard/api/export-csv/route.ts',
      ])
    );
    expect(responseBuilders().map(rel)).toContain('src/lib/api-auth.ts');
    expect(serverActionFiles().map(rel)).toEqual(
      expect.arrayContaining(['src/actions/user/export-data.ts', 'src/actions/user/request-deletion.ts'])
    );
  });

  test('no route returns errorMessage(...) in a response field', () => {
    const offenders = routeFiles().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\b(error|message)\s*:\s*errorMessage\(/.test(line))
        .map(({ n }) => `${rel(file)}:${n}`)
    );
    expect(offenders).toEqual([]);
  });

  test('every response that is or might be a 5xx goes through internalError()', () => {
    const offenders = responseBuilders().flatMap((file) =>
      unguardedServerErrors(readFileSync(file, 'utf8')).map((n) => `${rel(file)}:${n}`)
    );
    expect(offenders).toEqual([]);
  });

  test('the 5xx guard catches the shapes it is meant to catch', () => {
    const leaks = [
      // İNCELEME-70: the shapes the first guard knew.
      'return NextResponse.json({ error: (error as Error).message }, { status: 500 });',
      'return NextResponse.json({ success: false, error: String(error) }, { status: 500 });',
      'return new NextResponse(`Error processing webhook: ${err.message}`, {\n  status: 500,\n});',
      "return NextResponse.json(\n  { error: err.message || 'fallback' },\n  { status: 503 }\n);",
      'return Response.json({ message: errorMessage(e) }, { status: 502 });',
      // İNCELEME-75 D-1, G1–G13: every one of these passed the pattern list.
      'return NextResponse.json({ error: `failed: ${error}` }, { status: 500 });',
      'return NextResponse.json({ error: JSON.stringify(error) }, { status: 500 });',
      'return NextResponse.json({ error: (error as Error).cause }, { status: 500 });',
      'return NextResponse.json({ error: (error as Error).stack }, { status: 500 });',
      'return Response.json({ error }, { status: 500 });',
      'return NextResponse.json({ error: error }, { status: 500 });',
      'const queryErr = error; return NextResponse.json({ error: String(queryErr) }, { status: 500 });',
      'return NextResponse.json({ error: (error as Error).toString() }, { status: 500 });',
      "return NextResponse.json({ error: (error as Error)['message'] }, { status: 500 });",
      'const { message } = error as Error; return NextResponse.json({ error: message }, { status: 500 });',
      'const status = 500; return NextResponse.json({ error: (error as Error).message }, { status });',
      'const body = { error: (error as Error).message }; return NextResponse.json(body, { status: 500 });',
      "return NextResponse.json({ hint: 'retry :)', error: (error as Error).message }, { status: 500 });",
      // Y-1 as it was written in the GDPR routes.
      "const status = result.error === 'Unauthorized' ? 401 : 500;\nreturn NextResponse.json({ error: result.error ?? 'Export failed' }, { status });",
      // A status the source cannot pin down is treated as a possible 5xx.
      'return NextResponse.json({ error: e.code }, { status: upstream.status });',
      'return NextResponse.json({ error: e.code }, init);',
      'return NextResponse.json({ error: e.code }, { ...init });',
      'return NextResponse.json({ ok: false }, { status: ok ? 200 : 500 });',
      // An annotation on an object property is not a declaration.
      "const init = { status: 400, headers };\nconst status = 500;\nreturn NextResponse.json({ error: 'x' }, { status });",
      // A comment or a string cannot close the call early and hide the status.
      "return NextResponse.json({ note: '/* ) */', error: 'x' }, { status: 500 });",
      'return NextResponse.json({ note: `)${a}`, error: \'x\' }, { status: 500 });',
    ];
    for (const src of leaks) expect(unguardedServerErrors(src), src).toHaveLength(1);

    const fine = [
      "return internalError({ error: 'internal_error' });",
      'return NextResponse.json({ received: true });',
      "return NextResponse.json({ error: 'internal_error' }, { headers });",
      // 4xx bodies may say what was wrong with the request.
      'return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });',
      'return NextResponse.json({ issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });',
      "return NextResponse.json({ error: allowed.error }, { status: allowed.error === 'too_large' ? 413 : 415 });",
      // A status parameter TypeScript holds to 4xx literals.
      'function refuse(error: E, status: 400 | 413, extra: X = {}) {\n  return NextResponse.json({ error, ...extra }, { status });\n}',
      "const status: 401 | 403 = denied ? 403 : 401;\nreturn NextResponse.json({ error: 'no' }, { status });",
    ];
    for (const src of fine) expect(unguardedServerErrors(src), src).toEqual([]);
  });
});

/**
 * Server actions that already hand a caught value back, before this guard
 * existed. Each is a follow-up, not an exemption: the count may only go down,
 * and the test fails when it does so the entry is removed with the fix.
 * - m8 findCandidates: `errorMessage(e)` carries domain messages the UI shows
 *   ("Seat not found in this workspace.") but also any Prisma error; the domain
 *   errors need a class of their own before the fallback can become a code.
 */
const KNOWN_ACTION_LEAKS: Record<string, number> = {
  'src/modules/m8/server/actions.ts': 1,
};

describe('server action error returns', () => {
  test('no server action returns what it caught (beyond the known list)', () => {
    const found: Record<string, number> = {};
    for (const file of serverActionFiles()) {
      const n = catchReturnLeaks(readFileSync(file, 'utf8')).length;
      if (n > 0) found[rel(file)] = n;
    }
    expect(found).toEqual(KNOWN_ACTION_LEAKS);
  });

  test('the action guard catches the shapes it is meant to catch', () => {
    const leaks = [
      // Y-1 exactly as export-data.ts / request-deletion.ts had it.
      "try { x(); } catch (error) {\n  const message = error instanceof Error ? error.message : 'Failed';\n  console.error('[export-data]', message);\n  return { success: false, error: message };\n}",
      "try { x(); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'unknown_error' }; }",
      'try { x(); } catch (e) { return { status: \'error\', message: errorMessage(e) }; }',
      'try { x(); } catch (e) { return { error: String(e) }; }',
      'try { x(); } catch (e) { return { error: `${e}` }; }',
      'try { x(); } catch (e) { return { error: (e as Error).stack }; }',
      'try { x(); } catch (e) { return { error: JSON.stringify(e) }; }',
      'try { x(); } catch (error) { return { error }; }',
      'try { x(); } catch (e) { const { message } = e as Error; return { error: message }; }',
      'try { x(); } catch (e) { const m = (e as Error).message; const out = { error: m }; return out; }',
      'try { x(); } catch (e) { return toFailure(e); }',
      'try { x(); } catch (error) { if (error instanceof UploadRefused) return { success: false, error: error.message }; }',
      'try { x(); } catch (e) { return { error: e.codeText }; }',
    ];
    for (const src of leaks) expect(catchReturnLeaks(src), src).toHaveLength(1);

    const fine = [
      "try { x(); } catch (error) { console.error('[x]', error); return { success: false, error: 'export_failed' }; }",
      "try { x(); } catch (e) { return { ok: false, error: errorCode(e) }; }",
      "try { x(); } catch (e) { return { ok: false, error: failureCode(e, 'failed') }; }",
      "try { x(); } catch (e) { return { ok: false, error: e instanceof CoBrandStorageError ? 'storage' : 'failed' }; }",
      "try { x(); } catch (error) { return { ok: false, error: mailFailureCode(error) ?? 'unknown_error' }; }",
      // A domain error's own code (evidence/actions.ts UploadRefused).
      'try { x(); } catch (error) { if (error instanceof UploadRefused) return { success: false, error: error.code }; }',
      "try { x(); } catch (e) { if (isPilotExpired(e)) return { code: 'pilot_expired' }; return { error: 'failed' }; }",
      // admin/billing/plans (TASK-MUNZKR3PEV8EI); what planFailure returns is pinned by its own test.
      "try { x(); } catch (e) { return planFailure(e, 'createDraft'); }",
    ];
    for (const src of fine) expect(catchReturnLeaks(src), src).toEqual([]);
  });
});
