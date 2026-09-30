/**
 * Source scanner behind the server-action half of the error-body guard
 * (TASK-MUOACB79XEL25, İNCELEME-93 D-1; widened by TASK-MUOBO31H8EPR5,
 * İNCELEME-100 Y-1/Y-2/Y-3).
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
 *   when the handler hands back what it received, `Promise.allSettled(…)`
 *   (its `reason`s), and a call to a function — in this file or in a module it
 *   imports — that returns (or yields) what it caught (İNCELEME-100 Y-1: the
 *   admin CORDIS action returned `runCordisImport`'s `error`, the text of a
 *   caught value, from src/lib/k2-cordis/importer.ts).
 * - **Across modules.** An `@/` or relative import is read and analysed the same
 *   way, to any depth (each module once per reader), and its export returns a
 *   caught value when the function it names does. An import into src/ that
 *   names no file, a name the module does not export, an export built by a call
 *   (`export const run = make()`), an alias other than `@/`, and a module still
 *   being analysed (an import cycle) all count as returning one (fail-closed).
 *   A package import is not followed: its call carries taint only from its
 *   arguments.
 * - **Flow.** A declaration, an assignment (to a variable, or to a field or
 *   element of one, which taints the whole object), a destructuring, a `for…of`
 *   over a tainted value, a `const` alias of an object (`const a = out`,
 *   `const { meta } = out`: tainting `a` taints `out`), and a call with a
 *   tainted argument (`out.push(e)`, `Object.assign(out, e)`, `Reflect.set(out,
 *   k, e)`, `fill(out, e)`: the receiver and every argument's root now hold it;
 *   a local callee's parameter and a callback's parameters are tainted too)
 *   carry taint on. Names are resolved by symbol, so the same spelling in
 *   another function is another variable.
 * - **What does not carry it.** A comparison, `instanceof`, `typeof`, `!`, the
 *   condition of a ternary, the `.code` of a caught value itself (a domain
 *   error's own code, evidence/actions.ts `UploadRefused`: the catch binding or
 *   handler parameter, or a `const` alias of it, never reassigned — not the
 *   `.code` of an object built from one, İNCELEME-100 N4/N5/N16), a function
 *   value, and a call to a sanitiser.
 * - **Sanitisers.** A function imported under its own name from the module
 *   listed in {@link SANITISERS}, whose own tests pin what it returns — or a
 *   function declared in the same file whose every return is clean when all its
 *   parameters are tainted (ajans `errorCode`, admin plans `planFailure`). A
 *   local function is judged by its body, never by its name.
 * - **Sinks.** Every `return` (and arrow expression body, and `yield`) in the
 *   file, nested functions included, except inside a rejection handler, whose
 *   value is followed through the call instead.
 *
 * Known limits (none occurs in src today; each is a follow-up, not a licence):
 * a `new Promise` reject callback, an `EventEmitter` error listener, and a
 * caught value that leaves through something other than a return (a redirect
 * URL, a cookie).
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
  const directive = (stmts: readonly ts.Statement[]) => {
    for (const s of stmts) {
      if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
      if (s.expression.text === 'use server') return true;
    }
    return false;
  };
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

function scriptKind(fileName: string) {
  if (/\.[cm]?jsx?$/.test(fileName)) return fileName.endsWith('x') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

type FnNode = ts.FunctionLikeDeclaration;
type CleanSet = { has(f: ts.Node): boolean };

/**
 * Lines where the file hands a caught value (or something built from it) back
 * through a `return`. `fileName` is repo-relative; `@/` and relative imports
 * are read through `read` (the working tree by default).
 */
export function actionReturnLeaks(src: string, fileName = 'src/actions/fixture.ts', read: ModuleReader = DEFAULT_READER): number[] {
  return analyseFile(src, fileName, read).lines;
}

// --- Module resolution and per-module summaries. ---

/** An import into src/ the scan cannot pin to one file: counts as a leak. */
const UNRESOLVED = '\0unresolved';
const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

/** The repo-relative file `spec` names from `from`; `null` for a package or data; UNRESOLVED otherwise. */
function resolveSpec(from: string, spec: string, read: ModuleReader): string | null {
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
 * `exportLeaks(name, member, deep)`: whether calling the export hands back a
 * caught value; with `deep`, whether anything it builds may (a factory whose
 * result is itself called, `export const run = make()`).
 */
type Summary = {
  lines: number[];
  exportLeaks: (name: string, member?: string, deep?: boolean) => boolean;
  argEffects: (name: string, i: number) => number[];
};
const PENDING = Symbol('pending');
const summaries = new WeakMap<ModuleReader, Map<string, Summary | typeof PENDING>>();

/** Whether module `file`'s export `name` (its `member`, for an object or class) hands back a caught value. */
function moduleExportLeaks(file: string, name: string, member: string | undefined, read: ModuleReader, deep = false): boolean {
  if (file === UNRESOLVED) return true;
  let byFile = summaries.get(read);
  if (!byFile) summaries.set(read, (byFile = new Map()));
  let s = byFile.get(file);
  if (s === PENDING) return true; // an import cycle: fail-closed
  if (!s) {
    const src = read(file);
    if (src === undefined) return true;
    byFile.set(file, PENDING);
    try {
      s = analyseFile(src, file, read);
    } finally {
      byFile.delete(file);
    }
    byFile.set(file, s);
  }
  return s.exportLeaks(name, member, deep);
}

/** Which parameters of module `file`'s function `name` a tainted parameter `i` flows into; every one when unknown. */
function moduleArgEffects(file: string, name: string, i: number, read: ModuleReader): number[] {
  if (file === UNRESOLVED) return ALL_ARGS;
  moduleExportLeaks(file, name, undefined, read); // analyses and caches the module
  const s = summaries.get(read)?.get(file);
  return s && s !== PENDING ? s.argEffects(name, i) : ALL_ARGS;
}
const ALL_ARGS = Array.from({ length: 8 }, (_, k) => k);

function analyseFile(src: string, fileName: string, read: ModuleReader): Summary {
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

  const symbolOf = (id: ts.Node): ts.Symbol | undefined => {
    if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
      return checker.getShorthandAssignmentValueSymbol(id.parent);
    }
    return checker.getSymbolAtLocation(id);
  };

  // --- Collect functions, rejection handlers and the nodes that move values. ---
  const functions: FnNode[] = [];
  const catchBindings: ts.BindingName[] = [];
  const flows: ts.Node[] = [];
  /** `const a = <reference>`: tainting a binding on the left taints the reference's root. */
  const aliases: { names: ts.Identifier[]; root: ts.Identifier }[] = [];
  const rejectionHandlers = new Set<ts.Node>();
  /** Symbols assigned to anywhere (`x = …`, `x += …`, `++x`): no `.code` exemption for them. */
  const reassigned = new Set<ts.Symbol>();
  const visit = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && 'body' in n && n.body) functions.push(n as FnNode);
    if (ts.isCatchClause(n) && n.variableDeclaration) catchBindings.push(n.variableDeclaration.name);
    if (ts.isVariableDeclaration(n) && n.initializer) {
      flows.push(n);
      const list = n.parent;
      if (ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const) {
        const root = referenceRoot(n.initializer);
        if (root) aliases.push({ names: bindingIds(n.name), root });
      }
    }
    if (ts.isBinaryExpression(n) && isAssignment(n.operatorToken.kind)) {
      flows.push(n);
      const left = skipWrappers(n.left);
      const s = ts.isIdentifier(left) ? symbolOf(left) : undefined;
      if (s) reassigned.add(s);
    }
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && ts.isIdentifier(n.operand)) {
      const s = symbolOf(n.operand);
      if (s) reassigned.add(s);
    }
    if (ts.isForOfStatement(n) || ts.isForInStatement(n)) flows.push(n);
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
      const d = a.names[0]?.parent;
      if (a.names.length !== 1 || !d || !ts.isVariableDeclaration(d) || !ts.isIdentifier(skipWrappers(d.initializer!))) continue;
      const from = symbolOf(a.root);
      const to = symbolOf(a.names[0]!);
      if (from && to && rawSources.has(from) && !rawSources.has(to)) {
        rawSources.add(to);
        grew = true;
      }
    }
  }
  for (const s of reassigned) rawSources.delete(s);

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

  /**
   * Whether calling what `sym` imports (its `member`, for `ns.f()` or
   * `svc.f()`) hands back a caught value; `null` for a package, which is judged
   * by its arguments.
   */
  const importLeaks = (sym: ts.Symbol, member: string | undefined, deep = false): boolean | null => {
    const decl = sym.declarations?.[0];
    if (!decl) return null;
    let clause: ts.Node = decl;
    let name: string | undefined;
    if (ts.isImportSpecifier(decl)) {
      name = (decl.propertyName ?? decl.name).text;
      clause = decl.parent.parent.parent;
    } else if (ts.isImportClause(decl)) {
      name = 'default';
      clause = decl.parent;
    } else if (ts.isNamespaceImport(decl)) {
      clause = decl.parent.parent;
    } else {
      return null;
    }
    if (!ts.isImportDeclaration(clause) || !ts.isStringLiteral(clause.moduleSpecifier)) return null;
    const file = resolveSpec(fileName, clause.moduleSpecifier.text, read);
    if (file === null) return null;
    if (name === undefined) {
      // `ns.f()`: the export `f`; anything else done with a namespace is the whole module.
      return member === undefined ? true : moduleExportLeaks(file, member, undefined, read, deep);
    }
    return moduleExportLeaks(file, name, member, read, deep);
  };

  const isImport = (sym: ts.Symbol) => {
    const d = sym.declarations?.[0];
    return !!d && (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d));
  };
  /**
   * For an imported function: which arguments a tainted argument `i` ends up in
   * (its body writes one parameter into another); `null` for a package.
   */
  const importArgEffects = (sym: ts.Symbol): ((i: number) => number[]) | null => {
    const decl = sym.declarations?.[0];
    if (!decl || !ts.isImportSpecifier(decl)) return null;
    const clause = decl.parent.parent.parent;
    const file = resolveSpec(fileName, (clause.moduleSpecifier as ts.StringLiteral).text, read);
    if (file === null) return null;
    const name = (decl.propertyName ?? decl.name).text;
    return (i) => moduleArgEffects(file, name, i, read);
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

  /**
   * Taint of the whole file for one set of extra sources, run to a fixpoint.
   * `clean` holds the local functions already judged clean, `sources` those
   * already found to return a caught value.
   */
  const analyse = (extra: ts.Identifier[], clean: CleanSet, sources: Set<FnNode>) => {
    const tainted = new Set<ts.Symbol>();
    /** `leaks` per node, for the current taint (cleared whenever it grows). */
    const memo = new Map<ts.Node, boolean>();
    const add = (id: ts.Identifier) => {
      const s = symbolOf(id);
      if (!s || tainted.has(s)) return false;
      tainted.add(s);
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
        // `ns.f()` / `svc.f()` on an import.
        const root = skipWrappers(e.expression);
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
    /** Whether the value of `n` may carry a caught value's content. */
    const leaks = (n: ts.Node): boolean => {
      let r = memo.get(n);
      if (r === undefined) memo.set(n, (r = leaksOf(n)));
      return r;
    };
    const leaksOf = (n: ts.Node): boolean => {
      if (ts.isIdentifier(n)) {
        const s = symbolOf(n);
        return !!s && tainted.has(s);
      }
      if (ts.isShorthandPropertyAssignment(n)) return leaks(n.name);
      if (ts.isPropertyAssignment(n)) return leaks(n.initializer);
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
      if (ts.isObjectLiteralExpression(n)) {
        // A method or getter that returns a caught value hands it to whoever reads it.
        return n.properties.some((p) => (ts.isFunctionLike(p) ? sources.has(p as FnNode) : leaks(p)));
      }
      if (ts.isFunctionLike(n) || ts.isClassExpression(n)) return false;
      if (ts.isPropertyAccessExpression(n)) {
        // A caught value's own `.code` is the domain code it was thrown with.
        const obj = skipWrappers(n.expression);
        if (n.name.text === 'code' && ts.isIdentifier(obj)) {
          const s = symbolOf(obj);
          if (s && rawSources.has(s)) return false;
        }
        return leaks(n.expression);
      }
      if (ts.isElementAccessExpression(n)) return leaks(n.expression) || leaks(n.argumentExpression);
      if (ts.isCallExpression(n)) {
        const h = rejectionHandler(n);
        if (h) {
          const receiver = (n.expression as ts.PropertyAccessExpression).expression;
          return leaks(receiver) || handlerLeaks(h);
        }
        if (isAllSettled(n)) return true;
        const kind = callee(n.expression);
        if (kind === 'clean') return false;
        if (kind === 'source') return true;
        const target = skipWrappers(n.expression);
        const receiverLeaks = ts.isPropertyAccessExpression(target) && leaks(target.expression);
        // A callback that returns a caught value: `ids.map(() => { … catch (e) { return String(e) } })`.
        const callbackLeaks = n.arguments.some((a) => {
          const f = functionOf(a);
          return !!f && sources.has(f);
        });
        return receiverLeaks || callbackLeaks || n.arguments.some((a) => leaks(a));
      }
      if (ts.isNewExpression(n)) {
        const target = skipWrappers(n.expression);
        if (ts.isClassExpression(target) && classLeaks(target)) return true;
        const s = ts.isIdentifier(target) ? symbolOf(target) : undefined;
        const cls = s && localClass(s);
        if (cls && classLeaks(cls)) return true;
        if (s && !cls && importLeaks(s, undefined) === true) return true;
        return (n.arguments ?? []).some((a) => leaks(a));
      }
      if (ts.isYieldExpression(n)) return !!n.expression && leaks(n.expression);
      if (ts.isTypeNode(n)) return false;
      let any = false;
      ts.forEachChild(n, (c) => {
        if (!any && leaks(c)) any = true;
      });
      return any;
    };

    for (const b of catchBindings) for (const id of bindingIds(b)) add(id);
    for (const h of rejectionHandlers) {
      if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) {
        for (const p of h.parameters) for (const id of bindingIds(p.name)) add(id);
      }
    }
    for (const id of extra) add(id);

    const addRoot = (e: ts.Expression | undefined) => {
      const root = e && rootIdentifier(e);
      return root ? add(root) : false;
    };
    for (let changed = true; changed; ) {
      changed = false;
      for (const f of flows) {
        if (ts.isVariableDeclaration(f)) {
          if (leaks(f.initializer!)) for (const id of bindingIds(f.name)) changed = add(id) || changed;
        } else if (ts.isBinaryExpression(f)) {
          if (!leaks(f.right)) continue;
          const left = skipWrappers(f.left);
          if (ts.isObjectLiteralExpression(left) || ts.isArrayLiteralExpression(left)) {
            for (const id of bindingIds(left)) changed = add(id) || changed;
          } else {
            changed = addRoot(left) || changed;
          }
        } else if (ts.isForOfStatement(f) || ts.isForInStatement(f)) {
          if (!leaks(f.expression)) continue;
          const init = f.initializer;
          const name = ts.isVariableDeclarationList(init) ? init.declarations[0]?.name : init;
          if (name) for (const id of bindingIds(name)) changed = add(id) || changed;
        } else if (ts.isCallExpression(f) || ts.isNewExpression(f)) {
          if (ts.isCallExpression(f) && rejectionHandler(f)) continue;
          const args = f.arguments ?? [];
          const target = skipWrappers(f.expression);
          const receiverLeaks = ts.isPropertyAccessExpression(target) && leaks(target.expression);
          const leaking = args.map((a) => leaks(a));
          if (!receiverLeaks && !leaking.some(Boolean)) continue;
          // A callback handed a tainted receiver or argument sees it as its parameters.
          for (const a of args) {
            const fn = functionOf(a);
            if (fn) for (const p of fn.parameters) for (const id of bindingIds(p.name)) changed = add(id) || changed;
          }
          if (!leaking.some(Boolean)) continue;
          const s = ts.isIdentifier(target) ? symbolOf(target) : undefined;
          if (s && trustedImport(s)) continue;
          const fn = s && localFunction(s);
          if (fn) {
            // A local callee: the tainted argument's parameter is tainted in its body, and
            // an argument whose parameter the body taints (`fill(out, e)`) now holds it.
            fn.parameters.forEach((p, i) => {
              const ids = bindingIds(p.name);
              if (leaking[i] || (p.dotDotDotToken && leaking.slice(i).some(Boolean))) {
                for (const id of ids) changed = add(id) || changed;
              }
              if (ids.some((id) => leaks(id))) {
                for (const a of p.dotDotDotToken ? args.slice(i) : [args[i]]) changed = addRoot(a) || changed;
              }
            });
            continue;
          }
          if (ts.isPropertyAccessExpression(target)) {
            const method = target.name.text;
            const recv = skipWrappers(target.expression);
            if (ts.isPropertyAccessExpression(recv) && (method === 'call' || method === 'apply') && MUTATORS.has(recv.name.text)) {
              // `Array.prototype.push.call(errors, e)`: the `this` argument.
              changed = addRoot(args[0]) || changed;
            } else if (ts.isIdentifier(recv) && (recv.text === 'Object' || recv.text === 'Reflect') && !symbolOf(recv)?.declarations?.length) {
              // `Object.assign(out, e)`, `Object.defineProperty(out, k, d)`, `Reflect.set(out, k, e)`.
              if (MUTATORS.has(method)) changed = addRoot(args[0]) || changed;
            } else if (MUTATORS.has(method)) {
              // `out.push(e)`, `m.set(k, e)`, `form.append(k, e)`.
              changed = addRoot(target.expression) || changed;
            } else {
              // `_.set(out, k, e)` on a package: it may write into any argument.
              const r = rootIdentifier(recv);
              const rs = r && symbolOf(r);
              if (rs && importLeaks(rs, method) === null && isImport(rs)) for (const a of args) changed = addRoot(a) || changed;
            }
            continue;
          }
          if (s && isImport(s)) {
            const effects = importArgEffects(s);
            if (effects === null) {
              // A package function (`set(out, k, e)`): it may write into any argument.
              for (const a of args) changed = addRoot(a) || changed;
            } else {
              leaking.forEach((l, i) => {
                if (l) for (const j of effects(i)) changed = addRoot(args[j]) || changed;
              });
            }
          }
        }
      }
      for (const a of aliases) {
        if (a.names.some((id) => tainted.has(symbolOf(id)!))) changed = add(a.root) || changed;
      }
    }
    return leaks;
  };

  const insideRejectionHandler = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (rejectionHandlers.has(p)) return true;
    return false;
  };

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
        const leaks = analyse((f as FnNode).parameters.flatMap((p) => bindingIds(p.name)), clean, sources);
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
      const leaks = analyse([], clean, sources);
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
  const leaks = analyse([], clean, sources);
  const lines = new Set<number>();
  for (const f of [sf, ...functions]) {
    if (rejectionHandlers.has(f)) continue;
    for (const r of returnsOf(f)) {
      if (insideRejectionHandler(r)) continue;
      if (leaks(r)) lines.add(sf.getLineAndCharacterOfPosition(r.getStart(sf)).line + 1);
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
    if (ts.isVariableDeclaration(node)) return node.initializer ? nodeLeaks(skipWrappers(node.initializer), member, seen, deep) : true;
    if (ts.isFunctionLike(node)) return sources.has(node as FnNode);
    if (ts.isIdentifier(node)) {
      const s = symbolOf(node);
      const decl = s?.declarations?.[0];
      if (!s || !decl) return true;
      if (ts.isImportSpecifier(decl) || ts.isImportClause(decl) || ts.isNamespaceImport(decl)) {
        if (trustedImport(s)) return false;
        return importLeaks(s, member, deep) ?? false;
      }
      return nodeLeaks(decl, member, seen, deep);
    }
    if (ts.isClassLike(node) || ts.isObjectLiteralExpression(node)) {
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
      let t = skipWrappers(node.expression);
      if (ts.isPropertyAccessExpression(t)) t = skipWrappers(t.expression);
      const s = ts.isIdentifier(t) ? symbolOf(t) : undefined;
      if (!s) return true;
      const decl = s.declarations?.[0];
      if (decl && (ts.isImportSpecifier(decl) || ts.isImportClause(decl) || ts.isNamespaceImport(decl))) {
        const m = ts.isPropertyAccessExpression(skipWrappers(node.expression)) ? (skipWrappers(node.expression) as ts.PropertyAccessExpression).name.text : undefined;
        return trustedImport(s) ? false : (importLeaks(s, m, true) ?? false);
      }
      const local = localFunction(s) ?? localClass(s);
      if (local) return containsSource(local);
      return !decl ? false /* a global: Map, Symbol, … */ : nodeLeaks(decl, undefined, seen, true);
    }
    return leaks(node);
  };
  const exportLeaks = (name: string, member?: string, deep = false): boolean => {
    const moduleSym = checker.getSymbolAtLocation(sf);
    const exp = moduleSym && checker.getExportsOfModule(moduleSym).find((x) => x.escapedName === name);
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
        if (ts.isImportSpecifier(tdecl) || ts.isImportClause(tdecl) || ts.isNamespaceImport(tdecl)) {
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
    // `export * from './x'`: the first module that has it (noResolve leaves these unread).
    for (const st of sf.statements) {
      if (!ts.isExportDeclaration(st) || st.exportClause || !st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const file = resolveSpec(fileName, st.moduleSpecifier.text, read);
      if (file === null) continue;
      if (file === UNRESOLVED) return true;
      const text = read(file) ?? '';
      if (new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`).test(text)) return moduleExportLeaks(file, name, member, read, deep);
    }
    return true; // a name this module does not export: fail-closed
  };

  const argEffects = (name: string, i: number): number[] => {
    const moduleSym = checker.getSymbolAtLocation(sf);
    const exp = moduleSym && checker.getExportsOfModule(moduleSym).find((x) => x.escapedName === name);
    const decl = exp?.declarations?.[0];
    const fn = decl && (ts.isFunctionDeclaration(decl) ? decl : ts.isVariableDeclaration(decl) && decl.initializer ? skipWrappers(decl.initializer) : undefined);
    if (!fn || !(ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return ALL_ARGS;
    const params = fn.parameters;
    const p = params[Math.min(i, params.length - 1)];
    if (!p) return [];
    const flow = analyse(bindingIds(p.name), clean, sources);
    const out: number[] = [];
    params.forEach((q, j) => {
      if (q !== p && bindingIds(q.name).some((id) => flow(id))) out.push(...(q.dotDotDotToken ? ALL_ARGS.slice(j) : [j]));
    });
    return out;
  };
  return { lines: [...lines].sort((a, b) => a - b), exportLeaks, argEffects };
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
