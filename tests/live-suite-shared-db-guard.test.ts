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
 *
 * FO-376: the guard opens on `isGithubActions()`, not `isCi()`. A hand-typed `CI=true` opened 12
 * suites on the shared database and deleted rows (FO-371). And a second scan covers what the first
 * cannot see: a suite that never says "fabrika" but deletes without a scope (`deleteMany({})`, a
 * `DELETE` with no `WHERE`, `TRUNCATE`) — FO-371 mutant M13.
 */

const ROOT = path.resolve(import.meta.dirname, '..');

/** Suites whose name check must read `usedDatabaseName`. Removing one's guard fails below. */
const USED_CONNECTION = [
  'tests/expert-prereg-retention.live.test.ts',
  'tests/invitation-retention.live.test.ts',
  'tests/k1-embeddings.live.test.ts',
  'tests/keep-eu-cordis-reindex.live.test.ts',
  'tests/keep-eu-sync.live.test.ts',
  'tests/m17-interreg-fo191.live.test.ts',
  'tests/m17-stale-runs.live.test.ts',
  'tests/m17-text-retention.live.test.ts',
  'tests/notification-retention.live.test.ts',
  'tests/public-lead.live.test.ts',
  'tests/public-lead-stuck.live.test.ts',
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

/**
 * Exception: reads the name with `select current_database()` on the owner connection (`admin`), the
 * same connection its rls:verify child processes run on. NG-206 (D-B1): the mutation tests commit a
 * mutated view, so they refuse "fabrika". The URL is not parsed, so a DATABASE_URL that only .env holds
 * cannot make the name read as something else.
 */
const SERVER_NAME = ['tests/rls-verify-system-scope-policy-set.live.test.ts'];

/** Opened by its own ALLOW_SWEEP_ON_SHARED_DB, not by CI or GitHub Actions: ci.yml sets that flag on its Test step. */
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
    // The whole condition the comparison sits in: `a === 'fabrika' && !isGithubActions()`.
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
    expect([...new Set(found.map((g) => g.file))].sort()).toEqual([...USED_CONNECTION, ...URL_BASED, ...SERVER_NAME].sort());
  });

  it.each(found.filter((g) => !URL_BASED.includes(g.file) && !SERVER_NAME.includes(g.file)).map((g) => [g.file, g] as const))(
    '%s reads the name with usedDatabaseName(<RLS connection>, admin, SUITE), in that order',
    (_file, guard) => {
      expect(guard.usedCall, `${guard.name} does not come from usedDatabaseName`).toBeDefined();
      const args = (guard.usedCall ?? '').replace(/^usedDatabaseName\(|\)$/g, '').split(',').map((arg) => arg.trim());
      expect(args).toHaveLength(3);
      // FO-376 N1: first the connection the code under test runs on (the singleton swapped to
      // DATABASE_URL_RLS_TEST, or the suite's RLS handle), second the owner connection that builds the
      // fixtures. Swapped, the "could not read" skip and the error labels would point at the wrong one.
      expect(['prisma', 'state.rls']).toContain(args[0]);
      expect(args[1]).toBe('admin');
      expect(args[2]).toBe('SUITE');
    },
  );

  it.each(URL_BASED)('%s (URL-based exception) reads the name from process.env.DATABASE_URL', (file) => {
    expect(readFileSync(path.join(ROOT, file), 'utf8')).toContain("new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname");
  });

  // NG-206 review tur 2: the SERVER_NAME exemption skips the usedDatabaseName check above, so pin the
  // source of the name here: the server's answer on the owner connection, never a parsed URL.
  it.each(SERVER_NAME)('%s (server-name exception) reads the name with select current_database() on admin', (file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    expect(source).toContain("await admin.query<{ db: string }>('select current_database() as db')");
    expect(source).not.toMatch(/new URL\(/);
  });

  it.each(found.filter((g) => !OPENED_BY_FLAG.includes(g.file)).map((g) => [g.file, g] as const))(
    '%s opens only on GitHub Actions, and asks isGithubActions() what that means',
    (_file, guard) => {
      expect(guard.expression).toBe(`${guard.name} === 'fabrika' && !isGithubActions()`);
    },
  );

  it('m17-stale-runs stays opened by its flag alone, not by CI', () => {
    const guard = found.find((g) => g.file === OPENED_BY_FLAG[0]);
    expect(guard?.expression).toBe(`${guard?.name} === 'fabrika' && process.env.ALLOW_SWEEP_ON_SHARED_DB !== '1'`);
  });
});

/**
 * FO-376 N2: every `*.live.test.ts`, whether or not it names "fabrika". A delete with no scope on the
 * shared database removes other people's rows. Flagged: `deleteMany()` / `deleteMany({})` /
 * `deleteMany({ where: {} })`, a `DELETE FROM` whose SQL has no `WHERE`, and `TRUNCATE`.
 * Scoped deletes (`where: { id: { in: ids } }`, a `startsWith` prefix, a RUN id) are the norm and pass.
 * Limit: reads the literal SQL and the call's own argument; a scope built elsewhere and passed in is
 * not followed, and a global sweep inside production code the suite calls is not seen (FO-371 read those).
 */
export function unscopedDeletes(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const isEmptyObject = (node: ts.Node | undefined): boolean => node !== undefined && ts.isObjectLiteralExpression(node) && node.properties.length === 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'deleteMany') {
      const arg = node.arguments[0];
      const where =
        arg && ts.isObjectLiteralExpression(arg) && arg.properties.length === 1
          ? arg.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === 'where')
          : undefined;
      if (!arg || isEmptyObject(arg) || isEmptyObject(where?.initializer)) hits.push(`deleteMany with no scope: ${node.getText()}`);
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const text = ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ') : node.text;
      if (/\bTRUNCATE\s+(TABLE\s+)?["\w]/i.test(text)) hits.push(`TRUNCATE: ${text.trim().slice(0, 80)}`);
      if (/\bDELETE\s+FROM\b/i.test(text) && !/\bWHERE\b/i.test(text)) hits.push(`DELETE without WHERE: ${text.trim().slice(0, 80)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return hits;
}

/**
 * Hits that are deliberate. Each needs a reason; an entry whose hit has gone fails below, so the list
 * cannot rot into a blanket pass.
 */
const UNSCOPED_ALLOWED: Record<string, { hit: string; reason: string }> = {
  'tests/auditevent-immutable.live.test.ts': {
    hit: 'TRUNCATE: TRUNCATE "AuditEvent"',
    reason:
      'run over fabrika_app (assertAppConnection pins the role), which has SELECT and INSERT only on AuditEvent; the test asserts ' +
      '42501 and that the fixture row survives (NG-40). The statement is the thing under test, never expected to execute.',
  },
  'tests/m17-interreg-analyses.live.test.ts': {
    hit: 'TRUNCATE: TRUNCATE "InterregRubricCriterion"',
    reason:
      'run over state.rls (fabrika_app), which has SELECT only on the rubric tables; the test asserts "permission denied" ' +
      'and then that the seeded grid is intact (se-fb D3). The statement is the thing under test, never expected to execute.',
  },
};

describe('live suites never delete without a scope, whatever database they name (FO-376 N2)', () => {
  const found = liveSuites().flatMap((file) => unscopedDeletes(file, readFileSync(path.join(ROOT, file), 'utf8')).map((hit) => ({ file, hit })));

  it('no live suite has an unscoped delete outside the reasoned allow list', () => {
    const allowed = new Set(Object.entries(UNSCOPED_ALLOWED).map(([file, entry]) => `${file} ${entry.hit}`));
    expect(found.map((f) => `${f.file} ${f.hit}`).filter((line) => !allowed.has(line))).toEqual([]);
  });

  it('every allow-list entry still matches, and says why', () => {
    for (const [file, entry] of Object.entries(UNSCOPED_ALLOWED)) {
      expect(found, `${file} no longer has the allowed hit; remove the entry`).toContainEqual({ file, hit: entry.hit });
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  describe('the scanner itself (so a quiet result means something)', () => {
    it.each([
      ['empty deleteMany()', 'await prisma.user.deleteMany();'],
      ['deleteMany({})', 'await prisma.user.deleteMany({});'],
      ['deleteMany({ where: {} })', 'await prisma.user.deleteMany({ where: {} });'],
      ['DELETE without WHERE', 'await db.$executeRawUnsafe(\'DELETE FROM "Notification"\');'],
      ['multi-line DELETE without WHERE', 'await db.$executeRawUnsafe(`\n  DELETE\n  FROM "Notification"\n`);'],
      ['TRUNCATE', 'await db.$executeRawUnsafe(\'TRUNCATE "Tenant" CASCADE\');'],
    ])('flags %s', (_label, source) => {
      expect(unscopedDeletes('probe.live.test.ts', source)).toHaveLength(1);
    });

    it.each([
      ['a where on ids', 'await prisma.user.deleteMany({ where: { id: { in: ids } } });'],
      ['a startsWith prefix', 'await prisma.user.deleteMany({ where: { email: { startsWith: "fo376-" } } });'],
      ['DELETE with WHERE', 'await db.$executeRawUnsafe(`DELETE FROM "Notification" WHERE "tenantId" = ${id}`);'],
      ['a file that never says fabrika', 'await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });'],
    ])('passes %s', (_label, source) => {
      expect(unscopedDeletes('probe.live.test.ts', source)).toEqual([]);
    });
  });
});

/** The gate's required MUTATION_ALLOWED initializer (NG-206 review tur 5, B-2a). */
const EXPECTED_MUTATION_ALLOWED = 'isGithubActions()||(DB_NAME!==undefined&&!SHARED_DB&&process.env.RLS_MUTATION_DB===DB_NAME)';

/**
 * A canonical text for an expression: every parenthesis is dropped and each binary/unary/call/property
 * step is rebuilt from the tree, so line breaks, spacing and redundant parentheses do not change it,
 * while an operator, operand, argument or operand order does (`|| true`, a comma operator, `=== "x"`).
 */
function canonicalExpression(node: ts.Expression): string {
  if (ts.isParenthesizedExpression(node)) return canonicalExpression(node.expression);
  if (ts.isBinaryExpression(node)) {
    return `(${canonicalExpression(node.left)}${node.operatorToken.getText()}${canonicalExpression(node.right)})`;
  }
  if (ts.isPrefixUnaryExpression(node)) return `${ts.tokenToString(node.operator)}${canonicalExpression(node.operand)}`;
  if (ts.isCallExpression(node)) return `${canonicalExpression(node.expression)}(${node.arguments.map(canonicalExpression).join(',')})`;
  if (ts.isPropertyAccessExpression(node)) return `${canonicalExpression(node.expression)}.${node.name.text}`;
  return node.getText().replace(/\s+/g, '');
}

/**
 * NG-206 review tur 4 (B-2): the server-name pin above proves the name is read from the server, not that
 * the mutation gate uses it. This reads the gate from the AST: MUTATION_ALLOWED must be exactly the
 * expected expression (compared structurally, so formatting does not matter) and MUTATION_SKIP must be
 * `!MUTATION_ALLOWED`. Every test whose title contains "mutation" must be opened with `it.skipIf(MUTATION_SKIP)`
 * (B-2b, F-1): `it.skipIf(!MUTATION_SKIP)`, a plain `it(` / `it.only(` / `test(` would run it on a shared database.
 * Only top-level declarations count, and a name declared twice in the file fails (F-2): a shadowing block cannot
 * stand in for the declaration the gate really uses.
 * F-3: operand order (`DB_NAME !== undefined && …` vs. the reverse) and `process.env["RLS_MUTATION_DB"]` are
 * deliberately rejected: the comparison is an exact tree match, so a change there also needs EXPECTED_MUTATION_ALLOWED.
 * F-4, known limit: detection is by title word, so a mutation test whose title has no "mutation" is not seen.
 * Returns the problems found (empty when the gate is as required).
 */
export function mutationGateProblems(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declared = new Map<string, ts.Expression>();
  const declarationCount = new Map<string, number>();
  const testCalls: Array<{ arg: ts.Expression | undefined; title: string }> = [];
  const PLAIN_TEST_CALLEES = new Set(['it', 'it.only', 'it.skip', 'test', 'test.only', 'test.skip']);
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declarationCount.set(node.name.text, (declarationCount.get(node.name.text) ?? 0) + 1);
      // Top-level only: the parent chain is VariableDeclaration → VariableDeclarationList → VariableStatement → SourceFile.
      const topLevel = ts.isSourceFile(node.parent.parent.parent);
      if (topLevel && node.initializer) declared.set(node.name.text, node.initializer);
    }
    if (ts.isCallExpression(node)) {
      // `it.skipIf(cond)(title, fn)`: the outer call's callee is the inner `it.skipIf(cond)` call.
      if (ts.isCallExpression(node.expression) && ['it.skipIf', 'test.skipIf'].includes(node.expression.expression.getText())) {
        const cond = node.expression.arguments[0];
        const title = node.arguments[0];
        if (title && ts.isStringLiteralLike(title)) testCalls.push({ arg: cond, title: title.text });
      } else if (PLAIN_TEST_CALLEES.has(node.expression.getText())) {
        // Plain `it(title, fn)`: no condition, so it can never be `it.skipIf(MUTATION_SKIP)`.
        const title = node.arguments[0];
        if (title && ts.isStringLiteralLike(title)) testCalls.push({ arg: undefined, title: title.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);

  const allowed = declared.get('MUTATION_ALLOWED');
  if (!allowed) return ['MUTATION_ALLOWED is not declared with an initializer'];

  const problems: string[] = [];
  for (const name of ['MUTATION_ALLOWED', 'MUTATION_SKIP']) {
    const count = declarationCount.get(name) ?? 0;
    if (count > 1) problems.push(`${name} is declared ${count} times; only one top-level declaration is allowed`);
  }
  const expected = ts.createSourceFile('expected.ts', `x = ${EXPECTED_MUTATION_ALLOWED};`, ts.ScriptTarget.Latest, true);
  const expectedNode = ((expected.statements[0] as ts.ExpressionStatement).expression as ts.BinaryExpression).right;
  if (canonicalExpression(allowed) !== canonicalExpression(expectedNode)) {
    problems.push(`MUTATION_ALLOWED is not ${EXPECTED_MUTATION_ALLOWED}`);
  }

  const skip = declared.get('MUTATION_SKIP');
  const negatesAllowed =
    skip !== undefined && ts.isPrefixUnaryExpression(skip) && skip.operator === ts.SyntaxKind.ExclamationToken && ts.isIdentifier(skip.operand) && skip.operand.text === 'MUTATION_ALLOWED';
  if (!negatesAllowed) problems.push('MUTATION_SKIP is not !MUTATION_ALLOWED');

  const mutationTests = testCalls.filter((call) => call.title.toLowerCase().includes('mutation'));
  if (mutationTests.length < 2) problems.push(`fewer than 2 mutation tests found (found ${mutationTests.length})`);
  for (const call of mutationTests) {
    if (call.arg === undefined || canonicalExpression(call.arg) !== 'MUTATION_SKIP') {
      problems.push(`mutation test "${call.title}" is not it.skipIf(MUTATION_SKIP)`);
    }
  }
  return problems;
}

describe('the ExpertDirectoryEntry mutation gate, read from the AST (NG-206 review tur 4, B-2)', () => {
  const GATE_FILE = 'tests/rls-verify-system-scope-policy-set.live.test.ts';
  const source = readFileSync(path.join(ROOT, GATE_FILE), 'utf8');

  /** The source with one `const NAME = …;` declaration replaced by `const NAME = value;` (the initializer has no `;`). */
  function mutant(name: string, value: string): string {
    const pattern = new RegExp(`const ${name} = [^;]*;`);
    expect(pattern.test(source), `${name} declaration not found`).toBe(true);
    return source.replace(pattern, `const ${name} = ${value};`);
  }

  /** The source with every `it.skipIf(MUTATION_SKIP)` replaced by `it.skipIf(replacement)`. */
  function skipIfMutant(replacement: string): string {
    expect(source.includes('it.skipIf(MUTATION_SKIP)'), 'it.skipIf(MUTATION_SKIP) not found').toBe(true);
    return source.replaceAll('it.skipIf(MUTATION_SKIP)', `it.skipIf(${replacement})`);
  }

  it('MUTATION_ALLOWED is the expected expression; MUTATION_SKIP negates it; both mutation tests are skipIf(MUTATION_SKIP)', () => {
    expect(mutationGateProblems(GATE_FILE, source)).toEqual([]);
  });

  it('a reformatted gate (line breaks, redundant parentheses) still passes the pin (B-2a)', () => {
    const reformatted = mutant(
      'MUTATION_ALLOWED',
      '(\n    isGithubActions() ||\n    ((DB_NAME !== undefined) && !(SHARED_DB) && (process.env.RLS_MUTATION_DB === DB_NAME))\n  )',
    );
    expect(reformatted).not.toBe(source);
    expect(mutationGateProblems(GATE_FILE, reformatted)).toEqual([]);
  });

  it.each([
    ['MUTATION_ALLOWED = true', mutant('MUTATION_ALLOWED', 'true')],
    ['MUTATION_ALLOWED = isGithubActions()', mutant('MUTATION_ALLOWED', 'isGithubActions()')],
    ['MUTATION_ALLOWED ignores SHARED_DB', mutant('MUTATION_ALLOWED', 'isGithubActions() || (DB_NAME !== undefined && process.env.RLS_MUTATION_DB === DB_NAME)')],
    ['MUTATION_ALLOWED ignores RLS_MUTATION_DB', mutant('MUTATION_ALLOWED', 'isGithubActions() || (DB_NAME !== undefined && !SHARED_DB)')],
    ['MUTATION_SKIP = false', mutant('MUTATION_SKIP', 'false')],
    // NG-206 review tur 4 (B-2a): these passed the identifier-presence pin.
    ['MUTATION_ALLOWED with a trailing `|| true`', mutant('MUTATION_ALLOWED', 'isGithubActions() || (DB_NAME !== undefined && !SHARED_DB && process.env.RLS_MUTATION_DB === DB_NAME) || true')],
    ['MUTATION_ALLOWED with DB_NAME only named (comma operator)', mutant('MUTATION_ALLOWED', 'isGithubActions() || (DB_NAME, !SHARED_DB && process.env.RLS_MUTATION_DB === "x")')],
    ['MUTATION_ALLOWED comparing to a constant', mutant('MUTATION_ALLOWED', 'isGithubActions() || (DB_NAME !== undefined && !SHARED_DB && process.env.RLS_MUTATION_DB === "fabrika_dev")')],
    ['MUTATION_ALLOWED reading RLS_MUTATION_DBX', mutant('MUTATION_ALLOWED', 'isGithubActions() || (DB_NAME !== undefined && !SHARED_DB && process.env.RLS_MUTATION_DBX === DB_NAME)')],
    // NG-206 review tur 4 (B-2b): the skipIf direction was not pinned.
    ['mutation tests skipIf(!MUTATION_SKIP)', skipIfMutant('!MUTATION_SKIP')],
    ['mutation tests with no skipIf at all', source.replaceAll('it.skipIf(MUTATION_SKIP)', 'it')],
    // NG-206 review tur 5 (F-1, mutant 22): a third, plain `it(` whose title says "mutation" passed the count-only pin.
    ['an extra plain it() with a "mutation" title', `${source}\nit('extra (NG-188 mutation drop check)', async () => {});\n`],
    // NG-206 review tur 5 (F-2, mutant 24): a wrong top-level value, with the right one in a shadowing block.
    [
      'a wrong top-level MUTATION_ALLOWED shadowed by a correct block',
      `${mutant('MUTATION_ALLOWED', 'true')}\n{ const MUTATION_ALLOWED = ${EXPECTED_MUTATION_ALLOWED}; }\n`,
    ],
  ])('a mutant with %s fails the pin', (_label, mutated) => {
    expect(mutated).not.toBe(source);
    expect(mutationGateProblems(GATE_FILE, mutated)).not.toEqual([]);
  });
});
