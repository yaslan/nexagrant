import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * TASK-MUMSUA77J1C6Q — the scanner behind tests/teardown-where-guard.test.ts
 * and (TASK-MUN2KUHP1BP18) tests/where-guard-src.test.ts. The rules are
 * documented in the first of those. Kept out of the test files so both can
 * point it at their own tree.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CHECKED_METHODS = new Set(['deleteMany', 'updateMany', 'updateManyAndReturn']);
/** `f(x)` that returns `x` or throws — the value is present afterwards. */
const GUARD_CALLS = new Set(['requireId', 'requireActionId']);
/** `f(x, …)` as a statement that throws on a missing `x`. */
const ASSERT_CALLS = new Set(['requireId', 'requireActionId', 'assertTenantScope']);
/** `if (!f(x)) return|throw` — a present-id predicate. A bare `if (!x)` counts too. */
const PREDICATE_CALLS = new Set(['isPresentId']);
/** `withTenant(t, cb)` / `withTenantOn(client, t, cb)` throw on a missing `t` before `cb` runs. */
const TENANT_WRAPPERS = new Map([
  ['withTenant', 0],
  ['withTenantOn', 1],
]);
/**
 * Calls that return the session's tenant scope, or throw / return null without one.
 * Fields destructured from their result come from the server, not the client.
 */
const TRUSTED_SCOPE_CALLS = new Set(['requireTenantAction', 'requireTenantApi', 'sessionScope', 'assertTenant']);
/** Keys whose array holds `where` objects: an element that lost its key is `{}` and matches every row. */
const LOGIC_KEYS = new Set(['AND', 'OR', 'NOT']);

export function testFiles(dir: string, all: boolean): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(full, all || entry.name === '__tests__'));
    else if (/\.tsx?$/.test(entry.name) && (all || /\.test\.tsx?$/.test(entry.name))) found.push(full);
  }
  return found;
}

/** Every non-test `.ts` / `.tsx` file under `dir` (production code). */
export function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Report every unguarded `where` value in one file, as `file:line text`. */
export function unguardedWheres(source: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const flat = (node: ts.Node) => node.getText(sf).replace(/\s+/g, ' ');
  // POSIX separators on every platform: tests/where-guard-src.test.ts keys KNOWN by this path.
  const rel = () => (path.relative(REPO_ROOT, fileName) || fileName).split(path.sep).join('/');
  const report = (node: ts.Node, text: string) => out.push(`${rel()}:${lineOf(node)} ${text}`);

  // Every variable declaration and destructured binding by name, every name that
  // is reassigned, and every root whose fields are written after declaration.
  const decls = new Map<string, ts.VariableDeclaration[]>();
  const bindings = new Map<string, ts.BindingElement[]>();
  const reassigned = new Set<string>();
  const fieldWritten = new Set<string>();
  const visitDecls = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const list = decls.get(node.name.text) ?? [];
      list.push(node);
      decls.set(node.name.text, list);
    }
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      const list = bindings.get(node.name.text) ?? [];
      list.push(node);
      bindings.set(node.name.text, list);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const left = unwrap(node.left);
      if (ts.isIdentifier(left)) reassigned.add(left.text);
      const root = rootIdentifier(left);
      if (root && root !== left) fieldWritten.add(root.text);
    }
    ts.forEachChild(node, visitDecls);
  };

  function unwrap(e: ts.Expression): ts.Expression {
    while (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isAwaitExpression(e)
    ) {
      e = e.expression;
    }
    return e;
  }

  function rootIdentifier(e: ts.Expression): ts.Identifier | undefined {
    e = unwrap(e);
    while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = unwrap(e.expression);
    return ts.isIdentifier(e) ? e : undefined;
  }

  visitDecls(sf);

  const isConstList = (list: ts.Node) =>
    ts.isVariableDeclarationList(list) &&
    (list.flags & ts.NodeFlags.Const) !== 0 &&
    !ts.isForOfStatement(list.parent) &&
    !ts.isForInStatement(list.parent);
  const isConstDecl = (d: ts.VariableDeclaration) => isConstList(d.parent);

  /** The one declaration of `name` visible at `at`: the only one, or the innermost whose scope encloses `at`. */
  function declAt(name: string, at: ts.Node): ts.VariableDeclaration | undefined {
    const list = decls.get(name) ?? [];
    if (list.length <= 1) return list[0];
    let best: ts.VariableDeclaration | undefined;
    let bestDepth = -1;
    for (const d of list) {
      let scope: ts.Node | undefined = d.parent;
      while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      if (!scope || !(scope.pos <= at.pos && at.end <= scope.end)) continue;
      let depth = 0;
      for (let n: ts.Node | undefined = scope; n; n = n.parent) depth++;
      if (depth > bestDepth) [best, bestDepth] = [d, depth];
      else if (depth === bestDepth) return undefined; // two in one scope: cannot tell which
    }
    return best;
  }

  /** Names bound as parameters of the functions around `at` — a same-named `const` elsewhere does not apply. */
  function isParameterAt(name: string, at: ts.Node): boolean {
    for (let n: ts.Node | undefined = at; n; n = n.parent) {
      if (ts.isFunctionLike(n)) {
        for (const p of n.parameters) if (bindsName(p.name, name)) return true;
      }
    }
    return false;
  }
  function bindsName(b: ts.BindingName, name: string): boolean {
    if (ts.isIdentifier(b)) return b.text === name;
    return b.elements.some((el) => !ts.isOmittedExpression(el) && bindsName(el.name, name));
  }

  /** `if (!isPresentId(x)) return|throw` / `requireActionId(x, …);` earlier in an enclosing block. */
  function guardedByStatement(at: ts.Node, text: string): boolean {
    const root = text.split('.')[0]!;
    if (reassigned.has(root)) return false;
    for (let cur: ts.Node = at; cur.parent; cur = cur.parent) {
      const parent = cur.parent;
      if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
        const idx = parent.statements.indexOf(cur as ts.Statement);
        for (let i = 0; i < idx; i++) if (isGuardFor(parent.statements[i]!, text)) return true;
      }
    }
    return false;
  }
  function isGuardFor(stmt: ts.Statement, text: string): boolean {
    if (ts.isExpressionStatement(stmt)) {
      const e = unwrap(stmt.expression);
      return (
        ts.isCallExpression(e) &&
        ts.isIdentifier(e.expression) &&
        ASSERT_CALLS.has(e.expression.text) &&
        !!e.arguments[0] &&
        unwrap(e.arguments[0]).getText(sf) === text
      );
    }
    if (!ts.isIfStatement(stmt) || !exits(stmt.thenStatement)) return false;
    return disjuncts(stmt.expression).some((term) => {
      const t = unwrap(term);
      if (!ts.isPrefixUnaryExpression(t) || t.operator !== ts.SyntaxKind.ExclamationToken) return false;
      const call = unwrap(t.operand);
      // `if (!id) continue;` — undefined, null and '' are all falsy.
      if (call.getText(sf) === text) return true;
      return (
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        PREDICATE_CALLS.has(call.expression.text) &&
        !!call.arguments[0] &&
        unwrap(call.arguments[0]).getText(sf) === text
      );
    });
  }
  function disjuncts(e: ts.Expression): ts.Expression[] {
    e = unwrap(e);
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return [...disjuncts(e.left), ...disjuncts(e.right)];
    }
    return [e];
  }
  function exits(s: ts.Statement): boolean {
    if (ts.isReturnStatement(s) || ts.isThrowStatement(s) || ts.isContinueStatement(s) || ts.isBreakStatement(s)) {
      return true;
    }
    return ts.isBlock(s) && s.statements.length > 0 && exits(s.statements[s.statements.length - 1]!);
  }

  /** Inside `withTenant(t, cb)`'s callback, `t` has passed `assertTenantScope`. */
  function isTenantWrapperArg(at: ts.Node, text: string): boolean {
    if (reassigned.has(text.split('.')[0]!)) return false;
    for (let n: ts.Node | undefined = at; n?.parent; n = n.parent) {
      const call: ts.Node = n.parent;
      if (!(ts.isArrowFunction(n) || ts.isFunctionExpression(n)) || !ts.isCallExpression(call)) continue;
      const callee = unwrap(call.expression);
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      const tenantIdx = TENANT_WRAPPERS.get(name);
      if (tenantIdx === undefined || call.arguments[tenantIdx + 1] !== n) continue;
      const arg = call.arguments[tenantIdx];
      if (arg && unwrap(arg).getText(sf) === text) return true;
    }
    return false;
  }

  /** `requireTenantAction()` / `sessionScope()` result, possibly through `const scope = …` and `.scope`. */
  function isTrustedScopeExpr(expr: ts.Expression, seen: Set<string>): boolean {
    const e = unwrap(expr);
    if (ts.isCallExpression(e)) {
      const callee = unwrap(e.expression);
      return ts.isIdentifier(callee) && TRUSTED_SCOPE_CALLS.has(callee.text);
    }
    if (ts.isPropertyAccessExpression(e)) return isTrustedScopeExpr(e.expression, seen);
    if (ts.isIdentifier(e)) {
      if (seen.has(e.text) || reassigned.has(e.text) || fieldWritten.has(e.text)) return false;
      const only = declAt(e.text, e);
      return !!only && isConstDecl(only) && !!only.initializer &&
        isTrustedScopeExpr(only.initializer, new Set(seen).add(e.text));
    }
    return false;
  }
  function bindingIsTrusted(name: string, seen: Set<string>): boolean {
    const list = bindings.get(name) ?? [];
    if (list.length === 0 || reassigned.has(name)) return false;
    return list.every((b) => {
      let n: ts.Node = b;
      while (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n = n.parent;
      if (!ts.isVariableDeclaration(n) || !isConstDecl(n) || !n.initializer) return false;
      if (b.initializer || b.dotDotDotToken) return false;
      return isTrustedScopeExpr(n.initializer, seen);
    });
  }

  function identifierIsSafe(name: string, seen: Set<string>, at: ts.Node): boolean {
    if (name === 'undefined' || seen.has(name)) return false;
    if (guardedByStatement(at, name) || isTenantWrapperArg(at, name)) return true;
    if (isParameterAt(name, at)) return false;
    const next = new Set(seen).add(name);
    const list = decls.get(name);
    if (!list || list.length === 0) return bindingIsTrusted(name, next); // parameter, import, or unknown
    if (reassigned.has(name)) return false;
    // The declaration in scope at `at` when several functions reuse the name; all of them otherwise.
    const visible = declAt(name, at);
    return (visible ? [visible] : list).every(
      (d) => isConstDecl(d) && !!d.initializer && valueIsSafe(d.initializer, next, null)
    );
  }

  /** `key` is the property the value sits under; it decides what an array literal means. */
  function valueIsSafe(expr: ts.Expression, seen: Set<string>, key: string | null): boolean {
    const e = unwrap(expr);
    if (
      ts.isStringLiteral(e) ||
      ts.isNumericLiteral(e) ||
      ts.isNoSubstitutionTemplateLiteral(e) ||
      ts.isTemplateExpression(e) ||
      e.kind === ts.SyntaxKind.TrueKeyword ||
      e.kind === ts.SyntaxKind.FalseKeyword ||
      e.kind === ts.SyntaxKind.NullKeyword ||
      ts.isNewExpression(e) // `new Date()` is never undefined
    ) {
      return true;
    }
    if (ts.isArrayLiteralExpression(e)) return arrayIsSafe(e, seen, key);
    if (ts.isObjectLiteralExpression(e)) return objectIsSafe(e, seen, null);
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      if (GUARD_CALLS.has(e.expression.text)) return true;
      // An empty list is safe under `in` (matches nothing) and fatal under `notIn` (matches everything).
      if (e.expression.text === 'presentIds') return key === 'in';
      return false;
    }
    if (ts.isIdentifier(e)) return identifierIsSafe(e.text, seen, e);
    if (ts.isPropertyAccessExpression(e) && !e.questionDotToken) {
      const text = e.getText(sf);
      if (guardedByStatement(e, text) || isTenantWrapperArg(e, text)) return true;
      if (isTrustedScopeExpr(e.expression, seen)) return true;
      // `USER_B.id` / `F10.full.tenantId` over a `const` object literal whose field is itself safe.
      const field = constObjectField(e, seen);
      return !!field && valueIsSafe(field, seen, key);
    }
    return false;
  }

  function arrayIsSafe(arr: ts.ArrayLiteralExpression, seen: Set<string>, key: string | null): boolean {
    if (key !== null && LOGIC_KEYS.has(key)) {
      // `AND: [{ id: x }]` with `x` undefined is `AND: [{}]` — every row (İNCELEME-27 B-2).
      // `AND: []` / `NOT: []` match every row too.
      if (arr.elements.length === 0) return key === 'OR';
      return arr.elements.every((el) => {
        const u = ts.isSpreadElement(el) ? null : unwrap(el);
        if (!u) return false;
        if (ts.isObjectLiteralExpression(u)) return objectIsSafe(u, seen, null);
        if (ts.isIdentifier(u)) {
          const list = decls.get(u.text) ?? [];
          const only = list.length === 1 ? list[0] : undefined;
          const init = only && isConstDecl(only) && !reassigned.has(u.text) ? only.initializer : undefined;
          return !!init && ts.isObjectLiteralExpression(unwrap(init)) && objectIsSafe(unwrap(init) as ts.ObjectLiteralExpression, seen, null);
        }
        return false;
      });
    }
    if (key === 'notIn') {
      // A literal element cannot drop out (Prisma throws on `undefined` in a list),
      // but `notIn: []` excludes nothing and a spread can be empty.
      return arr.elements.length > 0 && arr.elements.every((el) => !ts.isSpreadElement(el));
    }
    // `in: [a?.id]`: Prisma rejects an `undefined` element outright and an empty list matches nothing.
    return true;
  }

  /** The initializer of `a.b.c` when `a` is a `const` object literal that spells out `b.c` and is never written to. */
  function constObjectField(e: ts.PropertyAccessExpression, seen: Set<string>): ts.Expression | undefined {
    let obj: ts.Expression | undefined;
    const target = unwrap(e.expression);
    if (ts.isIdentifier(target)) {
      if (seen.has(target.text) || fieldWritten.has(target.text) || reassigned.has(target.text)) return undefined;
      if (isParameterAt(target.text, e)) return undefined;
      const list = decls.get(target.text) ?? [];
      const only = list.length === 1 ? list[0] : undefined;
      if (!only || !isConstDecl(only) || !only.initializer) return undefined;
      obj = unwrap(only.initializer);
    } else if (ts.isPropertyAccessExpression(target) && !target.questionDotToken) {
      obj = constObjectField(target, seen);
      obj = obj && unwrap(obj);
    }
    if (!obj || !ts.isObjectLiteralExpression(obj)) return undefined;
    const prop = obj.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && p.name.text === e.name.text,
    );
    return prop && ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
  }

  const propKey = (p: ts.ObjectLiteralElementLike) =>
    p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;

  /** Checks each property; with `reportAt`, records the offending ones instead of stopping. */
  function objectIsSafe(obj: ts.ObjectLiteralExpression, seen: Set<string>, reportAt: ts.Node | null): boolean {
    let ok = true;
    for (const prop of obj.properties) {
      let safe: boolean;
      if (ts.isPropertyAssignment(prop)) {
        const init = unwrap(prop.initializer);
        safe = ts.isObjectLiteralExpression(init)
          ? objectIsSafe(init, seen, reportAt)
          : valueIsSafe(init, seen, propKey(prop));
        if (!safe && reportAt && !ts.isObjectLiteralExpression(init)) report(prop, flat(prop));
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        safe = identifierIsSafe(prop.name.text, seen, prop);
        if (!safe && reportAt) report(prop, `{ ${prop.name.text} } (shorthand)`);
      } else {
        // spread / method — cannot be proven
        safe = false;
        if (reportAt) report(prop, flat(prop));
      }
      ok = ok && safe;
    }
    return ok;
  }

  /** `where` of a call or of a nested relation write; `at` is the line the report points to. */
  function checkWhereExpr(whereExpr: ts.Expression, at: ts.Node) {
    whereExpr = unwrap(whereExpr);
    // `deleteMany({ where })` over `const where = { … }` — check the initializer.
    if (ts.isIdentifier(whereExpr)) {
      const list = decls.get(whereExpr.text) ?? [];
      const only = list.length === 1 ? list[0] : undefined;
      const init =
        only && isConstDecl(only) && !reassigned.has(whereExpr.text) && !fieldWritten.has(whereExpr.text)
          ? only.initializer
          : undefined;
      if (init && ts.isObjectLiteralExpression(unwrap(init))) {
        whereExpr = unwrap(init);
      } else {
        report(at, `where: ${whereExpr.text} (not a const object literal)`);
        return;
      }
    }
    if (ts.isObjectLiteralExpression(whereExpr)) {
      objectIsSafe(whereExpr, new Set(), whereExpr);
    } else {
      report(at, `where: ${flat(whereExpr)} (not an object literal)`);
    }
  }

  function checkCall(call: ts.CallExpression) {
    const arg = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
    if (!arg) {
      report(call, `${flat(call)} (no where at all)`);
      return;
    }
    if (ts.isObjectLiteralExpression(arg)) {
      const whereProp = arg.properties.find((p) => propKey(p) === 'where');
      if (!whereProp) {
        report(call, `${flat(call)} (no where)`);
        return;
      }
      if (ts.isShorthandPropertyAssignment(whereProp)) checkWhereExpr(whereProp.name, call);
      else if (ts.isPropertyAssignment(whereProp)) checkWhereExpr(whereProp.initializer, call);
      else report(call, `${flat(whereProp)} (where cannot be read)`);
    } else {
      checkWhereExpr(arg, call);
    }
  }

  /**
   * `update({ data: { rel: { deleteMany: { x } } } })`: the nested filter is the
   * `where` of a delete over the parent's related rows (İNCELEME-27 Ö-1).
   * `deleteMany: {}` is left alone — it spells out "all of them".
   */
  function checkNested(prop: ts.PropertyAssignment, method: string) {
    const init = unwrap(prop.initializer);
    const items = ts.isArrayLiteralExpression(init) ? [...init.elements] : [init];
    // `{ updateMany: ['data'] }` is a lookup table of names, not a relation write.
    if (items.some((i) => ts.isStringLiteral(i) || ts.isNumericLiteral(i) || ts.isNoSubstitutionTemplateLiteral(i))) return;
    for (const item of items) {
      const u = ts.isSpreadElement(item) ? undefined : unwrap(item);
      if (!u || !ts.isObjectLiteralExpression(u)) {
        report(prop, `nested ${method}: ${flat(item)} (not an object literal)`);
        continue;
      }
      if (method === 'deleteMany') {
        objectIsSafe(u, new Set(), u);
      } else {
        const where = u.properties.find((p) => propKey(p) === 'where');
        if (where && ts.isPropertyAssignment(where)) checkWhereExpr(where.initializer, prop);
        else report(prop, `nested ${method} (no where)`);
      }
    }
  }

  /** A raw statement that starts as DELETE / UPDATE / TRUNCATE and carries no WHERE (İNCELEME-27 Ö-1). */
  function checkRawSql(text: string, at: ts.Node) {
    const body = text.replace(/^[`'"]\s*/, '');
    const filterless = /^TRUNCATE\b/i.test(body) || (/^(DELETE\s+FROM|UPDATE)\b/i.test(body) && !/\bWHERE\b/i.test(body));
    if (filterless) report(at, `${flat(at).slice(0, 120)} (raw write without WHERE)`);
  }

  const methodName = (callee: ts.Expression): string | undefined => {
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    if (ts.isElementAccessExpression(callee)) {
      const a = unwrap(callee.argumentExpression);
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return a.text;
    }
    return undefined;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = methodName(node.expression);
      if (name && CHECKED_METHODS.has(name)) checkCall(node);
      if (name === '$executeRawUnsafe' && node.arguments[0]) {
        const a = unwrap(node.arguments[0]);
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) || ts.isTemplateExpression(a)) {
          checkRawSql(a.getText(sf), node);
        }
      }
    }
    if (ts.isTaggedTemplateExpression(node) && methodName(node.tag) === '$executeRaw') {
      checkRawSql(node.template.getText(sf), node);
    }
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent)) {
      const key = propKey(node);
      const init = unwrap(node.initializer);
      // Only relation writes spelled as literals, not `{ deleteMany: fn }` lookup tables.
      if (key && CHECKED_METHODS.has(key) && (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init))) {
        checkNested(node, key);
      }
    }
    // `const { deleteMany } = prisma.tenant` — the call site can no longer be read.
    // Only off a model delegate (`a.b`, `a['b']`); `const { updateMany } = makeFake()` is not one.
    if (ts.isBindingElement(node)) {
      const bound = node.propertyName && ts.isIdentifier(node.propertyName) ? node.propertyName.text
        : ts.isIdentifier(node.name) ? node.name.text : '';
      let decl: ts.Node = node;
      while (ts.isBindingElement(decl) || ts.isObjectBindingPattern(decl) || ts.isArrayBindingPattern(decl)) decl = decl.parent;
      const from = ts.isVariableDeclaration(decl) && decl.initializer ? unwrap(decl.initializer) : undefined;
      const offDelegate = !!from && (ts.isPropertyAccessExpression(from) || ts.isElementAccessExpression(from));
      if (CHECKED_METHODS.has(bound) && offDelegate) report(node, `destructured ${bound} (call cannot be checked)`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
