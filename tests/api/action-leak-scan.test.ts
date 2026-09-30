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
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, test, expect } from 'vitest';
import { actionReturnLeaks, mapModuleReader, type ModuleReader } from './action-leak-scan';

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
