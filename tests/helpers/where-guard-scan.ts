import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * TASK-MUMSUA77J1C6Q — the scanner behind tests/teardown-where-guard.test.ts.
 * The rules are documented there. Kept out of the test file so it can also be
 * pointed at production code (docs/agent-results/TASK-MUMSUA77J1C6Q-be-fb.md §4).
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CHECKED_METHODS = new Set(['deleteMany', 'updateMany']);
const GUARD_CALLS = new Set(['requireId', 'presentIds']);

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

/** Report every unguarded `where` value in one file, as `file:line text`. */
export function unguardedWheres(source: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  // Every variable declaration by name, so an identifier can be resolved to its initializer.
  const decls = new Map<string, ts.VariableDeclaration[]>();
  const visitDecls = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const list = decls.get(node.name.text) ?? [];
      list.push(node);
      decls.set(node.name.text, list);
    }
    ts.forEachChild(node, visitDecls);
  };
  visitDecls(sf);

  const isConstDecl = (d: ts.VariableDeclaration) =>
    ts.isVariableDeclarationList(d.parent) &&
    (d.parent.flags & ts.NodeFlags.Const) !== 0 &&
    !ts.isForOfStatement(d.parent.parent) &&
    !ts.isForInStatement(d.parent.parent);

  const unwrap = (e: ts.Expression): ts.Expression => {
    while (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isTypeAssertionExpression(e)
    ) {
      e = e.expression;
    }
    return e;
  };

  function identifierIsSafe(name: string, seen: Set<string>): boolean {
    if (name === 'undefined' || seen.has(name)) return false;
    const list = decls.get(name);
    if (!list || list.length === 0) return false; // parameter, import, or unknown
    const next = new Set(seen).add(name);
    return list.every((d) => isConstDecl(d) && !!d.initializer && valueIsSafe(d.initializer, next));
  }

  function valueIsSafe(expr: ts.Expression, seen: Set<string>): boolean {
    const e = unwrap(expr);
    if (
      ts.isStringLiteral(e) ||
      ts.isNumericLiteral(e) ||
      ts.isNoSubstitutionTemplateLiteral(e) ||
      ts.isTemplateExpression(e) ||
      e.kind === ts.SyntaxKind.TrueKeyword ||
      e.kind === ts.SyntaxKind.FalseKeyword ||
      e.kind === ts.SyntaxKind.NullKeyword
    ) {
      return true;
    }
    if (ts.isArrayLiteralExpression(e)) return true;
    if (ts.isObjectLiteralExpression(e)) return objectIsSafe(e, seen, null);
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && GUARD_CALLS.has(e.expression.text)) return true;
    if (ts.isIdentifier(e)) return identifierIsSafe(e.text, seen);
    // `USER_B.id` / `F10.full.tenantId` over a `const` object literal whose field is itself safe.
    if (ts.isPropertyAccessExpression(e) && !e.questionDotToken) {
      const field = constObjectField(e, seen);
      return !!field && valueIsSafe(field, seen);
    }
    return false;
  }

  /** The initializer of `a.b.c` when `a` is a `const` object literal that spells out `b.c`. */
  function constObjectField(e: ts.PropertyAccessExpression, seen: Set<string>): ts.Expression | undefined {
    let obj: ts.Expression | undefined;
    const target = unwrap(e.expression);
    if (ts.isIdentifier(target)) {
      if (seen.has(target.text)) return undefined;
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

  /** Checks each property; with `report`, records the offending ones instead of stopping. */
  function objectIsSafe(obj: ts.ObjectLiteralExpression, seen: Set<string>, report: ts.Node | null): boolean {
    let ok = true;
    for (const prop of obj.properties) {
      let safe: boolean;
      if (ts.isPropertyAssignment(prop)) {
        const init = unwrap(prop.initializer);
        safe = ts.isObjectLiteralExpression(init) ? objectIsSafe(init, seen, report) : valueIsSafe(init, seen);
        if (!safe && report && !ts.isObjectLiteralExpression(init)) {
          out.push(`${rel()}:${lineOf(prop)} ${prop.getText(sf).replace(/\s+/g, ' ')}`);
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        safe = identifierIsSafe(prop.name.text, seen);
        if (!safe && report) out.push(`${rel()}:${lineOf(prop)} { ${prop.name.text} } (shorthand)`);
      } else {
        // spread / method — cannot be proven
        safe = false;
        if (report) out.push(`${rel()}:${lineOf(prop)} ${prop.getText(sf).replace(/\s+/g, ' ')}`);
      }
      ok = ok && safe;
    }
    return ok;
  }

  const rel = () => path.relative(REPO_ROOT, fileName) || fileName;

  function checkWhere(call: ts.CallExpression) {
    const arg = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
    if (!arg) {
      out.push(`${rel()}:${lineOf(call)} ${call.getText(sf)} (no where at all)`);
      return;
    }
    let whereExpr: ts.Expression | undefined;
    if (ts.isObjectLiteralExpression(arg)) {
      const whereProp = arg.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'where');
      if (!whereProp) {
        out.push(`${rel()}:${lineOf(call)} ${call.getText(sf).replace(/\s+/g, ' ')} (no where)`);
        return;
      }
      if (ts.isShorthandPropertyAssignment(whereProp)) {
        whereExpr = whereProp.name;
      } else if (ts.isPropertyAssignment(whereProp)) {
        whereExpr = whereProp.initializer;
      }
    } else {
      whereExpr = arg;
    }
    if (!whereExpr) return;
    whereExpr = unwrap(whereExpr);
    // `deleteMany({ where })` over `const where = { … }` — check the initializer.
    if (ts.isIdentifier(whereExpr)) {
      const list = decls.get(whereExpr.text) ?? [];
      const only = list.length === 1 ? list[0] : undefined;
      const init = only && isConstDecl(only) ? only.initializer : undefined;
      if (init && ts.isObjectLiteralExpression(unwrap(init))) {
        whereExpr = unwrap(init);
      } else {
        out.push(`${rel()}:${lineOf(call)} where: ${whereExpr.text} (not a const object literal)`);
        return;
      }
    }
    if (ts.isObjectLiteralExpression(whereExpr)) {
      objectIsSafe(whereExpr, new Set(), whereExpr);
    } else {
      out.push(`${rel()}:${lineOf(call)} where: ${whereExpr.getText(sf)} (not an object literal)`);
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      CHECKED_METHODS.has(node.expression.name.text)
    ) {
      checkWhere(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

