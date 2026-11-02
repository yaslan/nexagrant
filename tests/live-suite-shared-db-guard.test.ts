import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * FO-366 F3: tests/helpers/live-db-role.test.ts proves `usedDatabaseName` works; nothing
 * proved a suite still calls it. A suite put back on the owner connection's name (FO-356
 * scenario I), or with its guard switched off, left every test green. This pins the guards
 * by reading the suites' source.
 *
 * Limit: it reads the guard's expression, not what the suite does with the result. That a
 * suite really skips is measured by running it on a database named `fabrika`.
 */

const ROOT = path.resolve(import.meta.dirname, '..');

/** Suites whose name check must read `usedDatabaseName`. Removing one's guard fails below. */
const USED_CONNECTION = [
  'tests/expert-prereg-retention.live.test.ts',
  'tests/invitation-retention.live.test.ts',
  'tests/k1-embeddings.live.test.ts',
  'tests/m17-interreg-fo191.live.test.ts',
  'tests/m17-stale-runs.live.test.ts',
  'tests/m17-text-retention.live.test.ts',
  'tests/notification-retention.live.test.ts',
  'tests/public-lead.live.test.ts',
  'tests/stale-relationship-reminder.live.test.ts',
  'tests/stripe-event-retention.live.test.ts',
  'tests/topic-match-nightly.live.test.ts',
];

/**
 * Exception: these read the name from the DATABASE_URL in `process.env`. They do not swap the
 * singleton to DATABASE_URL_RLS_TEST, so that URL is the connection the destructive code uses.
 * The ingest suite does open DATABASE_URL_RLS_TEST, but only for writes that must be refused
 * with 42501; it does no destructive work there, so the name is not read from it.
 */
const URL_BASED = ['tests/partner-search-acceptance.live.test.ts', 'tests/partner-search-ingest.live.test.ts'];

/** Opened by its own ALLOW_SWEEP_ON_SHARED_DB, not by CI: ci.yml sets that flag on its Test step. */
const OPENED_BY_FLAG = ['tests/m17-stale-runs.live.test.ts'];

type Compare = { file: string; name: string; expression: string; usedCall: string | undefined };

function liveSuites(): string[] {
  return readdirSync(path.join(ROOT, 'tests'), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.live.test.ts'))
    .map((file) => `tests/${file.split(path.sep).join('/')}`);
}

function isFabrika(node: ts.Node): boolean {
  return ts.isStringLiteralLike(node) && node.text === 'fabrika';
}

function findUsedCall(node: ts.Node): ts.CallExpression | undefined {
  if (ts.isCallExpression(node) && node.expression.getText() === 'usedDatabaseName') return node;
  return ts.forEachChild(node, findUsedCall);
}

/** Each `x === 'fabrika'` of a file, with the `usedDatabaseName(...)` call `x` was read from. */
function comparesIn(file: string, source: string): Compare[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const initializers = new Map<string, ts.Expression>();
  const compares: ts.BinaryExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, node.initializer);
    }
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind) &&
      (isFabrika(node.left) || isFabrika(node.right))
    ) {
      compares.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return compares.map((compare) => {
    const name = (isFabrika(compare.left) ? compare.right : compare.left).getText();
    const initializer = initializers.get(name);
    const call = initializer && findUsedCall(initializer);
    // The whole condition the comparison sits in: `a === 'fabrika' && !isCi()`.
    const parent = compare.parent;
    const expression = ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? parent.getText() : compare.getText();
    return { file, name, expression, usedCall: call?.getText() };
  });
}

function guards(): Compare[] {
  return liveSuites().flatMap((file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    return source.includes('fabrika') ? comparesIn(file, source) : [];
  });
}

describe('live suites that refuse the shared "fabrika" database', () => {
  const found = guards();

  it('are exactly the known ones: a guard cannot vanish, and a new one gets reviewed here', () => {
    expect([...new Set(found.map((g) => g.file))].sort()).toEqual([...USED_CONNECTION, ...URL_BASED].sort());
  });

  it.each(found.filter((g) => !URL_BASED.includes(g.file)).map((g) => [g.file, g] as const))(
    '%s reads the name with usedDatabaseName, from two different connections',
    (_file, guard) => {
      expect(guard.usedCall, `${guard.name} does not come from usedDatabaseName`).toBeDefined();
      const args = (guard.usedCall ?? '').replace(/^usedDatabaseName\(|\)$/g, '').split(',').map((arg) => arg.trim());
      expect(args).toHaveLength(3);
      expect(args[0]).not.toBe(args[1]);
    },
  );

  it.each(URL_BASED)('%s (URL-based exception) reads the name from process.env.DATABASE_URL', (file) => {
    expect(readFileSync(path.join(ROOT, file), 'utf8')).toContain("new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname");
  });

  it.each(found.filter((g) => !OPENED_BY_FLAG.includes(g.file)).map((g) => [g.file, g] as const))(
    '%s opens only in CI, and asks isCi() what that means',
    (_file, guard) => {
      expect(guard.expression).toBe(`${guard.name} === 'fabrika' && !isCi()`);
    },
  );

  it('m17-stale-runs stays opened by its flag alone, not by CI', () => {
    const guard = found.find((g) => g.file === OPENED_BY_FLAG[0]);
    expect(guard?.expression).toBe(`${guard?.name} === 'fabrika' && process.env.ALLOW_SWEEP_ON_SHARED_DB !== '1'`);
  });
});
