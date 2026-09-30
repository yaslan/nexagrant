/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-2) — source guard.
 *
 * A route's 500 body used to be `errorMessage(error)`: whatever the thrown value
 * said, which for Prisma is the query shape with table and column names. The
 * detail belongs in the server log; the body is a fixed code. This guard fails
 * on any route handler that puts `errorMessage(...)` into an `error:` or
 * `message:` field again.
 *
 * İNCELEME-70 Y-1 (TASK-MUNVVMJDEO932): the same leak was still written as
 * `err.message`, `(error as Error).message` or `String(error)`, which the line
 * pattern above does not see. The second guard reads every response a route
 * builds with a 5xx status and fails if its arguments carry any of those.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

const API_DIR = resolve(__dirname, '../../src/app/api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

const RESPONSE_CALL = /\b(?:NextResponse\.json|Response\.json|new\s+NextResponse|new\s+Response)\s*\(/g;
const SERVER_ERROR_STATUS = /\bstatus\s*:\s*5\d\d\b/;
const LEAK = [
  /\.message\b/, // err.message, (error as Error).message, `${e.message}`
  /\bString\(\s*(?:e|err|error|ex|exception|reason|cause)\s*\)/,
  /\berrorMessage\(/,
];

/**
 * se-fb fixes billing/portal in TASK-MUNSRKW0HJYBV (İNCELEME-63 Ö-B), not yet on
 * dev when this guard was widened. Delete the entry once that branch merges.
 */
const PENDING_ELSEWHERE = new Set(['billing/portal/route.ts']);

/** The argument text of every response call in `src`, with the 1-based line it starts on. */
function responseCalls(src: string): { args: string; line: number }[] {
  const calls: { args: string; line: number }[] = [];
  for (const m of src.matchAll(RESPONSE_CALL)) {
    const open = m.index! + m[0].length;
    let depth = 1;
    let i = open;
    while (i < src.length && depth > 0) {
      const c = src[i++];
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    calls.push({ args: src.slice(open, i - 1), line: src.slice(0, m.index).split('\n').length });
  }
  return calls;
}

function serverErrorLeaks(src: string): number[] {
  return responseCalls(src)
    .filter(({ args }) => SERVER_ERROR_STATUS.test(args) && LEAK.some((re) => re.test(args)))
    .map(({ line }) => line);
}

describe('API route 500 bodies', () => {
  test('the guard sees the routes it is meant to guard', () => {
    const files = routeFiles(API_DIR).map((f) => relative(API_DIR, f));
    expect(files).toEqual(expect.arrayContaining(['cagrilar/route.ts', 'cordis/projects/route.ts', 'billing/quote/route.ts']));
  });

  test('no route returns errorMessage(...) in a response field', () => {
    const offenders = routeFiles(API_DIR).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\b(error|message)\s*:\s*errorMessage\(/.test(line))
        .map(({ n }) => `${relative(API_DIR, file)}:${n}`)
    );
    expect(offenders).toEqual([]);
  });

  test('no 5xx response carries the thrown value (.message, String(err), errorMessage)', () => {
    const offenders = routeFiles(API_DIR).flatMap((file) => {
      const rel = relative(API_DIR, file);
      if (PENDING_ELSEWHERE.has(rel)) return [];
      return serverErrorLeaks(readFileSync(file, 'utf8')).map((n) => `${rel}:${n}`);
    });
    expect(offenders).toEqual([]);
  });

  test('the 5xx guard catches the shapes it is meant to catch', () => {
    const leaks = [
      "return NextResponse.json({ error: (error as Error).message }, { status: 500 });",
      "return NextResponse.json({ success: false, error: String(error) }, { status: 500 });",
      "return new NextResponse(`Error processing webhook: ${err.message}`, {\n  status: 500,\n});",
      "return NextResponse.json(\n  { error: err.message || 'fallback' },\n  { status: 503 }\n);",
      "return Response.json({ message: errorMessage(e) }, { status: 502 });",
    ];
    for (const src of leaks) expect(serverErrorLeaks(src), src).toEqual([1]);

    const fine = [
      "return NextResponse.json({ error: 'internal_error' }, { status: 500 });",
      // 4xx bodies may say what was wrong with the request.
      "return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });",
      "return NextResponse.json({ issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });",
    ];
    for (const src of fine) expect(serverErrorLeaks(src), src).toEqual([]);
  });
});
