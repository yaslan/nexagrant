import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'src');

/**
 * TASK-MULVJV5TCHICH — a 'use server' module exports async functions and
 * nothing else.
 *
 * Next compiles every export of such a module into a server-action reference,
 * and refuses anything that is not an async function. The refusal is not local:
 * src/lib/agency/actions.ts once exported an Error class, and every route that
 * imported it — the dashboard among them — answered 500 on `next dev` and
 * failed `next build`. Types are erased and stay allowed; everything else that
 * carries a value (classes, constants, sync functions, enums, re-exports whose
 * target this file cannot see) is reported with its line.
 */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) found.push(full);
  }
  return found;
}

function hasUseServerDirective(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === 'use server') return true;
  }
  return false;
}

const isAsync = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

const hasExport = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

function isAsyncFunctionValue(expr: ts.Expression | undefined): boolean {
  if (!expr) return false;
  while (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    expr = expr.expression;
  }
  return (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) && isAsync(expr);
}

/** Exports of one 'use server' module that are not async functions. */
function violations(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const at = (node: ts.Node, what: string) =>
    out.push(
      `${path.relative(REPO_ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${what}`,
    );

  // Local top-level bindings, so `export { a, b }` can be checked against them.
  const asyncLocals = new Set<string>();
  const typeLocals = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isAsync(stmt)) asyncLocals.add(stmt.name.text);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isAsyncFunctionValue(d.initializer)) asyncLocals.add(d.name.text);
      }
    }
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) typeLocals.add(stmt.name.text);
  }

  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) continue;
    if (ts.isFunctionDeclaration(stmt) && hasExport(stmt)) {
      if (!isAsync(stmt)) at(stmt, `function ${stmt.name?.text ?? 'default'} is not async`);
    } else if (ts.isClassDeclaration(stmt) && hasExport(stmt)) {
      at(stmt, `class ${stmt.name?.text ?? 'default'}`);
    } else if (ts.isEnumDeclaration(stmt) && hasExport(stmt)) {
      at(stmt, `enum ${stmt.name.text}`);
    } else if (ts.isVariableStatement(stmt) && hasExport(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!isAsyncFunctionValue(d.initializer)) at(d, `const ${d.name.getText(sf)} is not an async function`);
      }
    } else if (ts.isExportAssignment(stmt)) {
      const e = stmt.expression;
      if (!(isAsyncFunctionValue(e) || (ts.isIdentifier(e) && asyncLocals.has(e.text))))
        at(stmt, 'export default is not an async function');
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      if (stmt.moduleSpecifier) {
        at(
          stmt,
          `re-export from ${stmt.moduleSpecifier.getText(sf)} (cannot be checked here; declare the actions in this file)`,
        );
        continue;
      }
      if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;
      for (const el of stmt.exportClause.elements) {
        if (el.isTypeOnly) continue;
        const local = (el.propertyName ?? el.name).text;
        if (!asyncLocals.has(local) && !typeLocals.has(local)) at(el, `${local} is not an async function`);
      }
    }
  }
  return out;
}

function scan(files: string[]): string[] {
  return files.flatMap((file) => {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    return hasUseServerDirective(sf) ? violations(sf) : [];
  });
}

describe("'use server' modules", () => {
  it('export only async functions', () => {
    expect(
      scan(sourceFiles(SRC)),
      "a 'use server' module may export only async functions — move classes, constants and helpers to a plain module",
    ).toEqual([]);
  });

  it('the scanner catches what Next refuses', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'use-server-'));
    const bad = path.join(dir, 'bad.ts');
    fs.writeFileSync(
      bad,
      [
        "'use server';",
        'export class E extends Error {}',
        'export const LIMIT = 3;',
        'export function sync() {}',
        'export async function ok() {}',
        'export const okArrow = async () => 1;',
        'export type T = string;',
        'export interface I { a: number }',
        'function helper() {}',
        'export { helper, ok as ok2 };',
        "export { x } from './elsewhere';",
      ].join('\n'),
    );
    const plain = path.join(dir, 'plain.ts');
    fs.writeFileSync(plain, "export class E extends Error {}\n// 'use server' later is not a directive\n");
    try {
      const found = scan([bad, plain]).map((v) => v.replace(/^.*bad\.ts:/, ''));
      expect(found).toEqual([
        '2 class E',
        '3 const LIMIT is not an async function',
        '4 function sync is not async',
        '10 helper is not an async function',
        "11 re-export from './elsewhere' (cannot be checked here; declare the actions in this file)",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
