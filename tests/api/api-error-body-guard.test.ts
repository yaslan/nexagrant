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
import { unguardedServerErrors } from './response-status-scan';
import { actionReturnLeaks, fsModuleReader, hasUseServerDirective } from './action-leak-scan';

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
/**
 * Server actions: a `'use server'` module, or a file with an inline `'use server'`
 * function, is its own HTTP entry point. Read off the syntax tree, so a comment
 * above the directive (İNCELEME-93 X7) no longer drops the file from the scan.
 */
const serverActionFiles = () => walk(SRC_DIR, isSource).filter((f) => hasUseServerDirective(readFileSync(f, 'utf8'), f));

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
 * Both entries are closed: admin/billing/plans `toFailure()` (TASK-MUNZKR3PEV8EI)
 * and m8 `computeSeatCandidatesForm` (TASK-MUNZ7N9IT8VPY) now answer codes.
 * Keep the map empty; a new entry needs a follow-up card, not an exemption.
 */
const KNOWN_ACTION_LEAKS: Record<string, number> = {};

describe('server action error returns', () => {
  test('no server action returns what it caught (beyond the known list)', () => {
    // Imports are followed into src/ (TASK-MUOBO31H8EPR5, İNCELEME-100 Y-1):
    // a service that returns what it caught leaks through the action that returns it.
    const read = fsModuleReader(ROOT);
    const found: Record<string, number> = {};
    for (const file of serverActionFiles()) {
      const n = actionReturnLeaks(readFileSync(file, 'utf8'), rel(file), read).length;
      if (n > 0) found[rel(file)] = n;
    }
    expect(found).toEqual(KNOWN_ACTION_LEAKS);
  });

  test('the directive is found past comments and inside a function, and only as a directive', () => {
    expect(hasUseServerDirective("/** m8 */\n'use server';\nexport async function a() {}")).toBe(true);
    expect(hasUseServerDirective('// x\n\n/* y */ "use server";\nexport async function a() {}')).toBe(true);
    expect(hasUseServerDirective("'use strict';\n'use server';\nexport async function a() {}")).toBe(true);
    expect(hasUseServerDirective("export default function P() {\n  async function act() {\n    'use server';\n  }\n}")).toBe(true);
    expect(hasUseServerDirective("import x from 'y';\n'use server';")).toBe(false);
    expect(hasUseServerDirective("const note = 'use server';")).toBe(false);
    // The inline action of the partner portal page is now scanned too (İNCELEME-93 D-1).
    expect(serverActionFiles().map(rel)).toContain('src/app/[locale]/portal/partner/[token]/page.tsx');
  });

  /** An action body wrapped the way the files are: the directive, imports, then the action. */
  const action = (body: string, imports = '') =>
    `'use server';\n${imports}\nexport async function act(id: string) {\n${body}\n}\n`;

  test('the action guard catches the shapes it is meant to catch', () => {
    const leaks = [
      // Y-1 exactly as export-data.ts / request-deletion.ts had it.
      "try { x(); } catch (error) {\n  const message = error instanceof Error ? error.message : 'Failed';\n  console.error('[export-data]', message);\n  return { success: false, error: message };\n}",
      "try { x(); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'unknown_error' }; }",
      "try { x(); } catch (e) { return { status: 'error', message: errorMessage(e) }; }",
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
    for (const src of leaks) expect(actionReturnLeaks(src), src).toHaveLength(1);

    const fine = [
      "try { x(); } catch (error) { console.error('[x]', error); return { success: false, error: 'export_failed' }; }",
      "import { errorCode } from '@/lib/errors';\ntry { x(); } catch (e) { return { ok: false, error: errorCode(e) }; }",
      "import { failureCode } from '@/lib/pilot-expired';\ntry { x(); } catch (e) { return { ok: false, error: failureCode(e, 'failed') }; }",
      "try { x(); } catch (e) { return { ok: false, error: e instanceof CoBrandStorageError ? 'storage' : 'failed' }; }",
      "import { mailFailureCode } from '@/lib/email/mailer';\ntry { x(); } catch (error) { return { ok: false, error: mailFailureCode(error) ?? 'unknown_error' }; }",
      // A domain error's own code (evidence/actions.ts UploadRefused).
      'try { x(); } catch (error) { if (error instanceof UploadRefused) return { success: false, error: error.code }; }',
      "try { x(); } catch (e) { if (isPilotExpired(e)) return { code: 'pilot_expired' }; return { error: 'failed' }; }",
      // admin/billing/plans: a local helper is judged by its body, not its name.
      "import { planFailureCode } from './failure-codes';\nfunction planFailure(e: unknown, action: string) {\n  const code = planFailureCode(e);\n  if (code === 'UNKNOWN') logger.error(`[admin/plans] ${action} failed`, e);\n  return { ok: false, code };\n}\nasync function a() { try { x(); } catch (e) { return planFailure(e, 'createDraft'); } }",
      // m10 actions.ts: a promise `.catch` that answers a fixed code.
      "async function a() { const r = await send().catch(() => ({ ok: false as const, code: 'failed' })); return r; }",
      // zod's `.catch(value)` is a fallback value, not a rejection handler.
      "function a(v: string) { return z.string().catch('x').parse(v); }",
      // A caught value in one function is not the same-named variable in another.
      'function a() { try { x(); } catch (e) { log(e); } }\nfunction b(e: string) { return e; }',
    ];
    for (const src of fine) expect(actionReturnLeaks(src, 'src/app/[locale]/admin/billing/plans/actions.ts'), src).toEqual([]);
  });

  /**
   * İNCELEME-93 D-1: the six shapes devop-fb's mutants got past the regex guard
   * (docs/agent-results/TASK-MUO9IN3HL4K5K-devop-fb.md §2.3), each as it was
   * written into m8 computeSeatCandidatesForm, plus their near relatives.
   */
  test.each([
    ['X2 destructured catch binding', action("try { await compute(id); return { status: 'ok' }; } catch ({ message }) {\n  if (message) return { status: 'error', code: message as never };\n  return { status: 'error', code: 'computeFailed' };\n}")],
    ['X3 field set on the object after it was built', action("try { await compute(id); return { status: 'ok' }; } catch (e) {\n  const out: Record<string, unknown> = { status: 'error', code: 'computeFailed' };\n  out.detail = String(e);\n  return out;\n}")],
    ['X4 outer let assigned in the catch', action("let why = '';\ntry { await compute(id); return { status: 'ok' }; } catch (e) {\n  why = String(e);\n  return { status: 'error', code: 'computeFailed', why };\n}")],
    ['X5 promise .catch handing the error on', action("const created = await compute(id).catch((err: unknown) => err as Error);\nif (created instanceof Error) return { status: 'error', code: created.message as never };\nreturn { status: 'ok' };")],
    ['X6 local function named like a sanitiser', "'use server';\nfunction errorCode(x: unknown) { return String(x) as never; }\nexport async function act(id: string) {\n  try { await compute(id); return { status: 'ok' }; } catch (e) {\n    return { status: 'error', code: errorCode(e) };\n  }\n}\n"],
    ['X6b a sanitiser name imported from another module', action("try { await compute(id); return { status: 'ok' }; } catch (e) {\n  return { status: 'error', code: errorCode(e) };\n}", "import { errorCode } from '@/lib/debug';")],
    ['X6c another export imported under a sanitiser name', action("try { await compute(id); return { status: 'ok' }; } catch (e) {\n  return { status: 'error', code: errorCode(e) };\n}", "import { errorMessage as errorCode } from '@/lib/errors';")],
    ['X6d a parameter shadowing the imported sanitiser', "'use server';\nimport { errorCode } from '@/lib/errors';\nexport async function act(id: string, errorCode: (e: unknown) => string) {\n  try { await compute(id); return { status: 'ok' }; } catch (e) {\n    return { status: 'error', code: errorCode(e) };\n  }\n}\n"],
    ['X7 comment above the directive (plus X1)', "/** m8 */\n'use server';\nexport async function act(id: string) {\n  try { await compute(id); return { status: 'ok' }; } catch (e) {\n    return { status: 'error', code: 'computeFailed', message: String(e) };\n  }\n}\n"],
    ['pushed into a list that is returned', action("const errors: string[] = [];\nfor (const s of seats) {\n  try { await compute(s); } catch (e) { errors.push((e as Error).message); }\n}\nreturn { status: 'done', errors };")],
    ['Object.assign onto the result', action("const out = { status: 'error' };\ntry { await compute(id); } catch (e) { Object.assign(out, { detail: (e as Error).message }); }\nreturn out;")],
    ['.then with a rejection handler', action("const r = await compute(id).then(() => 'ok', (e: Error) => e.message);\nreturn { status: r };")],
    ['a rejection handler passed by name', action("const r = await compute(id).catch(describe);\nreturn { status: 'error', code: r };", 'function describe(e: unknown) { return String(e); }')],
    ['a helper that leaks, called from the catch', action("try { await compute(id); return { status: 'ok' }; } catch (e) {\n  return { status: 'error', code: describe(e) };\n}", "function describe(e: unknown) { return e instanceof Error ? e.message : 'x'; }")],
    ['a destructuring assignment in the catch', action("let message = '';\ntry { await compute(id); } catch (e) { ({ message } = e as Error); }\nreturn { status: 'error', message };")],
  ])('%s', (_, src) => {
    expect(hasUseServerDirective(src)).toBe(true);
    expect(actionReturnLeaks(src, 'src/modules/m8/server/actions.ts'), src).not.toEqual([]);
  });
});
