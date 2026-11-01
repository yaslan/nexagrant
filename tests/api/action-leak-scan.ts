/**
 * Source scanner behind the server-action half of the error-body guard
 * (TASK-MUOACB79XEL25, İNCELEME-93 D-1; widened by TASK-MUOBO31H8EPR5,
 * İNCELEME-100 Y-1/Y-2/Y-3, and by TASK-MUODXBIM9H1PP, İNCELEME-107).
 *
 * The first version was a regex over `catch (name) { … }` blocks and trusted
 * any call spelled like a sanitiser. İNCELEME-93 got six shapes past it (X2–X7):
 * a destructured `catch ({ message })`, a field set on the object after it was
 * built, an outer `let` assigned in the catch, a promise `.catch((err) => err)`,
 * a local `function errorCode(x) { return String(x) }`, and a comment above
 * `'use server'` that dropped the file from the scan altogether.
 *
 * This version reads the TypeScript syntax tree and follows values, not names:
 *
 * - **Sources.** A catch binding (any destructuring of it), the parameter of a
 *   rejection handler (`.catch(h)`, `.then(_, h)`), the result of such a call
 *   when the handler hands back what it received, `Promise.allSettled` (its
 *   `reason`s; under any spelling: `Promise['allSettled']`, `.bind`, a
 *   destructured `allSettled`), a `new Promise` whose executor resolves with a
 *   caught value, and a call to a function — in this file or in a module it
 *   imports — that returns (or yields) what it caught (İNCELEME-100 Y-1: the
 *   admin CORDIS action returned `runCordisImport`'s `error`, the text of a
 *   caught value, from src/lib/k2-cordis/importer.ts). `this.m()` and
 *   `Class.m()` name the member `m` of the enclosing class or object literal.
 * - **Across modules.** An `@/` or relative import is read and analysed the same
 *   way, to any depth (each module once per reader), and its export returns a
 *   caught value when the function it names does. So is a dynamic load: `await
 *   import('…')` and a loader call — `require('…')`, `module.require('…')`,
 *   `createRequire(…)('…')` (imported from `node:module` under any name),
 *   `require.call`/`.apply`/`.bind`, or a name given any of these (`const r =
 *   require as any`, `r = module.require`, `const { require: r } = module`, an
 *   import of a module's `export const r = require`) —
 *   bound to a name (a namespace), destructured one level (`const { run } =
 *   await import('…')`), or used in place (`(await import('…')).run()`);
 *   İNCELEME-107 B-1, İNCELEME-118 B-2/Y-1. Any other read of a loader, of
 *   `createRequire` or of the `module` object (`use(require)`, `[require][0]`,
 *   `const m = module`) is itself a finding, and makes a module's every export
 *   leak (fail-closed). An import into src/ that
 *   names no file, a load whose specifier is not a string literal, a load used
 *   any other way (`import('…').then(…)`, deeper destructuring), a name the
 *   module does not export, an export built by a call (`export const run =
 *   make()`), an alias other than `@/`, and a module still being analysed (an
 *   import cycle) all count as returning one (fail-closed). An imported value
 *   that is read rather than called (`export let lastError`, `state.last`) is
 *   what the module holds in it (Y-4). A package import is not followed: its
 *   call carries taint only from its arguments.
 * - **Flow.** An object literal holds what any of its values or computed keys
 *   (`{ [String(e)]: true }`) holds. A declaration, an assignment (to a variable, or to a field or
 *   element of one, which taints the whole object), a destructuring, a `for…of`
 *   or `for…in` over a tainted value, an alias of an object (`const a = out`,
 *   `let a = out`, `a = out`, `const { meta } = out`, `const holder = [out]`,
 *   `const h = { out }`: tainting `a` taints `out`), and a call with a tainted
 *   argument (`out.push(e)`, `Object.assign(out, e)`, `Reflect.set(out, k, e)`,
 *   `Reflect.apply(push, out, [e])`, `fill(out, e)`: the receiver and every
 *   argument's root now hold it; a local callee's parameter and a callback's
 *   parameters are tainted too) carry taint on. A function — local or imported
 *   — that writes what it caught into a parameter (`o.detail = String(e)`) or
 *   hands it to a callback parameter (`onError(String(e))`) taints the caller's
 *   argument, or the callback's parameters, at every call (Y-2). Calling a
 *   tainted function value yields a tainted value. Names are resolved by
 *   symbol, so the same spelling in another function is another variable.
 * - **What does not carry it.** A comparison, `instanceof`, `typeof`, `!`,
 *   `void`, the condition of a ternary, the `.code` of a caught value itself (a
 *   domain error's own code, evidence/actions.ts `UploadRefused`: the catch
 *   binding or handler parameter, or a `const` alias of it, never written — not
 *   the `.code` of an object built from one, İNCELEME-100 N4/N5/N16; a binding
 *   is written when it or an alias of it is assigned, is the root of an
 *   assigned field (`e.code = …`), is destructured into, is a `for…of` target,
 *   is `++`/`--`/`delete`d, is the first argument of `Object.assign` and its
 *   kin, or is handed to an imported function or to a local one that writes its
 *   parameter; İNCELEME-107 B-2), a function value, and a call to a sanitiser.
 * - **Sanitisers.** A function imported under its own name from the module
 *   listed in {@link SANITISERS}, whose own tests pin what it returns — or a
 *   function declared in the same file whose every return is clean when all its
 *   parameters are tainted (ajans `errorCode`, admin plans `planFailure`). A
 *   local function is judged by its body, never by its name.
 * - **Sinks.** Every `return` (and arrow expression body, and `yield`) in the
 *   file, nested functions included, except inside a rejection handler, whose
 *   value is followed through the call instead, and except in a function passed
 *   straight to a call (`after(() => log(e))`, `ids.map((i) => …)`): its value
 *   reaches the client only through that call's result, which is followed.
 *   In a file with a top-level `'use server'`, every export that is not a
 *   function written in the file (`export { run as act } from '…'`, `export
 *   const act = withAuth(run)`, `export default run`) is judged by what calling
 *   it hands back (Y-1).
 *
 * A write through `this` in a method (`put(x) { this.v = String(x) }`) taints
 * the class (every instance of it) or the object literal.
 *
 * Known limits (none occurs in src today; each is a follow-up, not a licence):
 * an `EventEmitter` error listener, a method of a local object handed the caught
 * binding (its `.code` stays trusted), a caught value that leaves through
 * something other than a return (a redirect URL, a cookie), a loader reached
 * through a global object (`globalThis.require`, `global.module`) or built from
 * text (`eval`, `new Function`), and these writes (İNCELEME-116 Y-3, İNCELEME-118
 * Ö-2):
 * - `Object`/`Reflect` under another spelling: `Object['assign']`,
 *   `Reflect['set']`, `const O = Object; O.assign(…)`, `globalThis.Object.assign(…)`;
 * - `Object.assign.call(null, e, …)` and `.apply(null, [e, …])`: the scan takes
 *   the `this` argument (`args[0]`) as the target, as it must for
 *   `Array.prototype.push.call(out, e)`, so the real target `args[1]` is missed;
 * - `Reflect.apply(Object.assign, null, [e, …])`: the target inside the array;
 * - a callback's parameter written to (`[e].forEach((x) => { x.code = … })`,
 *   `Promise.resolve(e).then((x) => { x.code = … })`): the parameter is tainted,
 *   but the write does not reach the array or promise it came from;
 * - a copy of an array that holds the object (`[out].slice()[0].m = String(e)`).
 * `export * from '…'` and a reassigned `export function` in a `'use server'`
 * file are not checked either: `next build` and tsc reject both.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import ts from 'typescript';

/**
 * Imported functions trusted to turn a caught value into a fixed code, keyed by
 * export name → the module (repo-relative, no extension) that must export it.
 * Each has its own test holding its output to codes.
 */
export const SANITISERS: Readonly<Record<string, string>> = {
  // src/lib/errors.test.ts: only a string `code` property, else undefined.
  errorCode: 'src/lib/errors',
  // src/lib/pilot-expired.test.ts: the pilot code or the caller's literal fallback.
  failureCode: 'src/lib/pilot-expired',
  // src/lib/email/mailer.test.ts: MailSendError's code-only text, else null.
  mailFailureCode: 'src/lib/email/mailer',
  // src/app/[locale]/admin/billing/plans/actions.test.ts: a PLAN_FAILURE_CODES entry.
  planFailureCode: 'src/app/[locale]/admin/billing/plans/failure-codes',
  // src/app/[locale]/admin/tenants/actions.test.ts: a TENANT_FAILURE_CODES entry.
  tenantFailureCode: 'src/app/[locale]/admin/tenants/failure-codes',
};

/** Reads a repo-relative file, or `undefined` when there is none. */
export type ModuleReader = (repoRel: string) => string | undefined;

export function fsModuleReader(root: string): ModuleReader {
  return (p) => {
    try {
      return readFileSync(join(root, p), 'utf8');
    } catch {
      return undefined;
    }
  };
}

/** A reader over an in-memory tree, for fixtures. */
export function mapModuleReader(files: Record<string, string>): ModuleReader {
  return (p) => files[p];
}

const DEFAULT_READER = fsModuleReader(process.cwd());

/** Whether the file has a `'use server'` directive: at the top, or opening a function body. */
export function hasUseServerDirective(src: string, fileName = 'file.tsx'): boolean {
  if (!/['"]use server['"]/.test(src)) return false;
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  if (directive(sf.statements)) return true;
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isFunctionLike(n) && 'body' in n && n.body && ts.isBlock(n.body) && directive(n.body.statements)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function directive(stmts: readonly ts.Statement[]) {
  for (const s of stmts) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === 'use server') return true;
  }
  return false;
}

function scriptKind(fileName: string) {
  if (/\.[cm]?jsx?$/.test(fileName)) return fileName.endsWith('x') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

type FnNode = ts.FunctionLikeDeclaration;
type CleanSet = { has(f: ts.Node): boolean };

/** A line that hands a caught value back, and where that value came from (İNCELEME-107 Ö-1). */
export type Finding = { line: number; via: string };

/**
 * Lines where the file hands a caught value (or something built from it) back
 * through a `return`. `fileName` is repo-relative; `@/` and relative imports
 * are read through `read` (the working tree by default).
 */
export function actionReturnLeaks(src: string, fileName = 'src/actions/fixture.ts', read: ModuleReader = DEFAULT_READER): number[] {
  return actionReturnFindings(src, fileName, read).map((f) => f.line);
}

/** {@link actionReturnLeaks} with the source of each line: `catch (line 12)`, `src/lib/x.ts#run ← catch (line 3)`. */
export function actionReturnFindings(src: string, fileName = 'src/actions/fixture.ts', read: ModuleReader = DEFAULT_READER): Finding[] {
  return analyseFile(src, fileName, read, true).findings;
}

// --- Module resolution and per-module summaries. ---

/** An import into src/ the scan cannot pin to one file: counts as a leak. */
const UNRESOLVED = '\0unresolved';
const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

const resolved = new WeakMap<ModuleReader, Map<string, string | null>>();
/** The repo-relative file `spec` names from `from`; `null` for a package or data; UNRESOLVED otherwise. */
function resolveSpec(from: string, spec: string, read: ModuleReader): string | null {
  let byKey = resolved.get(read);
  if (!byKey) resolved.set(read, (byKey = new Map()));
  const key = `${spec.startsWith('.') ? dirname(from) : ''}\0${spec}`;
  let r = byKey.get(key);
  if (r === undefined) byKey.set(key, (r = resolveUncached(from, spec, read)));
  return r;
}
function resolveUncached(from: string, spec: string, read: ModuleReader): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(from), spec);
  else if (/^[#~]/.test(spec)) return UNRESOLVED; // an alias the scan does not read
  else return null;
  base = normalize(base).split('\\').join('/');
  if (/\.(json|css|scss|svg|png|jpe?g|txt|md)$/.test(base)) return null;
  const stem = base.replace(/\.[cm]?jsx?$/, '');
  const tries = [base, ...CODE_EXTS.map((x) => stem + x), ...CODE_EXTS.map((x) => `${stem}/index${x}`)];
  for (const c of tries) if (read(c) !== undefined) return c;
  return UNRESOLVED;
}

/**
 * What calling a function does to its arguments besides returning: `writes`,
 * the arguments it stores a caught value in; `calls`, the arguments it calls
 * (callbacks) with one.
 */
type Effects = { writes: readonly number[]; calls: readonly number[] };
const ALL_ARGS = Array.from({ length: 8 }, (_, k) => k);
const ALL_EFFECTS: Effects = { writes: ALL_ARGS, calls: ALL_ARGS };
const NO_EFFECTS: Effects = { writes: [], calls: [] };

/**
 * `exportLeaks(name, member, deep)`: whether calling the export hands back a
 * caught value; with `deep`, whether anything it builds may (a factory whose
 * result is itself called, `export const run = make()`). `effects(name, i)`:
 * what calling it does to its arguments when argument `i` is tainted (`null`:
 * none is).
 */
type Summary = {
  findings: Finding[];
  exportLeaks: (name: string, member?: string, deep?: boolean) => boolean;
  exportVia: (name: string) => string | undefined;
  effects: (name: string, i: number | null) => Effects;
  /** Whether the export is a loader or `createRequire` (`export const r = require`). */
  exportKind: (name: string) => ModuleKind;
};
type ModuleKind = 'loader' | 'factory' | undefined;
const PENDING = Symbol('pending');
const summaries = new WeakMap<ModuleReader, Map<string, Summary | typeof PENDING>>();

function summaryOf(file: string, read: ModuleReader): Summary | undefined {
  if (file === UNRESOLVED) return undefined;
  let byFile = summaries.get(read);
  if (!byFile) summaries.set(read, (byFile = new Map()));
  const s = byFile.get(file);
  if (s === PENDING) return undefined; // an import cycle: fail-closed
  if (s) return s;
  const src = read(file);
  if (src === undefined) return undefined;
  byFile.set(file, PENDING);
  let out: Summary;
  try {
    out = analyseFile(src, file, read);
  } finally {
    byFile.delete(file);
  }
  byFile.set(file, out);
  return out;
}

/** Whether module `file`'s export `name` (its `member`, for an object or class) hands back a caught value. */
function moduleExportLeaks(file: string, name: string, member: string | undefined, read: ModuleReader, deep = false): boolean {
  const s = summaryOf(file, read);
  return s ? s.exportLeaks(name, member, deep) : true;
}

/** What module `file`'s function `name` does to its arguments; everything when unknown. */
function moduleEffects(file: string, name: string, i: number | null, read: ModuleReader): Effects {
  const s = summaryOf(file, read);
  return s ? s.effects(name, i) : ALL_EFFECTS;
}

const viaInProgress = new Set<string>();
function moduleVia(file: string, name: string, read: ModuleReader): string {
  if (file === UNRESOLVED) return 'an import the scan cannot read (fail-closed)';
  const key = `${file}#${name}`;
  if (viaInProgress.has(key)) return `${key} (an import cycle, fail-closed)`;
  viaInProgress.add(key);
  try {
    const via = summaryOf(file, read)?.exportVia(name);
    return via ? `${key} ← ${via}` : key;
  } finally {
    viaInProgress.delete(key);
  }
}

/** Where an import binding points: its module (`null` for a package) and export (`undefined` for the namespace). */
type ImportTarget = { file: string | null; name?: string };

function analyseFile(src: string, fileName: string, read: ModuleReader, action = false): Summary {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const host: ts.CompilerHost = {
    getSourceFile: (f) => (f === fileName ? sf : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => f === fileName,
    readFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options: { noLib: true, noResolve: true, types: [], jsx: ts.JsxEmit.Preserve, allowJs: true },
    host,
  });
  const checker = program.getTypeChecker();
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const symbolOf = (id: ts.Node): ts.Symbol | undefined => {
    if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
      return checker.getShorthandAssignmentValueSymbol(id.parent);
    }
    return checker.getSymbolAtLocation(id);
  };
  /** A name with no declaration in the file: `Promise`, `Object`, `require`. */
  const isGlobal = (e: ts.Node, name: string) => ts.isIdentifier(e) && e.text === name && !symbolOf(e)?.declarations?.length;

  /** `k` for `o.k` and `o['k']`; `undefined` for anything else. */
  const memberName = (x: ts.Expression): string | undefined => {
    if (ts.isPropertyAccessExpression(x)) return x.name.text;
    if (ts.isElementAccessExpression(x) && ts.isStringLiteralLike(x.argumentExpression)) return x.argumentExpression.text;
    return undefined;
  };
  /**
   * The values a name is given in this file: its initializer, each value
   * assigned to it, and `[o, k]` for `const { k: x } = o` (TASK-MUOIBQJJDKL28,
   * İNCELEME-118 Y-1). Built from `flows` when first asked.
   */
  let givenBySymbol: Map<ts.Symbol, { value: ts.Expression; key?: string }[]> | undefined;
  const given = (s: ts.Symbol) => {
    if (!givenBySymbol) {
      const map = (givenBySymbol = new Map());
      const give = (id: ts.Node, value: ts.Expression, key?: string) => {
        const t = ts.isIdentifier(id) ? symbolOf(id) : undefined;
        if (!t) return;
        let list = map.get(t);
        if (!list) map.set(t, (list = []));
        list.push({ value, key });
      };
      for (const f of flows) {
        if (ts.isVariableDeclaration(f) && f.initializer) {
          if (ts.isIdentifier(f.name)) give(f.name, f.initializer);
          else if (ts.isObjectBindingPattern(f.name)) {
            for (const el of f.name.elements) {
              const k = el.propertyName ?? el.name;
              if (!el.dotDotDotToken && (ts.isIdentifier(k) || ts.isStringLiteral(k))) give(el.name, f.initializer, k.text);
            }
          }
        } else if (ts.isBinaryExpression(f) && ts.isIdentifier(skipWrappers(f.left))) give(skipWrappers(f.left), f.right);
      }
    }
    return givenBySymbol.get(s) ?? [];
  };
  /**
   * What a value is to the module system: `'loader'` for a function that loads
   * a module by its specifier (the global `require`, `module.require`, what
   * `createRequire(…)` or `require.bind(…)` returns, and any name given one of
   * these), `'factory'` for `createRequire` itself (imported from `node:module`
   * under any name, or reached as `nm.createRequire`), `undefined` otherwise.
   * Through wrappers and the right side of a comma (`(0, require)`).
   */
  /** The kind of an imported binding (its `member`, for a namespace), from its module's summary. */
  const importedKind = (s: ts.Symbol, member?: string): ModuleKind => {
    const t = importTarget(s);
    const name = t?.name ?? member;
    if (!t || t.file === null || t.file === UNRESOLVED || name === undefined) return undefined;
    return summaryOf(t.file, read)?.exportKind(name);
  };
  const kinds = new Map<ts.Node, 'loader' | 'factory' | undefined>();
  const moduleKind = (e: ts.Expression, seen?: Set<ts.Symbol>): 'loader' | 'factory' | undefined => {
    if (seen) return moduleKindOf(e, seen);
    if (!kinds.has(e)) kinds.set(e, moduleKindOf(e, new Set()));
    return kinds.get(e);
  };
  const moduleKindOf = (e: ts.Expression, seen: Set<ts.Symbol>): 'loader' | 'factory' | undefined => {
    let x = skipWrappers(e);
    while (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.CommaToken) x = skipWrappers(x.right);
    if (isGlobal(x, 'require')) return 'loader';
    const key = memberName(x);
    if (key !== undefined) {
      const obj = skipWrappers((x as ts.PropertyAccessExpression).expression);
      if (key === 'require' && isGlobal(obj, 'module')) return 'loader';
      if (key === 'createRequire') return 'factory';
      // `L.r` on `import * as L from '…'`: what that module exports under `r`.
      const ns = ts.isIdentifier(obj) ? symbolOf(obj) : undefined;
      const nd = ns?.declarations?.[0];
      return nd && ts.isNamespaceImport(nd) ? importedKind(ns!, key) : undefined;
    }
    if (ts.isCallExpression(x)) {
      const t = skipWrappers(x.expression);
      if (moduleKind(t, seen) === 'factory') return 'loader';
      if (memberName(t) === 'bind' && moduleKind((t as ts.PropertyAccessExpression).expression, seen) === 'loader') return 'loader';
      return undefined;
    }
    if (!ts.isIdentifier(x)) return undefined;
    if (x.text === 'createRequire') return 'factory';
    const s = symbolOf(x);
    if (!s || seen.has(s)) return undefined;
    seen.add(s);
    const d = s.declarations?.[0];
    if (d && ts.isImportSpecifier(d) && (d.propertyName ?? d.name).text === 'createRequire') return 'factory';
    // `import { r } from '…'` where that module has `export const r = require`.
    if (d && ts.isImportSpecifier(d)) return importedKind(s);
    for (const g of given(s)) {
      const k =
        g.key === undefined
          ? moduleKind(g.value, seen)
          : g.key === 'require' && isGlobal(skipWrappers(g.value), 'module')
            ? 'loader'
            : g.key === 'createRequire'
              ? 'factory'
              : undefined;
      if (k) return k;
    }
    return undefined;
  };

  /**
   * The module `import('…')` or a loader call (`require('…')`,
   * `createRequire(…)('…')`, `module.require('…')`, `r('…')` for a name given
   * a loader, `require.call(null, '…')`, `require.apply(null, ['…'])`) loads,
   * through `await` and parentheses; `null` for a package, UNRESOLVED for a
   * specifier that is not a string literal, `undefined` when `e` is no such load.
   */
  const dynamicLoad = (e: ts.Expression): string | null | undefined => {
    let x = skipWrappers(e);
    if (ts.isAwaitExpression(x)) x = skipWrappers(x.expression);
    if (!ts.isCallExpression(x)) return undefined;
    const load = (spec: ts.Expression | undefined) => (spec && ts.isStringLiteralLike(spec) ? resolveSpec(fileName, spec.text, read) : UNRESOLVED);
    const t = skipWrappers(x.expression);
    if (t.kind === ts.SyntaxKind.ImportKeyword || moduleKind(t) === 'loader') return load(x.arguments[0]);
    const via = memberName(t);
    if ((via === 'call' || via === 'apply') && moduleKind((t as ts.PropertyAccessExpression).expression) === 'loader') {
      const a = x.arguments[1];
      if (via === 'call') return load(a);
      const arr = a && skipWrappers(a);
      return load(arr && ts.isArrayLiteralExpression(arr) ? arr.elements[0] : undefined);
    }
    return undefined;
  };

  // --- Collect functions, rejection handlers and the nodes that move values. ---
  const functions: FnNode[] = [];
  const catchBindings: ts.BindingName[] = [];
  const flows: ts.Node[] = [];
  /**
   * `const a = <reference>` (or `let`, or `a = <reference>`, or a literal that
   * holds one): tainting a binding on the left taints the reference's root.
   * `plain` for `const|let a = b`, the same value under another name.
   */
  const aliases: { names: ts.Identifier[]; root: ts.Identifier; plain: boolean }[] = [];
  const addAliases = (names: ts.Identifier[], init: ts.Expression, plain: boolean) => {
    const root = referenceRoot(init);
    if (root) aliases.push({ names, root, plain: plain && ts.isIdentifier(skipWrappers(init)) });
    const x = skipWrappers(init);
    // `[out]`, `{ out }`, `{ o: out.meta }`: the literal holds the object itself.
    if (ts.isArrayLiteralExpression(x)) for (const el of x.elements) addAliases(names, ts.isSpreadElement(el) ? el.expression : el, false);
    if (ts.isObjectLiteralExpression(x)) {
      for (const p of x.properties) {
        if (ts.isPropertyAssignment(p)) addAliases(names, p.initializer, false);
        else if (ts.isShorthandPropertyAssignment(p)) addAliases(names, p.name, false);
        else if (ts.isSpreadAssignment(p)) addAliases(names, p.expression, false);
      }
    }
  };
  const rejectionHandlers = new Set<ts.Node>();
  /** Roots written to (`e = …`, `e.code = …`, `[e] = …`, `for (e of …)`, `e++`, `delete e.x`): no `.code` trust for them. */
  const writes: ts.Identifier[] = [];
  const writeRoot = (e: ts.Expression) => {
    const x = skipWrappers(e);
    if (ts.isObjectLiteralExpression(x) || ts.isArrayLiteralExpression(x)) writes.push(...bindingIds(x));
    else {
      const r = rootIdentifier(x);
      if (r) writes.push(r);
    }
  };
  const visit = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && 'body' in n && n.body) functions.push(n as FnNode);
    if (ts.isCatchClause(n) && n.variableDeclaration) catchBindings.push(n.variableDeclaration.name);
    if (ts.isVariableDeclaration(n) && n.initializer) {
      flows.push(n);
      addAliases(bindingIds(n.name), n.initializer, ts.isIdentifier(n.name));
    }
    if (ts.isBinaryExpression(n) && isAssignment(n.operatorToken.kind)) {
      flows.push(n);
      writeRoot(n.left);
      const left = skipWrappers(n.left);
      if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(left)) addAliases([left], n.right, false);
    }
    if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      writeRoot(n.operand);
    }
    if (ts.isDeleteExpression(n)) writeRoot(n.expression);
    if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {
      flows.push(n);
      if (!ts.isVariableDeclarationList(n.initializer)) writeRoot(n.initializer);
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      flows.push(n);
      if (ts.isCallExpression(n)) {
        const h = rejectionHandler(n);
        if (h) rejectionHandlers.add(h);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  /** Sanitiser imported under its own name from its listed module. */
  const trustedImport = (sym: ts.Symbol): boolean => {
    const decl = sym.declarations?.[0];
    if (!decl || !ts.isImportSpecifier(decl)) return false;
    const exported = (decl.propertyName ?? decl.name).text;
    const expected = SANITISERS[exported];
    if (!expected) return false;
    const spec = (decl.parent.parent.parent.moduleSpecifier as ts.StringLiteral).text;
    const resolved = spec.startsWith('@/')
      ? join('src', spec.slice(2))
      : spec.startsWith('.')
        ? join(dirname(fileName), spec)
        : spec;
    return normalize(resolved).split('\\').join('/').replace(/\.tsx?$/, '') === expected;
  };

  /** What a name bound by an import (static, `import x = require`, or a dynamic load) points at. */
  const targets = new Map<ts.Symbol, ImportTarget | undefined>();
  const importTarget = (sym: ts.Symbol): ImportTarget | undefined => {
    if (!targets.has(sym)) targets.set(sym, importTargetOf(sym));
    return targets.get(sym);
  };
  const importTargetOf = (sym: ts.Symbol): ImportTarget | undefined => {
    const decl = sym.declarations?.[0];
    if (!decl) return undefined;
    const staticFile = (d: ts.Node) =>
      ts.isImportDeclaration(d) && ts.isStringLiteral(d.moduleSpecifier) ? resolveSpec(fileName, d.moduleSpecifier.text, read) : UNRESOLVED;
    if (ts.isImportSpecifier(decl)) return { file: staticFile(decl.parent.parent.parent), name: (decl.propertyName ?? decl.name).text };
    if (ts.isImportClause(decl)) return { file: staticFile(decl.parent), name: 'default' };
    if (ts.isNamespaceImport(decl)) return { file: staticFile(decl.parent.parent) };
    if (ts.isImportEqualsDeclaration(decl)) {
      const ref = decl.moduleReference;
      if (!ts.isExternalModuleReference(ref)) return undefined;
      return { file: ts.isStringLiteral(ref.expression) ? resolveSpec(fileName, ref.expression.text, read) : UNRESOLVED };
    }
    // `const m = await import('…')`: the namespace.
    if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.initializer) {
      const file = dynamicLoad(decl.initializer);
      return file === undefined ? undefined : { file };
    }
    if (!ts.isBindingElement(decl)) return undefined;
    // `const { run } = await import('…')`: that export; `...rest` is the namespace.
    const pattern = decl.parent;
    const holder = pattern.parent;
    if (ts.isObjectBindingPattern(pattern) && ts.isVariableDeclaration(holder) && holder.initializer) {
      const file = dynamicLoad(holder.initializer);
      if (file === undefined) return undefined;
      if (decl.dotDotDotToken) return { file };
      const key = decl.propertyName ?? decl.name;
      if (ts.isIdentifier(key) || ts.isStringLiteral(key)) return { file, name: key.text };
      return { file: file === null ? null : UNRESOLVED };
    }
    // Deeper, or an array pattern: the scan does not follow it (fail-closed for src/).
    let d: ts.Node = decl;
    while (ts.isBindingElement(d) || ts.isObjectBindingPattern(d) || ts.isArrayBindingPattern(d)) d = d.parent;
    if (!ts.isVariableDeclaration(d) || !d.initializer) return undefined;
    const file = dynamicLoad(d.initializer);
    return file === undefined ? undefined : { file: file === null ? null : UNRESOLVED };
  };
  const isImport = (sym: ts.Symbol) => importTarget(sym) !== undefined;

  /**
   * Whether calling what `sym` imports (its `member`, for `ns.f()` or
   * `svc.f()`) hands back a caught value; `null` for a package, which is judged
   * by its arguments.
   */
  const importLeaks = (sym: ts.Symbol, member: string | undefined, deep = false): boolean | null => {
    const t = importTarget(sym);
    if (!t || t.file === null) return null;
    if (t.name === undefined) {
      // `ns.f()`: the export `f`; anything else done with a namespace is the whole module.
      return member === undefined ? true : moduleExportLeaks(t.file, member, undefined, read, deep);
    }
    return moduleExportLeaks(t.file, t.name, member, read, deep);
  };
  const importVia = (sym: ts.Symbol, member?: string): string => {
    const t = importTarget(sym);
    if (!t || t.file === null) return 'a package';
    const name = t.name ?? member;
    return name === undefined ? `${t.file === UNRESOLVED ? 'an unread module' : t.file} (the whole module, fail-closed)` : moduleVia(t.file, name, read);
  };

  /** The function a callee names, when it is declared in this file. */
  const localFunction = (sym: ts.Symbol): FnNode | undefined => {
    const decl = sym.valueDeclaration;
    if (!decl) return undefined;
    if (ts.isFunctionDeclaration(decl)) return decl;
    if (ts.isVariableDeclaration(decl) && decl.initializer) {
      const init = skipWrappers(decl.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
    }
    return undefined;
  };
  /** The class a `new` names, when it is declared in this file. */
  const localClass = (sym: ts.Symbol): ts.ClassLikeDeclaration | undefined => {
    const decl = sym.valueDeclaration;
    if (!decl) return undefined;
    if (ts.isClassDeclaration(decl)) return decl;
    if (ts.isVariableDeclaration(decl) && decl.initializer) {
      const init = skipWrappers(decl.initializer);
      if (ts.isClassExpression(init)) return init;
    }
    return undefined;
  };
  const functionOf = (e: ts.Expression): FnNode | undefined => {
    e = skipWrappers(e);
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
    if (!ts.isIdentifier(e)) return undefined;
    const s = symbolOf(e);
    return s ? localFunction(s) : undefined;
  };
  /** The functions an argument hands over: itself, or the members of an options object (`{ onError(m) {…} }`). */
  const callbacksIn = (a: ts.Expression | undefined): FnNode[] => {
    if (!a) return [];
    const f = functionOf(a);
    if (f) return [f];
    const x = skipWrappers(a);
    if (!ts.isObjectLiteralExpression(x)) return [];
    return x.properties.flatMap((p) => {
      if (ts.isMethodDeclaration(p)) return [p as FnNode];
      const g = ts.isPropertyAssignment(p) ? functionOf(p.initializer) : ts.isShorthandPropertyAssignment(p) ? functionOf(p.name) : undefined;
      return g ? [g] : [];
    });
  };
  /**
   * The member `name` of the class or object literal that `this` (or a local
   * class, for `Cls.m()`) refers to, when it is a function (İNCELEME-107 Y-3).
   */
  const memberFunction = (recv: ts.Expression, name: string): FnNode | undefined => {
    let container: ts.ClassLikeDeclaration | ts.ObjectLiteralExpression | undefined;
    if (recv.kind === ts.SyntaxKind.ThisKeyword) container = thisContainer(recv);
    else if (ts.isIdentifier(recv)) {
      const s = symbolOf(recv);
      container = s && localClass(s);
      const d = s?.valueDeclaration;
      if (!container && d && ts.isVariableDeclaration(d) && d.initializer) {
        const init = skipWrappers(d.initializer);
        // `const box = { … }`, `const b = new Box()`.
        if (ts.isObjectLiteralExpression(init)) container = init;
        else if (ts.isNewExpression(init) && ts.isIdentifier(skipWrappers(init.expression))) {
          const cs = symbolOf(skipWrappers(init.expression));
          container = cs && localClass(cs);
        }
      }
    }
    if (!container) return undefined;
    const members = (ts.isObjectLiteralExpression(container) ? container.properties : container.members) as ts.NodeArray<ts.Node>;
    for (const m of members) {
      const n = (m as { name?: ts.Node }).name;
      if (!n || !ts.isIdentifier(n) || n.text !== name) continue;
      if (ts.isFunctionLike(m) && 'body' in m && m.body) return m as FnNode;
      if ((ts.isPropertyAssignment(m) || ts.isPropertyDeclaration(m)) && m.initializer) return functionOf(m.initializer);
    }
    return undefined;
  };
  /** The class or object literal `this` refers to at `n` (arrow functions keep the outer `this`). */
  const thisContainer = (n: ts.Node): ts.ClassLikeDeclaration | ts.ObjectLiteralExpression | undefined => {
    let p: ts.Node = n.parent;
    while (p && !ts.isSourceFile(p) && (ts.isArrowFunction(p) || !(ts.isFunctionLike(p) || ts.isPropertyDeclaration(p)))) p = p.parent;
    if (!p || ts.isSourceFile(p)) return undefined;
    const c = ts.isFunctionExpression(p) && ts.isPropertyAssignment(p.parent) ? p.parent.parent : p.parent;
    return ts.isClassLike(c) || ts.isObjectLiteralExpression(c) ? c : undefined;
  };
  /** The parameter a name is bound by: its function and position. */
  const paramOf = (sym: ts.Symbol): [FnNode, number] | undefined => {
    let d: ts.Node | undefined = sym.valueDeclaration;
    while (d && ts.isBindingElement(d)) d = d.parent.parent;
    if (!d || !ts.isParameter(d) || !ts.isFunctionLike(d.parent)) return undefined;
    const fn = d.parent as FnNode;
    return [fn, fn.parameters.indexOf(d)];
  };
  /** A function passed straight to a call (`after(() => …)`, `ids.map((i) => …)`). */
  const isCallArgument = (f: ts.Node) => {
    if (!ts.isArrowFunction(f) && !ts.isFunctionExpression(f)) return false;
    let c: ts.Node = f;
    while (ts.isParenthesizedExpression(c.parent) || ts.isAsExpression(c.parent) || ts.isSatisfiesExpression(c.parent)) c = c.parent;
    const p = c.parent;
    return (ts.isCallExpression(p) || ts.isNewExpression(p)) && (p.arguments ?? []).some((a) => a === c);
  };

  // --- `.code` trust (B-2): catch bindings and handler parameters never written, directly or through an alias. ---
  const written = new Set<ts.Symbol>();
  const markWritten = (id: ts.Identifier | undefined) => {
    const s = id && symbolOf(id);
    if (!s || written.has(s)) return false;
    written.add(s);
    return true;
  };
  for (const w of writes) markWritten(w);
  for (let grew = true; grew; ) {
    grew = false;
    // Handed over whole (`Object.assign(e, …)`, `normalize(e)`), not a field of it.
    const writeArg = (a: ts.Expression | undefined) => {
      const x = a && skipWrappers(a);
      if (x && ts.isIdentifier(x)) grew = markWritten(x) || grew;
    };
    for (const f of flows) {
      if (!ts.isCallExpression(f) && !ts.isNewExpression(f)) continue;
      const args = f.arguments ?? [];
      const target = skipWrappers(f.expression);
      if (ts.isPropertyAccessExpression(target)) {
        const recv = skipWrappers(target.expression);
        const method = target.name.text;
        if (isGlobal(recv, 'Object') || isGlobal(recv, 'Reflect')) {
          if (MUTATORS.has(method)) writeArg(args[0]);
          if (method === 'apply') writeArg(args[1]);
        } else if (ts.isPropertyAccessExpression(recv) && (method === 'call' || method === 'apply') && MUTATORS.has(recv.name.text)) {
          writeArg(args[0]);
        } else {
          const r = rootIdentifier(recv);
          const rs = r && symbolOf(r);
          if (rs && isImport(rs)) args.forEach(writeArg);
        }
        continue;
      }
      if (!ts.isIdentifier(target)) continue;
      const s = symbolOf(target);
      if (!s?.declarations?.length || trustedImport(s)) continue; // a global (`String`, `console`)
      const fn = localFunction(s);
      if (!fn) {
        args.forEach(writeArg); // an import, or a function value the scan does not see into
        continue;
      }
      fn.parameters.forEach((p, i) => {
        if (bindingIds(p.name).some((id) => written.has(symbolOf(id)!))) (p.dotDotDotToken ? args.slice(i) : [args[i]]).forEach(writeArg);
      });
    }
    for (const a of aliases) {
      const rs = symbolOf(a.root);
      if (!rs) continue;
      if (!written.has(rs) && a.names.some((id) => written.has(symbolOf(id)!))) {
        written.add(rs);
        grew = true;
      }
      if (a.plain && written.has(rs)) for (const id of a.names) grew = markWritten(id) || grew;
    }
  }
  /** Plain catch bindings and handler parameters, whose own `.code` is trusted. */
  const rawSources = new Set<ts.Symbol>();
  const trustRaw = (name: ts.BindingName) => {
    if (!ts.isIdentifier(name)) return;
    const s = symbolOf(name);
    if (s) rawSources.add(s);
  };
  for (const b of catchBindings) trustRaw(b);
  for (const h of rejectionHandlers) {
    if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) for (const p of h.parameters) trustRaw(p.name);
  }
  // `const err = e as AppError`: the same value under another name.
  for (let grew = true; grew; ) {
    grew = false;
    for (const a of aliases) {
      if (!a.plain) continue;
      const from = symbolOf(a.root);
      const to = symbolOf(a.names[0]!);
      if (from && to && rawSources.has(from) && !rawSources.has(to)) {
        rawSources.add(to);
        grew = true;
      }
    }
  }
  for (const s of written) rawSources.delete(s);

  /**
   * What calling `target` does to its arguments, for an import (`run(…)`,
   * `ns.run(…)`, `(await import('…')).run(…)`); `null` for a package,
   * `undefined` for anything else.
   */
  const callEffects = (target: ts.Expression): ((i: number | null) => Effects) | null | undefined => {
    let t: ImportTarget | undefined;
    let member: string | undefined;
    if (ts.isIdentifier(target)) {
      const s = symbolOf(target);
      t = s && importTarget(s);
    } else if (ts.isPropertyAccessExpression(target)) {
      member = target.name.text;
      const recv = skipWrappers(target.expression);
      const load = dynamicLoad(recv);
      if (load !== undefined) t = { file: load };
      else if (ts.isIdentifier(recv)) {
        const s = symbolOf(recv);
        t = s && importTarget(s);
        // `svc.m(…)` on an exported object: its methods are not summarised; with a
        // tainted argument it may store it in any argument, like a package.
        if (t && t.file !== null && t.name !== undefined) return (i) => (i === null ? NO_EFFECTS : { writes: ALL_ARGS, calls: [] });
      }
    }
    if (!t) return undefined;
    if (t.file === null) return null;
    const file = t.file;
    const name = t.name ?? member;
    return name === undefined ? () => ALL_EFFECTS : (i) => moduleEffects(file, name, i, read);
  };

  /** Isolated effects of local functions (`analyse` with the function's call sites cut), per state of `sources`. */
  let effectsMemo = new Map<FnNode, Map<number | null, Effects>>();
  let effectsFor: [Set<FnNode>, number] | undefined;
  const effectsInProgress = new Set<FnNode>();
  const isolatedEffects = (fn: FnNode, i: number | null, clean: CleanSet, sources: Set<FnNode>): Effects => {
    if (!effectsFor || effectsFor[0] !== sources || effectsFor[1] !== sources.size) {
      effectsMemo = new Map();
      effectsFor = [sources, sources.size];
    }
    let byArg = effectsMemo.get(fn);
    if (!byArg) effectsMemo.set(fn, (byArg = new Map()));
    const known = byArg.get(i);
    if (known) return known;
    if (effectsInProgress.has(fn)) return NO_EFFECTS; // recursion: judged by the outer call
    effectsInProgress.add(fn);
    try {
      const params = fn.parameters;
      let p: ts.ParameterDeclaration | undefined;
      if (i !== null) {
        p = params[Math.min(i, params.length - 1)];
        if (!p) return NO_EFFECTS;
      }
      const run = analyse(p ? bindingIds(p.name) : [], clean, sources, fn);
      const out = { writes: [] as number[], calls: [] as number[] };
      params.forEach((q, j) => {
        const js = q.dotDotDotToken ? ALL_ARGS.slice(j) : [j];
        if (q !== p && bindingIds(q.name).some((id) => run.leaks(id))) out.writes.push(...js);
        if (run.paramCalls.get(fn)?.has(j)) out.calls.push(...js);
      });
      byArg.set(i, out);
      return out;
    } finally {
      effectsInProgress.delete(fn);
    }
  };

  /**
   * Taint of the whole file for one set of extra sources, run to a fixpoint.
   * `clean` holds the local functions already judged clean, `sources` those
   * already found to return a caught value. With `isolate`, no call site
   * taints that function's parameters (its own effects, not its callers').
   * With `origins`, each tainted name records where its value came from.
   */
  const analyse = (extra: ts.Identifier[], clean: CleanSet, sources: Set<FnNode>, isolate?: FnNode, origins?: Map<ts.Symbol, string>) => {
    const tainted = new Set<ts.Symbol>();
    /** Parameters called with a caught value, per function (`onError(String(e))`, `resolve(String(e))`). */
    const paramCalls = new Map<FnNode, Set<number>>();
    /** Classes and object literals a method wrote a caught value into through `this` (`this.last = String(e)`). */
    const heldByThis = new Set<ts.Node>();
    /** `leaks` per node, for the current taint (cleared whenever it grows). */
    const memo = new Map<ts.Node, boolean>();
    let why: (() => string) | undefined;
    const add = (id: ts.Identifier) => {
      const s = symbolOf(id);
      if (!s || tainted.has(s)) return false;
      tainted.add(s);
      memo.clear();
      if (origins && !origins.has(s)) origins.set(s, why ? why() : `${id.text} (line ${lineOf(id)})`);
      return true;
    };
    const noteParamCall = (sym: ts.Symbol) => {
      const at = paramOf(sym);
      if (!at) return false;
      let set = paramCalls.get(at[0]);
      if (!set) paramCalls.set(at[0], (set = new Set()));
      if (set.has(at[1])) return false;
      set.add(at[1]);
      memo.clear();
      return true;
    };
    const handlerLeaks = (h: ts.Node): boolean => {
      if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) return returnsOf(h).some((r) => leaks(r));
      // A handler passed by name hands back what it received unless it is a sanitiser;
      // zod's `.catch('fallback')` is a value, not a handler.
      if (ts.isIdentifier(skipWrappers(h as ts.Expression))) return callee(h) === 'dirty';
      return leaks(h);
    };
    /** 'clean' for a sanitiser, 'source' for a function that returns a caught value, 'dirty' for anything else that is called. */
    const callee = (expr: ts.Node): 'clean' | 'source' | 'dirty' => {
      const e = skipWrappers(expr as ts.Expression);
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return sources.has(e) ? 'source' : 'dirty';
      if (ts.isPropertyAccessExpression(e)) {
        const root = skipWrappers(e.expression);
        // `this.helper()`, `Svc.helper()`: the member of this file's class or object.
        const m = memberFunction(root, e.name.text);
        if (m && sources.has(m)) return 'source';
        // `(await import('…')).run()`.
        const load = dynamicLoad(root);
        if (load !== undefined) return load !== null && moduleExportLeaks(load, e.name.text, undefined, read) ? 'source' : 'dirty';
        // `ns.f()` / `svc.f()` on an import.
        const s = ts.isIdentifier(root) ? symbolOf(root) : undefined;
        return s && importLeaks(s, e.name.text) === true ? 'source' : 'dirty';
      }
      if (ts.isElementAccessExpression(e)) {
        // `ns[name]()` on an import: the whole module or object.
        const root = rootIdentifier(e);
        const s = root && symbolOf(root);
        return s && importLeaks(s, undefined) === true ? 'source' : 'dirty';
      }
      if (!ts.isIdentifier(e)) return 'dirty';
      const s = symbolOf(e);
      if (!s) return 'dirty';
      if (trustedImport(s)) return 'clean';
      const fn = localFunction(s);
      if (fn) return sources.has(fn) ? 'source' : clean.has(fn) ? 'clean' : 'dirty';
      return importLeaks(s, undefined) === true ? 'source' : 'dirty';
    };
    /** A class whose instance may hold a caught value. */
    const classLeaks = (cls: ts.ClassLikeDeclaration): boolean => {
      if (heldByThis.has(cls)) return true;
      let any = false;
      const walk = (n: ts.Node) => {
        if (any) return;
        if (ts.isFunctionLike(n) && sources.has(n as FnNode)) any = true;
        else if (ts.isIdentifier(n)) {
          const s = symbolOf(n);
          if (s && tainted.has(s)) any = true;
        }
        ts.forEachChild(n, walk);
      };
      ts.forEachChild(cls, walk);
      return any;
    };
    /** A callback argument that returns a caught value: `ids.map(() => { … catch (e) { return String(e) } })`. */
    const callbackLeaks = (args: readonly ts.Expression[]) =>
      args.some((a) => {
        const f = functionOf(a);
        return !!f && sources.has(f);
      });
    /** Whether the value of `n` may carry a caught value's content. */
    const leaks = (n: ts.Node): boolean => {
      let r = memo.get(n);
      if (r === undefined) memo.set(n, (r = leaksOf(n)));
      return r;
    };
    const leaksOf = (n: ts.Node): boolean => {
      if (ts.isIdentifier(n)) {
        const s = symbolOf(n);
        if (!s) return false;
        if (tainted.has(s)) return true;
        // An imported value, read (İNCELEME-107 Y-4) or called: what the module holds.
        return isImport(s) && !trustedImport(s) && importLeaks(s, undefined) === true;
      }
      if (ts.isShorthandPropertyAssignment(n)) return leaks(n.name);
      // `{ [String(e)]: true }`: the key carries it too.
      if (ts.isPropertyAssignment(n)) return leaks(n.initializer) || (ts.isComputedPropertyName(n.name) && leaks(n.name.expression));
      if (
        ts.isParenthesizedExpression(n) ||
        ts.isAsExpression(n) ||
        ts.isSatisfiesExpression(n) ||
        ts.isNonNullExpression(n) ||
        ts.isTypeAssertionExpression(n) ||
        ts.isAwaitExpression(n) ||
        ts.isSpreadElement(n) ||
        ts.isSpreadAssignment(n)
      ) {
        return leaks(n.expression);
      }
      if (ts.isConditionalExpression(n)) return leaks(n.whenTrue) || leaks(n.whenFalse);
      if (ts.isBinaryExpression(n)) {
        const k = n.operatorToken.kind;
        if (COMPARISONS.has(k)) return false;
        if (k === ts.SyntaxKind.CommaToken) return leaks(n.right);
        if (isAssignment(k)) return leaks(n.right);
        return leaks(n.left) || leaks(n.right);
      }
      if (ts.isPrefixUnaryExpression(n)) {
        return n.operator === ts.SyntaxKind.ExclamationToken ? false : leaks(n.operand);
      }
      if (ts.isTypeOfExpression(n) || ts.isVoidExpression(n) || ts.isDeleteExpression(n)) return false;
      if (n.kind === ts.SyntaxKind.ThisKeyword) {
        const c = thisContainer(n);
        return !!c && heldByThis.has(c);
      }
      if (ts.isObjectLiteralExpression(n)) {
        if (heldByThis.has(n)) return true;
        // A method or getter that returns a caught value hands it to whoever reads it.
        return n.properties.some((p) => (ts.isFunctionLike(p) ? sources.has(p as FnNode) : leaks(p)));
      }
      if (ts.isFunctionLike(n) || ts.isClassExpression(n)) return false;
      // A component's name is not a value handed back; its props are.
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) return leaks(n.attributes);
      if (ts.isJsxClosingElement(n)) return false;
      if (ts.isPropertyAccessExpression(n)) {
        const obj = skipWrappers(n.expression);
        const name = n.name.text;
        // A caught value's own `.code` is the domain code it was thrown with.
        if (name === 'code' && ts.isIdentifier(obj)) {
          const s = symbolOf(obj);
          if (s && rawSources.has(s)) return false;
        }
        if (name === 'allSettled' && isGlobal(obj, 'Promise')) return true;
        const load = dynamicLoad(obj);
        if (load !== undefined) return load !== null && moduleExportLeaks(load, name, undefined, read);
        // `ns.run`, `state.last` on an import: that export or member, not the whole module.
        const s = ts.isIdentifier(obj) ? symbolOf(obj) : undefined;
        if (s && !tainted.has(s) && isImport(s)) return importLeaks(s, name) === true;
        return leaks(n.expression);
      }
      if (ts.isElementAccessExpression(n)) {
        const arg = n.argumentExpression;
        if (isGlobal(skipWrappers(n.expression), 'Promise') && ts.isStringLiteralLike(arg) && arg.text === 'allSettled') return true;
        return leaks(n.expression) || leaks(arg);
      }
      if (ts.isCallExpression(n)) {
        // A dynamic load used as a value: the whole module (fail-closed).
        const load = dynamicLoad(n);
        if (load !== undefined) return load !== null;
        const h = rejectionHandler(n);
        if (h) {
          const receiver = (n.expression as ts.PropertyAccessExpression).expression;
          return leaks(receiver) || handlerLeaks(h);
        }
        if (isAllSettled(n)) return true;
        const kind = callee(n.expression);
        if (kind === 'clean') return false;
        if (kind === 'source') return true;
        // The callee itself: a tainted receiver, a tainted function value
        // (`const all = Promise.allSettled.bind(Promise); all(…)`).
        const target = skipWrappers(n.expression);
        const targetLeaks = !ts.isFunctionLike(target) && leaks(target);
        return targetLeaks || callbackLeaks(n.arguments) || n.arguments.some((a) => leaks(a));
      }
      if (ts.isNewExpression(n)) {
        const target = skipWrappers(n.expression);
        const args = n.arguments ?? [];
        // `new Promise((resolve) => … resolve(String(e)))`.
        if (isGlobal(target, 'Promise')) {
          const executor = args[0] && functionOf(args[0]);
          if (executor && paramCalls.get(executor)?.has(0)) return true;
        }
        if (ts.isClassExpression(target) && classLeaks(target)) return true;
        const s = ts.isIdentifier(target) ? symbolOf(target) : undefined;
        const cls = s && localClass(s);
        if (cls && classLeaks(cls)) return true;
        if (s && !cls && importLeaks(s, undefined) === true) return true;
        return callbackLeaks(args) || args.some((a) => leaks(a));
      }
      if (ts.isYieldExpression(n)) return !!n.expression && leaks(n.expression);
      if (ts.isTypeNode(n)) return false;
      let any = false;
      ts.forEachChild(n, (c) => {
        if (!any && leaks(c)) any = true;
      });
      return any;
    };

    /** Where the value of `n` comes from, for a finding's message. */
    const traceOf = (root: ts.Node, depth = 0): string => {
      let found: string | undefined;
      let fallback: string | undefined;
      const walk = (n: ts.Node) => {
        if (found) return;
        if (n !== root && ts.isFunctionLike(n)) {
          if (!sources.has(n as FnNode)) return;
          const r = depth < 4 ? returnsOf(n).find((x) => leaks(x)) : undefined;
          found = `a function that returns it (line ${lineOf(n)})${r ? ` ← ${traceOf(r, depth + 1)}` : ''}`;
          return;
        }
        if (ts.isIdentifier(n)) {
          const s = symbolOf(n);
          if (s && tainted.has(s)) found = origins?.get(s) ?? `${n.text} (line ${lineOf(n)})`;
          else if (s && isImport(s) && leaks(n)) found = importVia(s);
          return;
        }
        if (ts.isPropertyAccessExpression(n)) {
          const obj = skipWrappers(n.expression);
          const s = ts.isIdentifier(obj) ? symbolOf(obj) : undefined;
          if (s && !tainted.has(s) && isImport(s) && leaks(n)) {
            found = importVia(s, n.name.text);
            return;
          }
          const load = dynamicLoad(obj);
          if (load !== undefined && leaks(n)) {
            found = load === null ? 'a package' : moduleVia(load, n.name.text, read);
            return;
          }
        }
        if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && leaks(n)) {
          if (ts.isCallExpression(n) && isAllSettled(n)) {
            found = `Promise.allSettled (line ${lineOf(n)})`;
            return;
          }
          const load = ts.isCallExpression(n) ? dynamicLoad(n) : undefined;
          if (load !== undefined) {
            found = `${load === UNRESOLVED ? 'an unread module' : load} (the whole module, fail-closed)`;
            return;
          }
          if (ts.isCallExpression(n) && callee(n.expression) === 'source') {
            const t = skipWrappers(n.expression);
            const s = ts.isIdentifier(t) ? symbolOf(t) : undefined;
            if (s && isImport(s)) found = importVia(s);
            // A local helper: its argument usually names the origin better.
            else if (s && localFunction(s)) fallback ??= `${t.getText(sf)}() (line ${lineOf(localFunction(s)!)})`;
          }
        }
        if (ts.isCatchClause(n)) return;
        ts.forEachChild(n, walk);
      };
      walk(root);
      return found ?? fallback ?? `line ${lineOf(root)}`;
    };

    why = undefined;
    for (const b of catchBindings) {
      why = () => `catch (line ${lineOf(b)})`;
      for (const id of bindingIds(b)) add(id);
    }
    for (const h of rejectionHandlers) {
      if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) {
        why = () => `a rejection handler (line ${lineOf(h)})`;
        for (const p of h.parameters) for (const id of bindingIds(p.name)) add(id);
      }
    }
    why = undefined;
    for (const id of extra) add(id);

    const addRoot = (e: ts.Expression | undefined): boolean => {
      if (!e) return false;
      let x = skipWrappers(e);
      while (ts.isPropertyAccessExpression(x) || ts.isElementAccessExpression(x)) x = skipWrappers(x.expression);
      if (x.kind === ts.SyntaxKind.ThisKeyword) {
        // `this.v = String(x)` in a method: the class (every instance) or the object holds it.
        const c = thisContainer(x);
        if (!c || heldByThis.has(c)) return false;
        heldByThis.add(c);
        memo.clear();
        return true;
      }
      return ts.isIdentifier(x) ? add(x) : false;
    };
    /** A callback's parameters receive a caught value. */
    const taintCallbacks = (a: ts.Expression | undefined) => {
      let changed = false;
      for (const cb of callbacksIn(a)) {
        if (cb === isolate) continue;
        for (const p of cb.parameters) for (const id of bindingIds(p.name)) changed = add(id) || changed;
      }
      return changed;
    };
    const applyEffects = (e: Effects, args: readonly ts.Expression[]) => {
      let changed = false;
      for (const j of e.writes) changed = addRoot(args[j]) || changed;
      for (const k of e.calls) changed = taintCallbacks(args[k]) || changed;
      return changed;
    };
    /** What a local function does by itself to its arguments (no argument tainted at this call). */
    const selfEffects = (fn: FnNode): Effects => {
      // Gate: the isolated run only removes taint, so nothing here means nothing there.
      const touched = fn.parameters.some((p) => bindingIds(p.name).some((id) => leaks(id))) || !!paramCalls.get(fn)?.size;
      return touched ? isolatedEffects(fn, null, clean, sources) : NO_EFFECTS;
    };

    for (let changed = true; changed; ) {
      changed = false;
      for (const f of flows) {
        if (ts.isVariableDeclaration(f)) {
          // `const { run } = await import('…')`: the names are imports, not values.
          if (dynamicLoad(f.initializer!) !== undefined) continue;
          why = () => traceOf(f.initializer!);
          // `const { allSettled } = Promise`.
          if (isGlobal(skipWrappers(f.initializer!), 'Promise') && ts.isObjectBindingPattern(f.name)) {
            for (const el of f.name.elements) {
              const key = el.propertyName ?? el.name;
              if ((ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === 'allSettled') {
                for (const id of bindingIds(el.name)) changed = add(id) || changed;
              }
            }
          }
          if (leaks(f.initializer!)) for (const id of bindingIds(f.name)) changed = add(id) || changed;
        } else if (ts.isBinaryExpression(f)) {
          if (!leaks(f.right)) continue;
          why = () => traceOf(f.right);
          const left = skipWrappers(f.left);
          if (ts.isObjectLiteralExpression(left) || ts.isArrayLiteralExpression(left)) {
            for (const id of bindingIds(left)) changed = add(id) || changed;
          } else {
            changed = addRoot(left) || changed;
          }
        } else if (ts.isForOfStatement(f) || ts.isForInStatement(f)) {
          if (!leaks(f.expression)) continue;
          why = () => traceOf(f.expression);
          const init = f.initializer;
          const name = ts.isVariableDeclarationList(init) ? init.declarations[0]?.name : init;
          if (name) for (const id of bindingIds(name)) changed = add(id) || changed;
        } else if (ts.isCallExpression(f) || ts.isNewExpression(f)) {
          if (ts.isCallExpression(f)) {
            const h = rejectionHandler(f);
            if (h) {
              // `.catch(resolve)`: a parameter handed the rejection.
              const hx = skipWrappers(h);
              const hs = ts.isIdentifier(hx) ? symbolOf(hx) : undefined;
              if (hs) changed = noteParamCall(hs) || changed;
              continue;
            }
          }
          const args = f.arguments ?? [];
          const target = skipWrappers(f.expression);
          const leaking = args.map((a) => leaks(a));
          const anyLeaking = leaking.some(Boolean);
          const calleeLeaks = !ts.isIdentifier(target) && !ts.isFunctionLike(target) && leaks(target);
          why = () => traceOf(f);
          // A parameter called with a caught value: the caller's callback receives it (Y-2).
          if (anyLeaking && ts.isCallExpression(f)) {
            const r = rootIdentifier(target);
            const rs = r && symbolOf(r);
            if (rs) changed = noteParamCall(rs) || changed;
          }
          // A callback handed a tainted receiver or argument sees it as its parameters.
          if (anyLeaking || calleeLeaks) {
            for (const a of args) {
              const fn = functionOf(a);
              if (fn && fn !== isolate) for (const p of fn.parameters) for (const id of bindingIds(p.name)) changed = add(id) || changed;
            }
          }
          const s = ts.isIdentifier(target) ? symbolOf(target) : undefined;
          if (s && trustedImport(s)) continue;
          // `put(e)`, and `box.put(e)` / `b.put(e)` / `this.put(e)` on this file's object or class.
          const fn = s ? localFunction(s) : ts.isPropertyAccessExpression(target) ? memberFunction(skipWrappers(target.expression), target.name.text) : undefined;
          if (fn) {
            // A local callee: the tainted argument's parameter is tainted in its body; an
            // argument whose parameter the body taints (`fill(out, e)`, or its own catch
            // writing into it) now holds it; a callback it calls with one receives it.
            const self = anyLeaking ? undefined : selfEffects(fn);
            fn.parameters.forEach((p, i) => {
              const ids = bindingIds(p.name);
              const at = p.dotDotDotToken ? args.slice(i) : [args[i]];
              if (self) {
                if (self.writes.includes(i)) for (const a of at) changed = addRoot(a) || changed;
                if (self.calls.includes(i)) for (const a of at) changed = taintCallbacks(a) || changed;
                return;
              }
              if (fn !== isolate && (leaking[i] || (p.dotDotDotToken && leaking.slice(i).some(Boolean)))) {
                for (const id of ids) changed = add(id) || changed;
              }
              if (ids.some((id) => leaks(id))) for (const a of at) changed = addRoot(a) || changed;
              if (paramCalls.get(fn)?.has(i)) for (const a of at) changed = taintCallbacks(a) || changed;
            });
            continue;
          }
          const effects = callEffects(target);
          if (!anyLeaking) {
            if (effects) changed = applyEffects(effects(null), args) || changed;
            continue;
          }
          if (ts.isPropertyAccessExpression(target)) {
            const method = target.name.text;
            const recv = skipWrappers(target.expression);
            if (ts.isPropertyAccessExpression(recv) && (method === 'call' || method === 'apply') && MUTATORS.has(recv.name.text)) {
              // `Array.prototype.push.call(errors, e)`: the `this` argument.
              changed = addRoot(args[0]) || changed;
            } else if (isGlobal(recv, 'Object') || isGlobal(recv, 'Reflect')) {
              // `Object.assign(out, e)`, `Object.defineProperty(out, k, d)`, `Reflect.set(out, k, e)`.
              if (MUTATORS.has(method)) changed = addRoot(args[0]) || changed;
              // `Reflect.apply(Array.prototype.push, out, [e])`.
              if (method === 'apply') changed = addRoot(args[1]) || changed;
            } else if (effects) {
              changed = applyEffects(effects(null), args) || changed;
              leaking.forEach((l, i) => {
                if (l) changed = applyEffects(effects(i), args) || changed;
              });
            } else if (MUTATORS.has(method)) {
              // `out.push(e)`, `m.set(k, e)`, `form.append(k, e)`.
              changed = addRoot(target.expression) || changed;
            } else if (effects === null) {
              // `_.set(out, k, e)` on a package: it may write into any argument.
              for (const a of args) changed = addRoot(a) || changed;
            }
            continue;
          }
          if (effects === null) {
            // A package function (`set(out, k, e)`): it may write into any argument.
            for (const a of args) changed = addRoot(a) || changed;
          } else if (effects) {
            changed = applyEffects(effects(null), args) || changed;
            leaking.forEach((l, i) => {
              if (l) changed = applyEffects(effects(i), args) || changed;
            });
          }
        }
      }
      why = undefined;
      for (const a of aliases) {
        if (a.names.some((id) => tainted.has(symbolOf(id)!))) changed = add(a.root) || changed;
      }
    }
    return { leaks, paramCalls, heldByThis, traceOf };
  };

  const insideRejectionHandler = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (rejectionHandlers.has(p)) return true;
    return false;
  };

  // --- İNCELEME-118 Y-1: a loader read the scan does not follow is a finding (fail-closed). ---
  /**
   * Every read of a loader or of `createRequire` (by {@link moduleKind}), and
   * of the global `module` object, must be one the scan follows: called
   * (`require('…')`, `(0, require)('…')`), the receiver of a called
   * `.call`/`.apply`/`.bind` (or `require.resolve`, which loads nothing),
   * given to a name (`const r = require as any`, `r = module.require`), under
   * `typeof`, and for `module` a named member (`module.exports`) or a one-level
   * destructuring. Any other read (`use(require)`, `[require][0]('…')`,
   * `const m = module`, `{ ...module }`) could load a module the scan never
   * reads, so the line is reported.
   */
  const loaderEscapes: ts.Node[] = [];
  {
    const valueRead = (n: ts.Node): boolean => {
      const p = n.parent;
      if (!ts.isIdentifier(n)) return ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n);
      if (ts.isShorthandPropertyAssignment(p)) return true; // `{ require }` holds the value
      if (ts.isBinaryExpression(p) && p.left === n && isAssignment(p.operatorToken.kind)) return false; // `r = …` writes `r`
      // A name, not a value: `o.require`, `{ require: x }`, `const r`, `function f`, a label.
      if ((p as { name?: ts.Node }).name === n || (p as { propertyName?: ts.Node }).propertyName === n) return false;
      return !(ts.isQualifiedName(p) || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isExportSpecifier(p));
    };
    /** The node that stands for `n`'s value: up through wrappers and the right side of a comma. */
    const outer = (n: ts.Node): ts.Node => {
      let c = n;
      for (;;) {
        const p = c.parent;
        if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isNonNullExpression(p) || ts.isTypeAssertionExpression(p)) c = p;
        else if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.CommaToken && p.right === c) c = p;
        else return c;
      }
    };
    const called = (c: ts.Node) => ts.isCallExpression(c.parent) && c.parent.expression === c;
    /** Given to a name (`const r = …`, `r = …`), whose reads are checked in turn (and, for an export, by its importers). */
    const bound = (c: ts.Node) => {
      const p = c.parent;
      if (ts.isVariableDeclaration(p) && p.initializer === c) return ts.isIdentifier(p.name);
      return ts.isBinaryExpression(p) && p.right === c && isAssignment(p.operatorToken.kind) && ts.isIdentifier(skipWrappers(p.left));
    };
    const followed = (n: ts.Node, kind: 'loader' | 'factory' | 'module'): boolean => {
      const c = outer(n);
      const p = c.parent;
      if (ts.isTypeOfExpression(p)) return true;
      if (kind !== 'module' && (called(c) || bound(c))) return true;
      if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === c) {
        const name = memberName(p);
        if (kind === 'module') return name !== undefined;
        if (kind === 'loader' && (name === 'call' || name === 'apply' || name === 'bind')) return called(outer(p));
        return kind === 'loader' && name === 'resolve';
      }
      if (kind === 'module' && ts.isVariableDeclaration(p) && p.initializer === c && ts.isObjectBindingPattern(p.name)) {
        return p.name.elements.every((el) => !el.dotDotDotToken && (!el.propertyName || ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)));
      }
      return false;
    };
    const walk = (n: ts.Node) => {
      if (ts.isTypeNode(n) || ts.isImportDeclaration(n)) return;
      if (ts.isExpression(n) && valueRead(n)) {
        const kind = isGlobal(n, 'module') ? 'module' : moduleKind(n as ts.Expression);
        if (kind && !followed(n, kind)) loaderEscapes.push(n);
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
  }

  // --- Which local functions are sanitisers (judged by their body) and which return a caught value. ---
  const candidates = new Set(functions.filter((f) => f.parameters.length > 0));
  /**
   * Judged when first asked, with every parameter tainted. A function asked
   * about while it is being judged (recursion) is not clean: the safe side.
   */
  const judgeClean = (sources: Set<FnNode>): CleanSet => {
    const judged = new Map<ts.Node, boolean>();
    const clean: CleanSet = {
      has(f) {
        if (!candidates.has(f as FnNode) || sources.has(f as FnNode)) return false;
        let r = judged.get(f);
        if (r !== undefined) return r;
        judged.set(f, false);
        const { leaks } = analyse((f as FnNode).parameters.flatMap((p) => bindingIds(p.name)), clean, sources);
        r = !returnsOf(f).some((x) => leaks(x));
        judged.set(f, r);
        return r;
      },
    };
    return clean;
  };
  const findSources = (clean: CleanSet) => {
    const sources = new Set<FnNode>();
    for (let changed = true; changed; ) {
      changed = false;
      const { leaks } = analyse([], clean, sources);
      for (const f of functions) {
        if (sources.has(f) || rejectionHandlers.has(f)) continue;
        if (returnsOf(f).some((r) => leaks(r))) {
          sources.add(f);
          changed = true;
        }
      }
    }
    return sources;
  };
  // Sources only grow and clean only shrinks from one round to the next.
  let sources = new Set<FnNode>();
  let clean = judgeClean(sources);
  for (;;) {
    const next = findSources(clean);
    if (next.size === sources.size) break;
    sources = next;
    clean = judgeClean(sources);
  }

  // --- Sinks: every return in the file. ---
  const origins = new Map<ts.Symbol, string>();
  const final = analyse([], clean, sources, undefined, origins);
  const { leaks, traceOf } = final;
  const findings = new Map<number, string>();
  const report = (n: ts.Node, via: string) => {
    const line = lineOf(n);
    if (!findings.has(line)) findings.set(line, via);
  };
  for (const n of loaderEscapes) report(n, 'a module loader the scan does not follow (fail-closed)');
  for (const f of [sf, ...functions]) {
    if (rejectionHandlers.has(f) || isCallArgument(f)) continue;
    for (const r of returnsOf(f)) {
      if (insideRejectionHandler(r)) continue;
      if (leaks(r)) report(r, traceOf(r));
    }
  }

  // --- What each export hands back, for the modules that import this one. ---
  /** A function (or class) that returns a caught value, or holds one that does. */
  const containsSource = (node: ts.Node): boolean => {
    if (ts.isFunctionLike(node) && sources.has(node as FnNode)) return true;
    let any = false;
    ts.forEachChild(node, (c) => {
      if (!any && containsSource(c)) any = true;
    });
    return any;
  };
  const nodeLeaks = (node: ts.Node, member: string | undefined, seen: Set<ts.Node>, deep = false): boolean => {
    if (seen.has(node)) return false;
    seen.add(node);
    if (deep && (ts.isFunctionLike(node) || ts.isClassLike(node))) return containsSource(node);
    if (ts.isBindingElement(node)) {
      // `export const { auth } = NextAuth(config)`: what the whole initializer is.
      let d: ts.Node = node;
      while (!ts.isVariableDeclaration(d)) d = d.parent;
      return nodeLeaks(d, undefined, seen, deep);
    }
    if (ts.isExportAssignment(node)) return nodeLeaks(skipWrappers(node.expression), member, seen);
    if (ts.isVariableDeclaration(node)) {
      // `export let lastError`, `export const state = {…}` written from a catch (Y-4).
      if (bindingIds(node.name).some((id) => leaks(id))) return true;
      return node.initializer ? nodeLeaks(skipWrappers(node.initializer), member, seen, deep) : true;
    }
    if (ts.isFunctionLike(node)) return sources.has(node as FnNode);
    if (ts.isIdentifier(node)) {
      const s = symbolOf(node);
      const decl = s?.declarations?.[0];
      if (!s || !decl) return true;
      if (isImport(s)) {
        if (trustedImport(s)) return false;
        return importLeaks(s, member, deep) ?? false;
      }
      return nodeLeaks(decl, member, seen, deep);
    }
    if (ts.isClassLike(node) || ts.isObjectLiteralExpression(node)) {
      if (final.heldByThis.has(node)) return true;
      if (member !== undefined) {
        const m = (ts.isObjectLiteralExpression(node) ? node.properties : node.members as ts.NodeArray<ts.Node>).find(
          (x: ts.Node) => 'name' in x && x.name && ts.isIdentifier(x.name as ts.Node) && (x.name as ts.Identifier).text === member
        );
        if (m) {
          if (ts.isPropertyAssignment(m)) return nodeLeaks(skipWrappers(m.initializer), undefined, seen);
          if (ts.isShorthandPropertyAssignment(m)) return nodeLeaks(m.name, undefined, seen);
          if (ts.isPropertyDeclaration(m)) return m.initializer ? nodeLeaks(skipWrappers(m.initializer), undefined, seen) : false;
          return ts.isFunctionLike(m) ? sources.has(m as FnNode) : true;
        }
      }
      // The whole object or class: any function in it that returns a caught value.
      let any = leaks(node);
      const walk = (n: ts.Node) => {
        if (any) return;
        if (ts.isFunctionLike(n) && sources.has(n as FnNode)) any = true;
        ts.forEachChild(n, walk);
      };
      ts.forEachChild(node, walk);
      return any;
    }
    // Built by a call (`export const run = make()`): what the call returns, and
    // anything the factory builds when it is ours (in this file or in src/). A
    // package factory (`NextAuth(config)`, `z.enum([…])`) is judged by its arguments.
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (leaks(node)) return true;
      // The root of the builder chain: `z` of `z.string().trim().max(64)`.
      let t = skipWrappers(node.expression);
      while (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t) || ts.isCallExpression(t)) t = skipWrappers(t.expression);
      const s = ts.isIdentifier(t) ? symbolOf(t) : undefined;
      if (!s) return true;
      const decl = s.declarations?.[0];
      if (isImport(s)) {
        const m = ts.isPropertyAccessExpression(skipWrappers(node.expression)) ? (skipWrappers(node.expression) as ts.PropertyAccessExpression).name.text : undefined;
        return trustedImport(s) ? false : (importLeaks(s, m, true) ?? false);
      }
      const local = localFunction(s) ?? localClass(s);
      if (local) return containsSource(local);
      return !decl ? false /* a global: Map, Symbol, … */ : nodeLeaks(decl, undefined, seen, true);
    }
    return leaks(node);
  };
  const moduleSym = checker.getSymbolAtLocation(sf);
  const exportsOf = () => (moduleSym ? checker.getExportsOfModule(moduleSym) : []);
  /** `export * from './x'`: the first module that has `name` (noResolve leaves these unread); UNRESOLVED for an unread one. */
  const starSource = (name: string): string | undefined => {
    for (const st of sf.statements) {
      if (!ts.isExportDeclaration(st) || st.exportClause || !st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const file = resolveSpec(fileName, st.moduleSpecifier.text, read);
      if (file === null) continue;
      if (file === UNRESOLVED) return UNRESOLVED;
      const text = read(file) ?? '';
      if (new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`).test(text)) return file;
    }
    return undefined;
  };
  const exportLeaks = (name: string, member?: string, deep = false): boolean => {
    if (loaderEscapes.length) return true; // a module it may load unseen: fail-closed
    const exp = exportsOf().find((x) => x.escapedName === name);
    if (exp) {
      const decl = exp.declarations?.[0];
      if (!decl) return true;
      // `export { a as b }`, `export { a } from './x'`, `export * as ns from './x'`.
      if (ts.isExportSpecifier(decl)) {
        const from = decl.parent.parent.moduleSpecifier;
        const local = (decl.propertyName ?? decl.name).text;
        if (from && ts.isStringLiteral(from)) {
          const file = resolveSpec(fileName, from.text, read);
          return file === null ? false : moduleExportLeaks(file, local, member, read, deep);
        }
        const target = checker.getExportSpecifierLocalTargetSymbol(decl);
        const tdecl = target?.declarations?.[0];
        if (!target || !tdecl) return true;
        if (isImport(target)) {
          return trustedImport(target) ? false : (importLeaks(target, member, deep) ?? false);
        }
        return nodeLeaks(tdecl, member, new Set(), deep);
      }
      if (ts.isNamespaceExport(decl)) {
        const from = decl.parent.moduleSpecifier;
        const file = from && ts.isStringLiteral(from) ? resolveSpec(fileName, from.text, read) : UNRESOLVED;
        if (file === null) return false;
        return member === undefined ? true : moduleExportLeaks(file, member, undefined, read, deep);
      }
      return nodeLeaks(decl, member, new Set(), deep);
    }
    const file = starSource(name);
    if (file === UNRESOLVED) return true;
    if (file !== undefined) return moduleExportLeaks(file, name, member, read, deep);
    return true; // a name this module does not export: fail-closed
  };
  /** The function an export names in this file, or where it is re-exported from. */
  const exportedFunction = (name: string): FnNode | { file: string | null; name?: string } | undefined => {
    const exp = exportsOf().find((x) => x.escapedName === name);
    if (!exp) {
      const file = starSource(name);
      return file === undefined ? undefined : { file, name };
    }
    let decl: ts.Node | undefined = exp.declarations?.[0];
    if (decl && ts.isExportSpecifier(decl)) {
      const from = decl.parent.parent.moduleSpecifier;
      const local = (decl.propertyName ?? decl.name).text;
      if (from && ts.isStringLiteral(from)) return { file: resolveSpec(fileName, from.text, read), name: local };
      const target = checker.getExportSpecifierLocalTargetSymbol(decl);
      if (target && isImport(target)) return importTarget(target);
      decl = target?.valueDeclaration;
    }
    if (decl && ts.isExportAssignment(decl)) {
      const x = skipWrappers(decl.expression);
      if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return x;
      const s = ts.isIdentifier(x) ? symbolOf(x) : undefined;
      if (s && isImport(s)) return importTarget(s);
      return s && localFunction(s);
    }
    if (!decl) return undefined;
    if (ts.isFunctionDeclaration(decl)) return decl;
    if (ts.isVariableDeclaration(decl) && decl.initializer) {
      const init = skipWrappers(decl.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
      const s = ts.isIdentifier(init) ? symbolOf(init) : undefined;
      if (s && isImport(s)) return importTarget(s);
      return s && localFunction(s);
    }
    return undefined;
  };
  /** Whether any function here takes a caught value into a parameter or calls a parameter with one. */
  let touchesParams: boolean | undefined;
  const effects = (name: string, i: number | null): Effects => {
    if (loaderEscapes.length) return i === null ? NO_EFFECTS : ALL_EFFECTS;
    const fn = exportedFunction(name);
    if (fn && 'file' in fn) {
      if (fn.file === null) return i === null ? NO_EFFECTS : ALL_EFFECTS; // a package: may write into any argument
      return fn.name === undefined ? ALL_EFFECTS : moduleEffects(fn.file, fn.name, i, read);
    }
    if (!fn) {
      // Built by a call, or not found: unknown, so everything when this module has a
      // function that writes a caught value into a parameter at all.
      if (i !== null) return ALL_EFFECTS;
      touchesParams ??= functions.some(
        (f) => !rejectionHandlers.has(f) && (f.parameters.some((p) => bindingIds(p.name).some((id) => leaks(id))) || !!final.paramCalls.get(f)?.size)
      );
      return touchesParams ? ALL_EFFECTS : NO_EFFECTS;
    }
    if (i === null) {
      const touched = fn.parameters.some((p) => bindingIds(p.name).some((id) => leaks(id))) || !!final.paramCalls.get(fn)?.size;
      return touched ? isolatedEffects(fn, null, clean, sources) : NO_EFFECTS;
    }
    return isolatedEffects(fn, i, clean, sources);
  };
  const exportVia = (name: string): string | undefined => {
    const fn = exportedFunction(name);
    if (!fn || 'file' in fn || !sources.has(fn)) return undefined;
    const r = returnsOf(fn).find((x) => leaks(x));
    return r && traceOf(r);
  };

  // --- Y-1: in a `'use server'` file, an export that is not a function written here. ---
  if (action && directive(sf.statements)) {
    for (const exp of exportsOf()) {
      const decl = exp.declarations?.[0];
      if (!decl || ((exp.flags & ts.SymbolFlags.Type) !== 0 && (exp.flags & ts.SymbolFlags.Value) === 0)) continue;
      if (ts.isExportSpecifier(decl) && (decl.isTypeOnly || decl.parent.parent.isTypeOnly)) continue;
      if (ts.isFunctionDeclaration(decl)) continue;
      if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isFunctionLike(skipWrappers(decl.initializer))) {
        // A `const` stays the function written here. A `let`/`var` is judged by every
        // value assigned to it, matched by symbol: `act = run`, `act ||= run`,
        // `[act] = [run]`, `({ act } = { act: run })` (İNCELEME-118 Ö-1).
        const parent = decl.parent;
        const isConst = parent && ts.isVariableDeclarationList(parent) && parent.flags & ts.NodeFlags.Const;
        if (isConst) continue;
        const own = new Set(bindingIds(decl.name).map((id) => symbolOf(id)));
        const hasLeakingReassignment = flows.some((flow) => {
          if (!ts.isBinaryExpression(flow) || !isAssignment(flow.operatorToken.kind)) return false;
          const left = skipWrappers(flow.left);
          const targets = ts.isObjectLiteralExpression(left) || ts.isArrayLiteralExpression(left) ? bindingIds(left) : ts.isIdentifier(left) ? [left] : [];
          return targets.some((id) => own.has(symbolOf(id))) && nodeLeaks(skipWrappers(flow.right), undefined, new Set());
        });
        if (!hasLeakingReassignment) continue;
      }
      const name = exp.escapedName as string;
      if (!exportLeaks(name)) continue;
      const fn = exportedFunction(name);
      report(decl, fn && 'file' in fn && fn.file !== null && fn.name !== undefined ? moduleVia(fn.file, fn.name, read) : `the export ${name}`);
    }
  }

  const exportKind = (name: string): ModuleKind => {
    const decl = exportsOf().find((x) => x.escapedName === name)?.declarations?.[0];
    if (!decl) return undefined;
    if (ts.isExportSpecifier(decl)) {
      const from = decl.parent.parent.moduleSpecifier;
      const local = (decl.propertyName ?? decl.name).text;
      if (from && ts.isStringLiteral(from)) {
        const file = resolveSpec(fileName, from.text, read);
        return file === null || file === UNRESOLVED ? undefined : summaryOf(file, read)?.exportKind(local);
      }
      const d = checker.getExportSpecifierLocalTargetSymbol(decl)?.declarations?.[0];
      if (d && ts.isImportSpecifier(d)) return moduleKind(d.name);
      return d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) ? moduleKind(d.name) : undefined;
    }
    return ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) ? moduleKind(decl.name) : undefined;
  };

  return {
    findings: [...findings].sort((a, b) => a[0] - b[0]).map(([line, via]) => ({ line, via })),
    exportLeaks,
    exportVia,
    effects,
    exportKind,
  };
}

/** Methods that store an argument in their receiver (or, on `Object`/`Reflect`, in their first argument). */
const MUTATORS = new Set(['push', 'unshift', 'splice', 'set', 'add', 'append', 'fill', 'assign', 'defineProperty', 'defineProperties', 'setPrototypeOf']);

const COMPARISONS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

function isAssignment(k: ts.SyntaxKind) {
  return k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
}

function skipWrappers(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

/** `out` for `out`, `out.detail`, `out['x'].y`, `(out as X).z`. */
function rootIdentifier(e: ts.Expression): ts.Identifier | undefined {
  e = skipWrappers(e);
  while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = skipWrappers(e.expression);
  return ts.isIdentifier(e) ? e : undefined;
}

/** The root of an initializer that shares its object: `out`, `out.meta`, `(out as X)['k']` — not a call or a literal. */
function referenceRoot(e: ts.Expression): ts.Identifier | undefined {
  const x = skipWrappers(e);
  if (!ts.isIdentifier(x) && !ts.isPropertyAccessExpression(x) && !ts.isElementAccessExpression(x)) return undefined;
  return rootIdentifier(x);
}

function bindingIds(name: ts.Node): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  const out: ts.Identifier[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isBindingElement(n)) {
      walk(n.name);
      return;
    }
    if (ts.isIdentifier(n)) out.push(n);
    else if (ts.isShorthandPropertyAssignment(n)) out.push(n.name);
    else if (ts.isPropertyAssignment(n)) walk(n.initializer);
    else if (ts.isSpreadAssignment(n) || ts.isSpreadElement(n)) walk(n.expression);
    else ts.forEachChild(n, walk);
  };
  walk(name);
  return out;
}

/** `Promise.allSettled(…)`: its rejected entries carry their `reason`. */
function isAllSettled(call: ts.CallExpression): boolean {
  const t = skipWrappers(call.expression);
  return ts.isPropertyAccessExpression(t) && t.name.text === 'allSettled' && ts.isIdentifier(t.expression) && t.expression.text === 'Promise';
}

/** The rejection handler of `p.catch(h)` or `p.then(ok, h)`. */
function rejectionHandler(call: ts.CallExpression): ts.Expression | undefined {
  const target = skipWrappers(call.expression);
  if (!ts.isPropertyAccessExpression(target)) return undefined;
  if (target.name.text === 'catch') return call.arguments[0];
  if (target.name.text === 'then') return call.arguments[1];
  return undefined;
}

/** The returned (and yielded) expressions of `f` itself (not of functions nested in it); an arrow's expression body counts. */
function returnsOf(f: ts.Node): ts.Expression[] {
  let body: ts.Node;
  if (ts.isSourceFile(f)) body = f; // a stray top-level `return` (the fixtures in the guard's tests)
  else if (ts.isFunctionLike(f) && 'body' in f && f.body) body = f.body;
  else return [];
  if (!ts.isBlock(body) && !ts.isSourceFile(body)) return [body as ts.Expression];
  const out: ts.Expression[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isFunctionLike(n) || ts.isClassLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    if (ts.isYieldExpression(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(body, walk);
  return out;
}
