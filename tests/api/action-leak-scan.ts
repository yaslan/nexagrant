/**
 * Source scanner behind the server-action half of the error-body guard
 * (TASK-MUOACB79XEL25, İNCELEME-93 D-1).
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
 *   rejection handler (`.catch(h)`, `.then(_, h)`), and the result of such a
 *   call when the handler hands back what it received.
 * - **Flow.** A declaration, an assignment (to a variable, or to a field or
 *   element of one, which taints the whole object), a destructuring, a `for…of`
 *   over a tainted value, and a method call with a tainted argument
 *   (`out.push(e)`, `Object.assign(out, e)`) carry taint on. Names are resolved
 *   by symbol, so the same spelling in another function is another variable.
 * - **What does not carry it.** A comparison, `instanceof`, `typeof`, `!`, the
 *   condition of a ternary, the `.code` of a caught value (a domain error's own
 *   code, evidence/actions.ts `UploadRefused`), a function value, and a call to
 *   a sanitiser.
 * - **Sanitisers.** A function imported under its own name from the module
 *   listed in {@link SANITISERS}, whose own tests pin what it returns — or a
 *   function declared in the same file whose every return is clean when all its
 *   parameters are tainted (ajans `errorCode`, admin plans `planFailure`). A
 *   local function is judged by its body, never by its name.
 * - **Sinks.** Every `return` (and arrow expression body) in the file, except
 *   inside a rejection handler, whose value is followed through the call instead.
 *
 * Known limits (none occurs in src today; each is a follow-up, not a licence):
 * values reached through `Promise.allSettled(...).reason`, a `new Promise`
 * reject callback, an `EventEmitter` error listener, or a helper imported from
 * another module that is not a sanitiser but returns clean values (the call
 * then counts as a leak, which is the safe side).
 */
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
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

type FnNode = ts.FunctionLikeDeclaration;

/**
 * Lines where the file hands a caught value (or something built from it) back
 * through a `return`. `fileName` is repo-relative; it resolves `@/` and
 * relative imports when a sanitiser import is checked.
 */
export function actionReturnLeaks(src: string, fileName = 'src/actions/fixture.ts'): number[] {
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
    options: { noLib: true, noResolve: true, types: [], jsx: ts.JsxEmit.Preserve, allowJs: false },
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
  const rejectionHandlers = new Set<ts.Node>();
  const visit = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && 'body' in n && n.body) functions.push(n as FnNode);
    if (ts.isCatchClause(n) && n.variableDeclaration) catchBindings.push(n.variableDeclaration.name);
    if (ts.isVariableDeclaration(n) && n.initializer) flows.push(n);
    if (ts.isBinaryExpression(n) && isAssignment(n.operatorToken.kind)) flows.push(n);
    if (ts.isForOfStatement(n)) flows.push(n);
    if (ts.isCallExpression(n)) {
      flows.push(n);
      const h = rejectionHandler(n);
      if (h) rejectionHandlers.add(h);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  const bindingIds = (name: ts.Node): ts.Identifier[] => {
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
  };

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

  /**
   * Taint of the whole file for one set of extra sources, run to a fixpoint.
   * `clean` holds the local functions already judged clean.
   */
  const analyse = (extra: ts.Identifier[], clean: Set<FnNode>) => {
    const tainted = new Set<ts.Symbol>();
    const add = (id: ts.Identifier) => {
      const s = symbolOf(id);
      if (!s || tainted.has(s)) return false;
      tainted.add(s);
      return true;
    };
    const handlerLeaks = (h: ts.Node): boolean => {
      if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) return returnsOf(h).some((r) => leaks(r));
      // A handler passed by name hands back what it received unless it is a sanitiser;
      // zod's `.catch('fallback')` is a value, not a handler.
      if (ts.isIdentifier(skipWrappers(h as ts.Expression))) return callee(h) === 'dirty';
      return leaks(h);
    };
    /** 'clean' for a sanitiser, 'dirty' for anything else that is called. */
    const callee = (expr: ts.Node): 'clean' | 'dirty' => {
      const e = skipWrappers(expr as ts.Expression);
      if (!ts.isIdentifier(e)) return 'dirty';
      const s = symbolOf(e);
      if (!s) return 'dirty';
      if (trustedImport(s)) return 'clean';
      const fn = localFunction(s);
      return fn && clean.has(fn) ? 'clean' : 'dirty';
    };
    /** Whether the value of `n` may carry a caught value's content. */
    const leaks = (n: ts.Node): boolean => {
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
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isClassExpression(n)) return false;
      if (ts.isPropertyAccessExpression(n)) {
        // A caught value's own `.code` is the domain code it was thrown with.
        if (n.name.text === 'code' && ts.isIdentifier(skipWrappers(n.expression))) return false;
        return leaks(n.expression);
      }
      if (ts.isElementAccessExpression(n)) return leaks(n.expression) || leaks(n.argumentExpression);
      if (ts.isCallExpression(n)) {
        const h = rejectionHandler(n);
        if (h) {
          const receiver = (n.expression as ts.PropertyAccessExpression).expression;
          return leaks(receiver) || handlerLeaks(h);
        }
        if (callee(n.expression) === 'clean') return false;
        const target = skipWrappers(n.expression);
        const receiverLeaks = ts.isPropertyAccessExpression(target) && leaks(target.expression);
        return receiverLeaks || n.arguments.some((a) => leaks(a));
      }
      if (ts.isNewExpression(n)) return (n.arguments ?? []).some((a) => leaks(a));
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
            const root = rootIdentifier(left);
            if (root) changed = add(root) || changed;
          }
        } else if (ts.isForOfStatement(f)) {
          if (!leaks(f.expression)) continue;
          const init = f.initializer;
          const name = ts.isVariableDeclarationList(init) ? init.declarations[0]?.name : init;
          if (name) for (const id of bindingIds(name)) changed = add(id) || changed;
        } else if (ts.isCallExpression(f)) {
          // `out.push(e)`, `Object.assign(out, e)`: the receiver (or the target) now holds it.
          const target = skipWrappers(f.expression);
          if (!ts.isPropertyAccessExpression(target) || rejectionHandler(f)) continue;
          if (callee(target) === 'clean' || !f.arguments.some((a) => leaks(a))) continue;
          const isAssign =
            ts.isIdentifier(target.expression) && target.expression.text === 'Object' && target.name.text === 'assign';
          const root = isAssign ? (f.arguments[0] ? rootIdentifier(f.arguments[0]) : undefined) : rootIdentifier(target.expression);
          if (root) changed = add(root) || changed;
        }
      }
    }
    return leaks;
  };

  const insideRejectionHandler = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (rejectionHandlers.has(p)) return true;
    return false;
  };

  // --- Which local functions are sanitisers: judged by their body. ---
  const clean = new Set<FnNode>();
  const candidates = functions.filter((f) => f.parameters.length > 0);
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of candidates) {
      if (clean.has(f)) continue;
      const params = f.parameters.flatMap((p) => bindingIds(p.name));
      const leaks = analyse(params, clean);
      if (!returnsOf(f).some((r) => leaks(r))) {
        clean.add(f);
        changed = true;
      }
    }
  }

  // --- Sinks: every return in the file. ---
  const leaks = analyse([], clean);
  const lines = new Set<number>();
  for (const f of [sf, ...functions]) {
    if (rejectionHandlers.has(f)) continue;
    for (const r of returnsOf(f)) {
      if (insideRejectionHandler(r)) continue;
      if (leaks(r)) lines.add(sf.getLineAndCharacterOfPosition(r.getStart(sf)).line + 1);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

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

/** The rejection handler of `p.catch(h)` or `p.then(ok, h)`. */
function rejectionHandler(call: ts.CallExpression): ts.Expression | undefined {
  const target = skipWrappers(call.expression);
  if (!ts.isPropertyAccessExpression(target)) return undefined;
  if (target.name.text === 'catch') return call.arguments[0];
  if (target.name.text === 'then') return call.arguments[1];
  return undefined;
}

/** The returned expressions of `f` itself (not of functions nested in it); an arrow's expression body counts. */
function returnsOf(f: ts.Node): ts.Expression[] {
  let body: ts.Node;
  if (ts.isSourceFile(f)) body = f; // a stray top-level `return` (the fixtures in the guard's tests)
  else if (ts.isFunctionLike(f) && 'body' in f && f.body) body = f.body;
  else return [];
  if (!ts.isBlock(body) && !ts.isSourceFile(body)) return [body as ts.Expression];
  const out: ts.Expression[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(body, walk);
  return out;
}
