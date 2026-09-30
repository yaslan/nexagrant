/**
 * TASK-MUOBO31H8EPR5 — the rules of tests/api/action-leak-scan.ts, each held by
 * a fixture that only that rule catches (İNCELEME-100 Y-3: six rules had no
 * test, and a mutant of each left the guard green).
 *
 * - Y-1: a value caught in another module and handed back by its function
 *   reaches the action's return (admin CORDIS `runCordisImport`, fixed in
 *   TASK-MUOBNYACFPLPF). Modules are read through an in-memory reader here.
 * - Y-2: eleven shapes inside one file that got a caught value past the guard
 *   (docs/agent-results/TASK-MUOAW0UAXVG1M-be-fb.md §Y-2), plus
 *   `Promise.allSettled`.
 * - Y-3: the witnesses of İNCELEME-100's six surviving mutants.
 *
 * TASK-MUODXBIM9H1PP (İNCELEME-107, docs/agent-results/TASK-MUOBO31H8EPR5-crw2-fb.md)
 * adds one block per finding: B-1 a module loaded with `import()`/`require()`,
 * B-2 the `.code` trust laundered by a write, Y-1..Y-6, a witness for each
 * mutant that lived (T-1), the source of a finding (Ö-1), and the callbacks
 * whose value goes nowhere (Ö-2). Each fixture got past the scan before it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, test, expect } from 'vitest';
import { actionReturnFindings, actionReturnLeaks, mapModuleReader, type ModuleReader } from './action-leak-scan';

const ROOT = resolve(__dirname, '../..');
const FILE = 'src/modules/m8/server/actions.ts';

/** An action body wrapped the way the files are: the directive, imports, then the action. */
const action = (body: string, imports = '') =>
  `'use server';\n${imports}\nexport async function act(id: string) {\n${body}\n}\n`;

/** A tree with the action and the given modules, read from memory only. */
const tree = (modules: Record<string, string>): ModuleReader => mapModuleReader(modules);

/** A service that catches and hands the text back: the CORDIS importer's shape. */
const LEAKY_SERVICE =
  "export async function runImport(o: { limit?: number }) {\n  try { await fetchAll(o); return { success: true as const, runId: 'r' }; } catch (error) {\n    const errorMsg = errorMessage(error, String(error));\n    return { success: false as const, error: errorMsg };\n  }\n}\nfunction errorMessage(e: unknown, f: string) { return e instanceof Error ? e.message : f; }\n";
/** The same service, fixed the way TASK-MUOBNYACFPLPF fixed it. */
const CODED_SERVICE =
  "export async function runImport(o: { limit?: number }) {\n  try { await fetchAll(o); return { success: true as const, runId: 'r' }; } catch (error) {\n    console.error('[import]', error);\n    return { success: false as const, error: 'IMPORT_FAILED' };\n  }\n}\n";
const USE_IMPORT = "const res = await runImport({ limit: 1 });\nif (!res.success) return { success: false, error: res.error };\nreturn { success: true };";

describe('Y-1: a caught value handed back by another module', () => {
  test('the CORDIS shape: an import that returns what it caught is a source', () => {
    const src = action(USE_IMPORT, "import { runImport } from '@/lib/k2/importer';");
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/k2/importer.ts': LEAKY_SERVICE }))).toEqual([5]);
    // Fixed service: nothing to report — so the rule is about the value, not the import.
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/k2/importer.ts': CODED_SERVICE }))).toEqual([]);
  });

  test.each([
    ['relative specifier', "import { runImport } from '../../../lib/k2/importer';", { 'src/lib/k2/importer.ts': LEAKY_SERVICE }],
    ['index file', "import { runImport } from '@/lib/k2';", { 'src/lib/k2/index.ts': LEAKY_SERVICE }],
    ['two modules deep', "import { runImport } from '@/lib/a';", { 'src/lib/a.ts': "import { runImport as inner } from './b';\nexport async function runImport(o: { limit?: number }) { return inner(o); }\n", 'src/lib/b.ts': LEAKY_SERVICE }],
    ['three modules deep, the last one catching', "import { runImport } from '@/lib/a';", { 'src/lib/a.ts': "import { go } from './b';\nexport async function runImport(o: { limit?: number }) { return go(o); }\n", 'src/lib/b.ts': "import { runImport } from './c';\nexport const go = (o: { limit?: number }) => runImport(o);\n", 'src/lib/c.ts': LEAKY_SERVICE }],
    ['re-exported by name', "import { runImport } from '@/lib/a';", { 'src/lib/a.ts': "export { runImport } from './b';\n", 'src/lib/b.ts': LEAKY_SERVICE }],
    ['re-exported under another name', "import { runImport } from '@/lib/a';", { 'src/lib/a.ts': "import { runImport as r } from './b';\nexport { r as runImport };\n", 'src/lib/b.ts': LEAKY_SERVICE }],
    ['re-exported by `export *`', "import { runImport } from '@/lib/a';", { 'src/lib/a.ts': "export * from './b';\n", 'src/lib/b.ts': LEAKY_SERVICE }],
    ['a default export', "import runImport from '@/lib/k2/importer';", { 'src/lib/k2/importer.ts': LEAKY_SERVICE + 'export default runImport;\n' }],
  ])('%s', (_, imports, modules) => {
    expect(actionReturnLeaks(action(USE_IMPORT, imports), FILE, tree(modules as Record<string, string>))).not.toEqual([]);
  });

  test.each([
    ['a namespace import', "import * as svc from '@/lib/svc';", "const r = await svc.runImport({});\nreturn { error: r.error };", { 'src/lib/svc.ts': LEAKY_SERVICE }],
    ['a method of an exported object', "import { svc } from '@/lib/svc';", "const r = await svc.runImport({});\nreturn { error: r.error };", { 'src/lib/svc.ts': LEAKY_SERVICE + 'export const svc = { runImport };\n' }],
    ['a method of an exported class', "import { Svc } from '@/lib/svc';", "const r = await new Svc().run();\nreturn { error: r };", { 'src/lib/svc.ts': "export class Svc {\n  async run() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n}\n" }],
    ['an export built by a local factory', "import { run } from '@/lib/svc';", "return { error: await run() };", { 'src/lib/svc.ts': "function make() { return async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } }; }\nexport const run = make();\n" }],
    ['a destructured export of a factory', "import { run } from '@/lib/svc';", "return { error: await run() };", { 'src/lib/svc.ts': "function make() { return { run: async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } } }; }\nexport const { run } = make();\n" }],
    ['an export built by a factory in another module', "import { run } from '@/lib/svc';", "return { error: await run() };", { 'src/lib/svc.ts': "import { make } from './factory';\nexport const run = make();\n", 'src/lib/factory.ts': "export function make() { return async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } }; }\n" }],
    ['a helper of the service that returns what it caught', "import { run } from '@/lib/svc';", "return { error: await run() };", { 'src/lib/svc.ts': "async function inner() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\nexport async function run() { return inner(); }\n" }],
    ['a callback that returns what it caught', "import { all } from '@/lib/svc';", "return { results: all([id]) };", { 'src/lib/svc.ts': "export function all(ids: string[]) { return ids.map((i) => { try { go(i); return 'ok'; } catch (e) { return String(e); } }); }\n" }],
    ['a getter that returns what it caught', "import { describeFailure } from '@/lib/svc';", "return { error: describeFailure().d };", { 'src/lib/svc.ts': "export function describeFailure() { try { go(); return { d: 'ok' }; } catch (e) { const o = { get d() { return String(e); } }; return o; } }\n" }],
    ['a service that writes the caught text into the caller\'s object', "import { fill } from '@/lib/svc';", "const out: Record<string, unknown> = { ok: false };\ntry { await go(); } catch (e) { fill(out, e); }\nreturn out;", { 'src/lib/svc.ts': "export function fill(o: Record<string, unknown>, x: unknown) { o.detail = String(x); }\n" }],
  ])('%s', (_, imports, body, modules) => {
    expect(actionReturnLeaks(action(body, imports), FILE, tree(modules as Record<string, string>))).not.toEqual([]);
  });

  test('what the scan cannot read counts as a leak (fail-closed)', () => {
    const call = "return { r: await run() };";
    // An import into src/ that names no file.
    expect(actionReturnLeaks(action(call, "import { run } from '@/lib/missing';"), FILE, tree({}))).not.toEqual([]);
    // A name the module does not export.
    expect(actionReturnLeaks(action(call, "import { run } from '@/lib/svc';"), FILE, tree({ 'src/lib/svc.ts': 'export const other = 1;\n' }))).not.toEqual([]);
    // An alias the scan does not read.
    expect(actionReturnLeaks(action(call, "import { run } from '#lib/svc';"), FILE, tree({}))).not.toEqual([]);
    // A namespace used as a whole.
    expect(actionReturnLeaks(action("return { r: await svc['run']() };", "import * as svc from '@/lib/svc';"), FILE, tree({ 'src/lib/svc.ts': 'export async function run() { return 1; }\n' }))).not.toEqual([]);
    // An import cycle: a module still being read is not trusted.
    const cycle = {
      'src/lib/a.ts': "import { b } from './b';\nexport async function run() { return b(); }\n",
      'src/lib/b.ts': "import { run } from './a';\nexport async function b() { return run(); }\n",
    };
    expect(actionReturnLeaks(action(call, "import { run } from '@/lib/a';"), FILE, tree(cycle))).not.toEqual([]);
  });

  test('stays clean for what is not a caught value', () => {
    const clean = [
      // A package is judged by its arguments only.
      ["import { z } from 'zod';", "return { ok: z.string().safeParse(id).success };", {}],
      // A service that answers a code, or catches and returns a fixed value.
      ["import { runImport } from '@/lib/k2/importer';", USE_IMPORT, { 'src/lib/k2/importer.ts': CODED_SERVICE }],
      ["import { load } from '@/lib/svc';", "return { rows: await load() };", { 'src/lib/svc.ts': "export async function load() { try { return await go(); } catch { return []; } }\n" }],
      // A service whose sanitiser is the listed one.
      ["import { code } from '@/lib/svc';", "return { error: await code() };", { 'src/lib/svc.ts': "import { errorCode } from '@/lib/errors';\nexport async function code() { try { await go(); return null; } catch (e) { return errorCode(e) ?? 'failed'; } }\n", 'src/lib/errors.ts': '' }],
      // A service that logs what it caught.
      ["import { logger } from '@/lib/logger';", "try { await go(); } catch (e) { logger.error('x', e); }\nreturn { ok: logger.ready };", { 'src/lib/logger.ts': "export const logger = { ready: true, error(m: string, e: unknown) { console.error(m, e); } };\n" }],
      // A catch in another export of the same module is not this export's.
      ["import { ok } from '@/lib/svc';", "return { ok: ok() };", { 'src/lib/svc.ts': LEAKY_SERVICE + "export function ok() { return 'ok'; }\n" }],
      // `export *` of a module whose export is clean.
      ["import { ok } from '@/lib/a';", "return { ok: ok() };", { 'src/lib/a.ts': "export * from './b';\n", 'src/lib/b.ts': "export function ok() { return 'ok'; }\n" }],
      // A factory from a package.
      ["import { run } from '@/lib/svc';", "return { r: await run() };", { 'src/lib/svc.ts': "import NextAuth from 'next-auth';\nconst config = { providers: [] };\nexport const { auth: run } = NextAuth(config);\n" }],
    ] as const;
    for (const [imports, body, modules] of clean) {
      expect(actionReturnLeaks(action(body, imports), FILE, tree(modules as Record<string, string>)), body).toEqual([]);
    }
  });

  test('the real tree is read with `@/` as its only alias, which the scan follows', () => {
    // A new tsconfig `paths` key or package.json `imports` would be read as a
    // package, whose functions are judged by their arguments only.
    const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    const paths = /"paths"\s*:\s*\{([^}]*)\}/.exec(tsconfig)?.[1] ?? '';
    expect([...paths.matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1])).toEqual(['@/*']);
    expect(tsconfig).not.toMatch(/"baseUrl"/);
    expect(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).imports).toBeUndefined();
  });
});

/** İNCELEME-100 §Y-2: each got a caught value past the guard before this card. */
describe('Y-2: shapes inside one file', () => {
  test.each([
    ['N4 `.code` of an object built from the text', action("try { await go(id); return { ok: true }; } catch (e) { const box = { code: (e as Error).message }; return { error: box.code }; }")],
    ['N5 the same through `String(e)`', action("try { await go(id); return { ok: true }; } catch (e) { const r = { code: String(e) }; return { ok: false, code: r.code }; }")],
    ['N16 `.code` of a variable reassigned from the text', action("try { await go(id); return { ok: true }; } catch (e) { let x = e as { code: string }; x = { code: (e as Error).message }; return { code: x.code }; }")],
    ['N16b the catch binding itself reassigned', action("try { await go(id); return { ok: true }; } catch (e: any) { e = { code: String(e) }; return { code: e.code }; }")],
    ['N6 an alias of the result', action("const out: Record<string, unknown> = { ok: false };\nconst alias = out;\ntry { await go(id); } catch (e) { alias.detail = String(e); }\nreturn out;")],
    ['N7 an alias of a field of the result', action("const out = { ok: false, meta: {} as Record<string, unknown> };\nconst meta = out.meta;\ntry { await go(id); } catch (e) { meta.detail = String(e); }\nreturn out;")],
    ['N7b a destructured alias', action("const out = { ok: false, meta: {} as Record<string, unknown> };\nconst { meta } = out;\ntry { await go(id); } catch (e) { meta.detail = String(e); }\nreturn out;")],
    ['N8 Reflect.set', action("const out: Record<string, unknown> = { ok: false };\ntry { await go(id); } catch (e) { Reflect.set(out, 'detail', String(e)); }\nreturn out;")],
    ['N9 Object.defineProperty', action("const out: Record<string, unknown> = { ok: false };\ntry { await go(id); } catch (e) { Object.defineProperty(out, 'detail', { value: String(e), enumerable: true }); }\nreturn out;")],
    ['N10 Array.prototype.push.call', action("const errors: string[] = [];\ntry { await go(id); } catch (e) { Array.prototype.push.call(errors, String(e)); }\nreturn { errors };")],
    ['N11 a local helper that writes into the result', action("const out: Record<string, unknown> = { ok: false };\ntry { await go(id); } catch (e) { fill(out, e); }\nreturn out;", "function fill(o: Record<string, unknown>, x: unknown) { o.detail = String(x); }")],
    ['N12 a class field read through `new`', action("try { await go(id); return { ok: true }; } catch (e) { class R { detail = String(e); } return { ...new R() }; }")],
    ['N17 a generator that yields it', action("try { await go(id); return { ok: true }; } catch (e) { const g = (function* () { yield String(e); })(); return { error: g.next().value }; }")],
    ['K2 Promise.allSettled reason', action("const [r] = await Promise.allSettled([go(id)]);\nif (r?.status === 'rejected') return { error: String(r.reason) };\nreturn { ok: true };")],
    ['a local helper that records it in an outer variable', action("let last = '';\nfunction note(x: unknown) { last = String(x); }\ntry { await go(id); } catch (e) { note(e); }\nreturn { last };")],
    ['a callback over a tainted list', action("const errors: string[] = [];\nconst out: string[] = [];\ntry { await go(id); } catch (e) { errors.push(String(e)); }\nerrors.forEach((x) => out.push(x));\nreturn { out };")],
    ['a package helper that writes into its argument', action("const out: Record<string, unknown> = {};\ntry { await go(id); } catch (e) { set(out, 'detail', String(e)); }\nreturn out;", "import { set } from 'lodash';")],
  ])('%s', (_, src) => {
    expect(actionReturnLeaks(src, FILE, tree({})), src).not.toEqual([]);
  });

  test('the `.code` of the caught value itself stays trusted, also under a `const` alias', () => {
    const fine = [
      action("try { await go(id); return { ok: true }; } catch (e: any) { return { code: e.code }; }"),
      action("try { await go(id); return { ok: true }; } catch (e: any) { return { code: e?.code }; }"),
      action("try { await go(id); return { ok: true }; } catch (e) { const err = e as { code: string }; return { code: err.code }; }"),
      action("return go(id).catch((e: { code: string }) => ({ code: e.code }));"),
      // A regex tested against the text is not tainted by it.
      action("try { await go(id); return { ok: true }; } catch (e) { if (NOT_CONNECTED.test(String(e))) return { code: 'retry' }; return { code: NOT_CONNECTED.source }; }", 'const NOT_CONNECTED = /timeout/;'),
      // An object whose method has a catch of its own does not hold that catch's value.
      action("const o = { async m() { try { await go(id); } catch (e) { console.error(e); } return 1; } };\nreturn { n: await o.m() };"),
    ];
    for (const src of fine) expect(actionReturnLeaks(src, FILE, tree({})), src).toEqual([]);
  });
});

/** İNCELEME-100 §Y-3: one witness per rule; with the rule removed, the guard said `[]`. */
describe('Y-3: each rule of the analyser has a witness', () => {
  test.each([
    // S-c: nested functions' returns are sinks — the inline `'use server'` action inside a page.
    ['S-c an inline action nested in a component', "export default function Page() {\n  async function act() {\n    'use server';\n    try { await go(); return { ok: true }; } catch (e) { return { error: String(e) }; }\n  }\n  return act;\n}\n"],
    // S-f: the `.code` exemption is for the caught value itself, not `e.cause.code`.
    ['S-f `.code` of a field of the caught value', action("try { await go(id); return { ok: true }; } catch (e: any) { return { error: e.cause.code }; }")],
    ['S-g `for…of` over the caught value', action("try { await go(id); return { ok: true }; } catch (e) { for (const x of [e]) return { error: String(x) }; }")],
    ['S-j the object of an element access', action("try { await go(id); return { ok: true }; } catch (e: any) { return { error: e['message'] }; }")],
    ['S-k the arguments of `new`', action("try { await go(id); return { ok: true }; } catch (e: any) { return { error: new Error(e.message).message }; }")],
    ['S-l the false branch of a ternary', action("try { await go(id); return { ok: true }; } catch (e: any) { return { error: id ? 'x' : e.message }; }")],
  ])('%s', (_, src) => {
    expect(actionReturnLeaks(src, FILE, tree({})), src).not.toEqual([]);
  });
});

/** A service export that catches and hands the text back, and its fixed twin. */
const CATCHER = "export async function run() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n";
const CLEAN_RUN = "export async function run() { try { await go(); return 'ok'; } catch { return 'failed'; } }\n";

/** İNCELEME-107 B-1: a dynamic load was read as a package, so what it returned was never asked about. */
describe('B-1: a module loaded with import() or require()', () => {
  test.each([
    ['M1 a namespace from import()', "const m = await import('@/lib/svc');\nreturn { error: await m.run() };"],
    ['M2 destructured from import()', "const { run } = await import('@/lib/svc');\nreturn { error: await run() };"],
    ['M2b destructured under another name', "const { run: load } = await import('@/lib/svc');\nreturn { error: await load() };"],
    ['M4 require()', "const { run } = require('@/lib/svc');\nreturn { error: await run() };"],
    ['a namespace from require()', "const svc = require('@/lib/svc');\nreturn { error: await svc.run() };"],
    ['used in place', "return { error: await (await import('@/lib/svc')).run() };"],
    ['a member read, then called', "const m = await import('@/lib/svc');\nconst f = m.run;\nreturn { error: await f() };"],
  ])('%s', (_, body) => {
    expect(actionReturnLeaks(action(body), FILE, tree({ 'src/lib/svc.ts': CATCHER }))).not.toEqual([]);
    // The same load of the fixed module: followed, not only distrusted.
    expect(actionReturnLeaks(action(body), FILE, tree({ 'src/lib/svc.ts': CLEAN_RUN }))).toEqual([]);
  });

  test('`import svc = require(…)`', () => {
    const src = action('return { error: await svc.run() };', "import svc = require('@/lib/svc');");
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/svc.ts': CATCHER }))).not.toEqual([]);
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/svc.ts': CLEAN_RUN }))).toEqual([]);
  });

  test('the CORDIS action of 5e674e7f with its import made dynamic (one line) is still caught', () => {
    const src = action("const { runImport } = await import('@/lib/k2/importer');\n" + USE_IMPORT);
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/k2/importer.ts': LEAKY_SERVICE }))).toEqual([6]);
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/k2/importer.ts': CODED_SERVICE }))).toEqual([]);
  });

  test('m11: `withSystemScope` loaded with import(), clean and made to leak', () => {
    const body = "const { withSystemScope } = await import('@/lib/system-scope');\nreturn withSystemScope('x', {}, async () => ({ ok: true }));";
    const clean = 'export async function withSystemScope<T>(p: string, c: object, f: () => Promise<T>): Promise<T> { return f(); }\n';
    const leaky = 'export async function withSystemScope<T>(p: string, c: object, f: () => Promise<T>): Promise<T> { try { return await f(); } catch (e) { return String(e) as unknown as T; } }\n';
    expect(actionReturnLeaks(action(body), FILE, tree({ 'src/lib/system-scope.ts': clean }))).toEqual([]);
    expect(actionReturnLeaks(action(body), FILE, tree({ 'src/lib/system-scope.ts': leaky }))).toEqual([5]);
  });

  test('a load the scan cannot pin to one export counts as a leak (fail-closed)', () => {
    const svc = tree({ 'src/lib/svc.ts': CLEAN_RUN });
    // A specifier that is not a string.
    expect(actionReturnLeaks(action("const p = '@/lib/svc';\nconst m = await import(p);\nreturn { r: await m.run() };"), FILE, svc)).not.toEqual([]);
    // M3: a load used another way than bound or called in place.
    expect(actionReturnLeaks(action("return { r: await import('@/lib/svc').then((m) => m.run()) };"), FILE, svc)).not.toEqual([]);
    // Destructured deeper than one level.
    expect(actionReturnLeaks(action("const { run: { call } } = await import('@/lib/svc');\nreturn { r: await call() };"), FILE, svc)).not.toEqual([]);
    // The namespace as a whole.
    expect(actionReturnLeaks(action("const m = await import('@/lib/svc');\nreturn { m };"), FILE, svc)).not.toEqual([]);
    // A module that is not there.
    expect(actionReturnLeaks(action("const { run } = await import('@/lib/missing');\nreturn { r: await run() };"), FILE, tree({}))).not.toEqual([]);
  });

  test('a package loaded with import() is judged like a package import', () => {
    expect(actionReturnLeaks(action("const { z } = await import('zod');\nreturn { ok: z.string().safeParse(id).success };"), FILE, tree({}))).toEqual([]);
  });
});

/** İNCELEME-107 B-2: the `.code` exemption held for a binding whose `.code` had been overwritten. */
describe('B-2: a write to the caught value ends its `.code` trust', () => {
  test.each([
    ['V1 e.code = e.message', action("try { await go(id); return { ok: true }; } catch (e: any) { e.code = e.message; return { code: e.code }; }")],
    ['the normalise idiom e.code = e.code ?? e.message', action("try { await go(id); return { ok: true }; } catch (e: any) { e.code = e.code ?? e.message; return { code: e.code }; }")],
    ['V2 Object.assign(e, …)', action("try { await go(id); return { ok: true }; } catch (e: any) { Object.assign(e, { code: String(e) }); return { code: e.code }; }")],
    ['Object.defineProperty(e, …)', action("try { await go(id); return { ok: true }; } catch (e: any) { Object.defineProperty(e, 'code', { value: String(e) }); return { code: e.code }; }")],
    ['Reflect.set(e, …)', action("try { await go(id); return { ok: true }; } catch (e: any) { Reflect.set(e, 'code', String(e)); return { code: e.code }; }")],
    ['V3 [e] = […]', action("try { await go(id); return { ok: true }; } catch (e: any) { [e] = [{ code: String(e) }]; return { code: e.code }; }")],
    ['V4 through a const alias', action("try { await go(id); return { ok: true }; } catch (e) { const err = e as any; err.code = err.message; return { code: err.code }; }")],
    ['the alias written, the binding read', action("try { await go(id); return { ok: true }; } catch (e) { const err = e as any; err.code = err.message; return { code: (e as any).code }; }")],
    ['V5 for (e of …)', action("try { await go(id); return { ok: true }; } catch (e: any) { for (e of [{ code: String(e) }]) {} return { code: e.code }; }")],
    // K6: any write to the binding ends the trust, `++`/`--` included.
    ['K6 e++', action("try { await go(id); return { ok: true }; } catch (e: any) { e++; return { code: e.code }; }")],
    ['a local function that writes its parameter', action("try { await go(id); return { ok: true }; } catch (e: any) { norm(e); return { code: e.code }; }", 'function norm(x: any) { x.code = x.message; }')],
  ])('%s', (_, src) => {
    expect(actionReturnLeaks(src, FILE, tree({})), src).not.toEqual([]);
  });

  test('an imported function the binding is handed to may write it', () => {
    const src = action("try { await go(id); return { ok: true }; } catch (e: any) { normalise(e); return { code: e.code }; }", "import { normalise } from '@/lib/errs';");
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/errs.ts': 'export function normalise(x: any) { x.code = x.message; }\n' }))).not.toEqual([]);
  });

  test('the trust stays for a binding that is only read', () => {
    const fine = [
      action("try { await go(id); return { ok: true }; } catch (e: any) { console.error('[x]', e); return { code: e.code }; }"),
      // `!e` reads the binding; it does not write it.
      action("try { await go(id); return { ok: true }; } catch (e: any) { if (!e) return { code: 'x' }; return { code: e.code }; }"),
      // A field of it written: the value's own code is not.
      action("try { await go(id); return { ok: true }; } catch (e: any) { const seen = { n: 0 }; seen.n++; return { code: e.code }; }"),
    ];
    for (const src of fine) expect(actionReturnLeaks(src, FILE, tree({})), src).toEqual([]);
  });
});

/** İNCELEME-107 Y-1: a `'use server'` file whose export is not a function it writes. */
describe('Y-1: an action exported from elsewhere', () => {
  const WRAP = 'export function withAuth<T extends (...a: any[]) => any>(f: T): T { return (async (...a: any[]) => f(...a)) as T; }\n';
  test.each([
    ['M5 export { run as act } from', "'use server';\nexport { run as act } from '@/lib/svc';\n", [2]],
    ['M6 export const act = run', "'use server';\nimport { run } from '@/lib/svc';\nexport const act = run;\n", [3]],
    ['M7 a wrapper: withAuth(run)', "'use server';\nimport { run } from '@/lib/svc';\nimport { withAuth } from '@/lib/auth-wrap';\nexport const act = withAuth(run);\n", [4]],
    ['M8 export default run', "'use server';\nimport { run } from '@/lib/svc';\nexport default run;\n", [3]],
    ['export { run as act }', "'use server';\nimport { run } from '@/lib/svc';\nexport { run as act };\n", [3]],
    ['a wrapper around an inline action', "'use server';\nimport { withAuth } from '@/lib/auth-wrap';\nexport const act = withAuth(async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } });\n", [3]],
  ])('%s', (_, src, lines) => {
    const read = tree({ 'src/lib/svc.ts': CATCHER, 'src/lib/auth-wrap.ts': WRAP });
    expect(actionReturnLeaks(src, FILE, read)).toEqual(lines);
    // The same shape over the fixed service is clean: the export is judged, not its form.
    if (src.includes('@/lib/svc')) expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/svc.ts': CLEAN_RUN, 'src/lib/auth-wrap.ts': WRAP }))).toEqual([]);
  });

  test('types are not judged, and only a top-level directive makes a file of actions', () => {
    const read = tree({ 'src/lib/svc.ts': CATCHER + 'export type R = string;\n' });
    expect(actionReturnLeaks("'use server';\nexport type { R } from '@/lib/svc';\nexport interface I { a: string }\nexport async function act() { return 1; }\n", FILE, read)).toEqual([]);
    // A page with an inline action: its other exports are components, not actions.
    expect(actionReturnLeaks("export default function Page() {\n  async function act() {\n    'use server';\n  }\n  return act;\n}\nexport { run } from '@/lib/svc';\n", 'src/app/page.tsx', read)).toEqual([]);
  });
});

/** İNCELEME-107 Y-2: a caught value that leaves a function through a parameter or a callback. */
describe('Y-2: out through a parameter or a callback', () => {
  const WRITER = "export async function run(o: { detail: string }) { try { await go(); } catch (e) { o.detail = String(e); } }\n";
  const CALLER = "export async function run(onError: (m: string) => void) { try { await go(); } catch (e) { onError(String(e)); } }\n";
  test.each([
    ['M18 a service writes it into the object passed in', "import { run } from '@/lib/svc';", "const out = { detail: '' };\nawait run(out);\nreturn out;", { 'src/lib/svc.ts': WRITER }],
    ['M18b one module further', "import { outer } from '@/lib/svc';", "const out = { detail: '' };\nawait outer(out);\nreturn out;", { 'src/lib/svc.ts': "import { run } from './inner';\nexport async function outer(o: { detail: string }) { await run(o); }\n", 'src/lib/inner.ts': WRITER }],
    ['a writer re-exported by name', "import { run } from '@/lib/svc';", "const out = { detail: '' };\nawait run(out);\nreturn out;", { 'src/lib/svc.ts': "export { run } from './inner';\n", 'src/lib/inner.ts': WRITER }],
    ['a namespace member', "import * as svc from '@/lib/svc';", "const out = { detail: '' };\nawait svc.run(out);\nreturn out;", { 'src/lib/svc.ts': WRITER }],
    ['M11 a service hands it to a callback', "import { run } from '@/lib/svc';", "let msg = '';\nawait run((m) => { msg = m; });\nreturn { error: msg };", { 'src/lib/svc.ts': CALLER }],
    ['an options object with an onError method', "import { run } from '@/lib/svc';", "let msg = '';\nawait run({ onError(m: string) { msg = m; } });\nreturn { error: msg };", { 'src/lib/svc.ts': "export async function run(o: { onError: (m: string) => void }) { try { await go(); } catch (e) { o.onError(String(e)); } }\n" }],
  ])('%s', (_, imports, body, modules) => {
    expect(actionReturnLeaks(action(body, imports), FILE, tree(modules as Record<string, string>))).not.toEqual([]);
  });

  test.each([
    ['M11b a local callback', "'use server';\nasync function run(onError: (m: string) => void) { try { await go(); } catch (e) { onError(String(e)); } }\nexport async function act() {\n  let msg = '';\n  await run((m) => { msg = m; });\n  return { error: msg };\n}\n"],
    ['a local helper whose own catch writes into its parameter', action("const out = { detail: '' };\nawait run(out);\nreturn out;", "async function run(o: { detail: string }) { try { await go(); } catch (e) { o.detail = String(e); } }")],
  ])('%s', (_, src) => {
    expect(actionReturnLeaks(src, FILE, tree({})), src).not.toEqual([]);
  });

  test('a function that writes or calls back only codes stays clean, and so does its clean call', () => {
    const clean = [
      ["import { run } from '@/lib/svc';", "const out = { detail: '' };\nawait run(out);\nreturn out;", { 'src/lib/svc.ts': "export async function run(o: { detail: string }) { try { await go(); } catch { o.detail = 'failed'; } }\n" }],
      ["import { run } from '@/lib/svc';", "let msg = '';\nawait run((m) => { msg = m; });\nreturn { error: msg };", { 'src/lib/svc.ts': "export async function run(onError: (m: string) => void) { try { await go(); } catch { onError('failed'); } }\n" }],
    ] as const;
    for (const [imports, body, modules] of clean) expect(actionReturnLeaks(action(body, imports), FILE, tree(modules)), body).toEqual([]);
    // A helper handed a caught value at one call does not taint another call's argument.
    const twoCalls = action("const a: Record<string, unknown> = {};\nconst b: Record<string, unknown> = {};\ntry { await go(id); } catch (e) { fill(a, e); }\nfill(b, 'ok');\nreturn b;", 'function fill(o: Record<string, unknown>, x: unknown) { o.d = String(x); }');
    expect(actionReturnLeaks(twoCalls, FILE, tree({}))).toEqual([]);
  });
});

/** İNCELEME-107 Y-3: `this.helper()`, and (same family) a write through `this` in a method. */
describe('Y-3: through `this`', () => {
  test.each([
    ['M9 an object literal method calling this.helper()', "import { svc } from '@/lib/svc';", 'return { error: await svc.run() };', { 'src/lib/svc.ts': "export const svc = {\n  async run() { return this.helper(); },\n  async helper() { try { await go(); return 'ok'; } catch (e) { return String(e); } },\n};\n" }],
    ['M10 a static method calling this.helper()', "import { Svc } from '@/lib/svc';", 'return { error: await Svc.run() };', { 'src/lib/svc.ts': "export class Svc {\n  static async run() { return this.helper(); }\n  static async helper() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n}\n" }],
    ['a static method calling Svc.helper()', "import { Svc } from '@/lib/svc';", 'return { error: await Svc.run() };', { 'src/lib/svc.ts': "export class Svc {\n  static async run() { return Svc.helper(); }\n  static async helper() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n}\n" }],
    ['M10d a method that stores it in a field', "import { Svc } from '@/lib/svc';", 'const s = new Svc();\nawait s.run();\nreturn { error: s.last };', { 'src/lib/svc.ts': "export class Svc {\n  last = '';\n  async run() { try { await go(); } catch (e) { this.last = String(e); } }\n}\n" }],
  ])('%s', (_, imports, body, modules) => {
    expect(actionReturnLeaks(action(body, imports), FILE, tree(modules as Record<string, string>))).not.toEqual([]);
  });

  test.each([
    ['V6 a local class method as a setter', action("class Box { v = ''; put(x: unknown) { this.v = String(x); } }\nconst b = new Box();\ntry { await go(id); } catch (e) { b.put(e); }\nreturn { v: b.v };")],
    ['V7 an object literal method as a setter', action("const box = { v: '', put(x: unknown) { this.v = String(x); } };\ntry { await go(id); } catch (e) { box.put(e); }\nreturn { v: box.v };")],
  ])('%s', (_, src) => {
    expect(actionReturnLeaks(src, FILE, tree({})), src).not.toEqual([]);
  });

  test('this.helper() that returns a code is clean', () => {
    const svc = "export const svc = {\n  async run() { return this.helper(); },\n  async helper() { try { await go(); return 'ok'; } catch { return 'failed'; } },\n};\n";
    expect(actionReturnLeaks(action('return { error: await svc.run() };', "import { svc } from '@/lib/svc';"), FILE, tree({ 'src/lib/svc.ts': svc }))).toEqual([]);
  });
});

/** İNCELEME-107 Y-4: an imported value that is read, not called. */
describe('Y-4: state a module exports', () => {
  test.each([
    ['M14 export let lastError', "import { run, lastError } from '@/lib/svc';", 'await run();\nreturn { error: lastError };', "export let lastError = '';\nexport async function run() { try { await go(); } catch (e) { lastError = String(e); } }\n"],
    ['M14b a field of an exported object', "import { run, state } from '@/lib/svc';", 'await run();\nreturn { error: state.last };', "export const state = { last: '' };\nexport async function run() { try { await go(); } catch (e) { state.last = String(e); } }\n"],
    ['through a namespace', "import * as svc from '@/lib/svc';", 'await svc.run();\nreturn { error: svc.lastError };', "export let lastError = '';\nexport async function run() { try { await go(); } catch (e) { lastError = String(e); } }\n"],
  ])('%s', (_, imports, body, svc) => {
    expect(actionReturnLeaks(action(body, imports), FILE, tree({ 'src/lib/svc.ts': svc }))).not.toEqual([]);
  });

  test('an exported constant, or state that only holds codes, is clean', () => {
    const svc = "export const LIMITS = { max: 3 };\nexport const state = { last: '' };\nexport async function run() { try { await go(); } catch { state.last = 'failed'; } }\n";
    expect(actionReturnLeaks(action('await run();\nreturn { limits: LIMITS, last: state.last };', "import { run, state, LIMITS } from '@/lib/svc';"), FILE, tree({ 'src/lib/svc.ts': svc }))).toEqual([]);
    // A zod schema built by a chain of package calls is not "built by a call we cannot read".
    const schemas = "import { z } from 'zod';\nexport const idSchema = z.string().trim().min(1).max(64);\n";
    expect(actionReturnLeaks(action('const v = idSchema.parse(id);\nreturn { id: v };', "import { idSchema } from '@/lib/schemas';"), FILE, tree({ 'src/lib/schemas.ts': schemas }))).toEqual([]);
  });
});

/** İNCELEME-107 Y-5: aliases other than `const a = out`. */
describe('Y-5: more aliases of the result', () => {
  test.each([
    ['V10 let alias = out', action("const out: Record<string, unknown> = { ok: false };\nlet alias = out;\ntry { await go(id); } catch (e) { alias.detail = String(e); }\nreturn out;")],
    ['V11 let a; a = out', action("const out: Record<string, unknown> = { ok: false };\nlet a: Record<string, unknown>;\na = out;\ntry { await go(id); } catch (e) { a.detail = String(e); }\nreturn out;")],
    ['V12 held in an array', action("const out: Record<string, unknown> = { ok: false };\nconst holder = [out];\ntry { await go(id); } catch (e) { holder[0]!.detail = String(e); }\nreturn out;")],
    ['V13 held in an object', action("const out: Record<string, unknown> = { ok: false };\nconst h = { out };\ntry { await go(id); } catch (e) { h.out.detail = String(e); }\nreturn out;")],
    ['held under another key', action("const out: Record<string, unknown> = { ok: false };\nconst h = { o: out };\ntry { await go(id); } catch (e) { h.o.detail = String(e); }\nreturn out;")],
  ])('%s', (_, src) => {
    expect(actionReturnLeaks(src, FILE, tree({})), src).not.toEqual([]);
  });
});

/** İNCELEME-107 Y-6: `Promise.allSettled` under other spellings, and `new Promise` resolving it. */
describe('Y-6: allSettled and new Promise', () => {
  const svc = { 'src/lib/svc.ts': "export function run() { return new Promise<string>((resolve) => { go().then(() => resolve('ok'), (e) => resolve(String(e))); }); }\n" };
  test.each([
    ['M12b Promise.allSettled.bind', action("const all = Promise.allSettled.bind(Promise);\nconst [r] = await all([go(id)]);\nreturn { error: r.status === 'rejected' ? String(r.reason) : null };"), {}],
    ["M12c Promise['allSettled']", action("const [r] = await Promise['allSettled']([go(id)]);\nreturn { error: r.status === 'rejected' ? String(r.reason) : null };"), {}],
    ['M12d const { allSettled } = Promise', action("const { allSettled } = Promise;\nconst [r] = await allSettled.call(Promise, [go(id)]);\nreturn { error: String((r as any).reason) };"), {}],
    ['M19 a service resolving with it', action('return { error: await run() };', "import { run } from '@/lib/svc';"), svc],
    ['M19b a local new Promise resolving with it', action("const msg = await new Promise<string>((resolve) => { go().then(() => resolve('ok')).catch((e) => resolve(String(e))); });\nreturn { error: msg };"), {}],
    ['resolve handed over as the rejection handler', action('const msg = await new Promise((resolve) => { go().catch(resolve); });\nreturn { error: msg };'), {}],
  ])('%s', (_, src, modules) => {
    expect(actionReturnLeaks(src, FILE, tree(modules as Record<string, string>)), src).not.toEqual([]);
  });

  test('a new Promise that resolves with its own values is clean', () => {
    const fine = [
      action("const v = await new Promise<string>((resolve) => { setTimeout(() => resolve('ok'), 1); });\nreturn { v };"),
      action("try { await new Promise((resolve, reject) => { go().then(resolve, reject); }); return { ok: true }; } catch { return { ok: false }; }"),
    ];
    for (const src of fine) expect(actionReturnLeaks(src, FILE, tree({})), src).toEqual([]);
  });
});

/**
 * İNCELEME-107 T-1: a witness for each mutant of the analyser that left every
 * test green (K2, K3, K4, K6 above in B-2, K7, K9, K12, K15, K16, K18, K19).
 */
describe('T-1: the mutants that lived', () => {
  test('K2 a module found, then gone when it is read, counts as a leak', () => {
    const files: Record<string, string> = { 'src/lib/svc.ts': CLEAN_RUN };
    const seen = new Set<string>();
    const vanishing: ModuleReader = (p) => {
      if (seen.has(p)) return undefined;
      seen.add(p);
      return files[p];
    };
    expect(actionReturnLeaks(action('return { r: await run() };', "import { run } from '@/lib/svc';"), FILE, vanishing)).not.toEqual([]);
  });

  test('K3 `export *` from an unread alias may hold the name before a clean module does', () => {
    const modules = { 'src/lib/a.ts': "export * from '#lib/b';\nexport * from './c';\n", 'src/lib/c.ts': "export function run() { return 'ok'; }\n" };
    expect(actionReturnLeaks(action('return { r: run() };', "import { run } from '@/lib/a';"), FILE, tree(modules))).not.toEqual([]);
  });

  test('K4 `for…in` over a tainted object', () => {
    expect(actionReturnLeaks(action("try { await go(id); return { ok: true }; } catch (e) { const byText = { [String(e)]: 1 }; for (const k in byText) return { error: k }; return { ok: false }; }"), FILE, tree({}))).not.toEqual([]);
    // The key alone carries it too.
    expect(actionReturnLeaks(action("try { await go(id); return { ok: true }; } catch (e) { return { [String(e)]: true }; }"), FILE, tree({}))).not.toEqual([]);
  });

  test('K7 a local rest parameter past the first tainted position', () => {
    const src = action("const out: Record<string, unknown> = {};\ntry { await go(id); } catch (e) { fill(out, 'x', e); }\nreturn out;", 'function fill(o: Record<string, unknown>, ...xs: unknown[]) { o.d = String(xs[1]); }');
    expect(actionReturnLeaks(src, FILE, tree({}))).not.toEqual([]);
  });

  test('K9 a rest parameter of an imported function', () => {
    const src = action("const out: Record<string, unknown> = {};\ntry { await go(id); } catch (e) { fill(out, 'x', e); }\nreturn out;", "import { fill } from '@/lib/svc';");
    expect(actionReturnLeaks(src, FILE, tree({ 'src/lib/svc.ts': 'export function fill(o: Record<string, unknown>, ...xs: unknown[]) { o.d = String(xs[1]); }\n' }))).not.toEqual([]);
  });

  test('K12 an export built by a call whose callee the scan cannot name', () => {
    const svc = "function makeA() { return async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } }; }\nexport const run = [makeA][0]!();\n";
    expect(actionReturnLeaks(action('return { r: await run() };', "import { run } from '@/lib/svc';"), FILE, tree({ 'src/lib/svc.ts': svc }))).not.toEqual([]);
  });

  test.each([
    ['push', "const l: string[] = [];\ntry { await go(id); } catch (e) { l.push(String(e)); }\nreturn { l };"],
    ['unshift', "const l: string[] = [];\ntry { await go(id); } catch (e) { l.unshift(String(e)); }\nreturn { l };"],
    ['splice', "const l: string[] = [];\ntry { await go(id); } catch (e) { l.splice(0, 0, String(e)); }\nreturn { l };"],
    ['fill', "const l = [''];\ntry { await go(id); } catch (e) { l.fill(String(e)); }\nreturn { l };"],
    ['set', "const m = new Map<string, string>();\ntry { await go(id); } catch (e) { m.set('d', String(e)); }\nreturn { d: m.get('d') };"],
    ['add', "const s = new Set<string>();\ntry { await go(id); } catch (e) { s.add(String(e)); }\nreturn { s: [...s] };"],
    ['append', "const form = new FormData();\ntry { await go(id); } catch (e) { form.append('d', String(e)); }\nreturn { d: form.get('d') };"],
    ['assign', "const out = {};\ntry { await go(id); } catch (e) { Object.assign(out, { d: String(e) }); }\nreturn out;"],
    ['defineProperty', "const out = {};\ntry { await go(id); } catch (e) { Object.defineProperty(out, 'd', { value: String(e) }); }\nreturn out;"],
    ['defineProperties', "const out = {};\ntry { await go(id); } catch (e) { Object.defineProperties(out, { d: { value: String(e) } }); }\nreturn out;"],
    ['setPrototypeOf', "const out = {};\ntry { await go(id); } catch (e) { Object.setPrototypeOf(out, { d: String(e) }); }\nreturn out;"],
    ['Reflect.apply', "const l: string[] = [];\ntry { await go(id); } catch (e) { Reflect.apply(Array.prototype.push, l, [String(e)]); }\nreturn { l };"],
  ])('K15/K16 the mutator %s stores it in its receiver', (_, body) => {
    expect(actionReturnLeaks(action(body), FILE, tree({})), body).not.toEqual([]);
  });

  test('K18 `export * as ns` used as a whole', () => {
    const modules = { 'src/lib/a.ts': "export * as ns from './b';\n", 'src/lib/b.ts': CLEAN_RUN };
    expect(actionReturnLeaks(action("return { r: await ns['run']() };", "import { ns } from '@/lib/a';"), FILE, tree(modules))).not.toEqual([]);
  });

  test('K19 `void` hands back nothing', () => {
    expect(actionReturnLeaks(action('try { await go(id); return { ok: true }; } catch (e) { return void console.error(e); }'), FILE, tree({}))).toEqual([]);
  });
});

/** İNCELEME-107 Ö-1: a finding names its line and the source of its value. */
describe('Ö-1: where a finding comes from', () => {
  test('a local catch, and a module export down to its catch', () => {
    expect(actionReturnFindings(action('try { await go(id); return { ok: true }; } catch (e) { return { error: String(e) }; }'), FILE, tree({}))).toEqual([
      { line: 4, via: 'catch (line 4)' },
    ]);
    const [f] = actionReturnFindings(action(USE_IMPORT, "import { runImport } from '@/lib/k2/importer';"), FILE, tree({ 'src/lib/k2/importer.ts': LEAKY_SERVICE }));
    expect(f).toEqual({ line: 5, via: 'src/lib/k2/importer.ts#runImport ← catch (line 2)' });
  });
});

/** İNCELEME-107 Ö-2: a callback whose value goes nowhere is not a sink. */
describe('Ö-2: callbacks that only log', () => {
  test('stay clean', () => {
    const fine = [
      action("try { await go(id); return { ok: true }; } catch (e) { after(() => console.error('x', e)); return { ok: false, code: 'failed' }; }", "import { after } from 'next/server';"),
      action("try { await go(id); return { ok: true }; } catch (e) { setTimeout(() => console.error(e), 0); return { ok: false, code: 'failed' }; }"),
      action("try { await go(id); return { ok: true }; } catch (e) { [1].forEach(() => console.error(String(e))); return { ok: false, code: 'failed' }; }"),
      action("try { await go(id); return { ok: true }; } catch (e) { after(() => logger.error('x', e)); return { ok: false, code: 'failed' }; }", "import { after } from 'next/server';\nimport { logger } from '@/lib/logger';"),
    ];
    const read = tree({ 'src/lib/logger.ts': 'export const logger = { error(m: string, e: unknown) { console.error(m, e); } };\n' });
    for (const src of fine) expect(actionReturnLeaks(src, FILE, read), src).toEqual([]);
  });

  test('but a callback whose value is used is still followed', () => {
    const leaks = [
      action("return { r: [id].map(() => { try { go(); return 'ok'; } catch (e) { return String(e); } }) };"),
      action("return { r: await wrap(async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } }) };", 'function wrap<T>(f: () => T) { return f(); }'),
      action("return { r: await wrap(async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } }) };", "import { wrap } from '@/lib/wrap';"),
    ];
    const read = tree({ 'src/lib/wrap.ts': 'export function wrap<T>(f: () => T) { return f(); }\n' });
    for (const src of leaks) expect(actionReturnLeaks(src, FILE, read), src).not.toEqual([]);
  });
});
