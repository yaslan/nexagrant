import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  closingParen,
  gitEnvFor,
  HOOK_GIT_VARS,
  kindMatchesCheck,
  qualifyingBindAt,
  scan,
  tenantScopedRelations,
  type Finding,
  type ScanResult,
} from '../scripts/tenant-bypass-scan';
import { tenantScopedModels } from '../scripts/rls-models';

/**
 * CHECK E of `pnpm rls:bypass-check` (TASK-MVFMLDMCD9Q3K, FA-50; the two shapes
 * TASK-MTWOVYEKUDNZY measured under fabrika_app and CHECK A could not see).
 *
 * Fixture-driven on purpose: each case is a broken file that must produce a
 * finding and the fixed twin that must not, so the rule is pinned from both
 * sides. A rule that only has "broken → red" can be satisfied by flagging
 * everything; "fixed → green" is what makes it a rule and not an alarm.
 *
 * The scanner reads the git INDEX, so every fixture lives in a throwaway git
 * repository under tmpdir and is `git add`ed. The model and relation names are
 * the real ones — tenantScopedModels() reads prisma/schema.prisma from
 * process.cwd() (the repo root under vitest) and the relations come from the
 * generated client's DMMF — so the fixtures exercise the same inventory the
 * gate uses, not a stand-in.
 */

const repos: string[] = [];

function fixtureRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-bypass-e-'));
  repos.push(dir);
  // gitEnvFor: under a git hook GIT_DIR is set, and without this the fixture's
  // `git add` would land in the hook's repository index instead (FO-111).
  const env = gitEnvFor(process.env);
  execFileSync('git', ['init', '-q'], { cwd: dir, env });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  execFileSync('git', ['add', '--', ...Object.keys(files)], { cwd: dir, env });
  return dir;
}

afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scanOne(source: string, file = 'src/fixture.ts'): ScanResult {
  return scan(fixtureRepo({ [file]: source }));
}

function ofCheck(result: ScanResult, check: Finding['check']): Finding[] {
  return result.findings.filter((f) => f.check === check);
}

function ofFamilyE(result: ScanResult): Finding[] {
  return result.findings.filter((f) => f.check === 'E1' || f.check === 'E2');
}

const HEAD = `import { prisma, withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { bindTransactionToTenant } from '@/lib/legal/registration-consent';
`;

describe('CHECK E2 relation map comes from the DMMF, not from a guessed list', () => {
  const scoped = new Set(tenantScopedModels());
  const relations = tenantScopedRelations(scoped);

  test('Tenant -> users is Membership, Plan -> assignments is PlanAssignment', () => {
    expect(relations.get('tenant')?.relations.get('users')).toBe('Membership');
    expect(relations.get('tenant')?.relations.get('workspaces')).toBe('Workspace');
    expect(relations.get('tenant')?.relations.get('subscription')).toBe('Subscription');
    expect(relations.get('plan')?.relations.get('assignments')).toBe('PlanAssignment');
  });

  test('only models OUTSIDE the tenant-scoped set are roots, and every target is INSIDE it', () => {
    for (const [, note] of relations) {
      expect(scoped.has(note.model)).toBe(false);
      for (const target of note.relations.values()) expect(scoped.has(target)).toBe(true);
    }
  });

  test('a relation to a system-wide model is not in the map', () => {
    // Tenant.agency points at Tenant: joining it crosses no policy.
    expect(relations.get('tenant')?.relations.has('agency')).toBe(false);
  });

  test('a stale client (schema model the DMMF does not know) is an error, not an empty map', () => {
    expect(() => tenantScopedRelations(new Set([...scoped, 'ModelThatDoesNotExist']))).toThrow(
      /pnpm db:generate/
    );
  });
});

describe('CHECK E1 — tenant-scoped model on a bare prisma.$transaction', () => {
  const BROKEN = `${HEAD}
export async function broken(tenantId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({ data: { tenantId, name: 'x', slug: 'x' } });
    await tx.membership.create({
      data: { userId, tenantId, role: 'TENANT_OWNER', workspaceIds: [ws.id] },
    });
    return ws;
  });
}
`;

  test('broken: two tx.<tenant model> accesses inside the block → two E1 findings, keyed by accessor.op', () => {
    const r = scanOne(BROKEN);
    const e1 = ofCheck(r, 'E1');
    expect(e1.map((f) => f.subject).sort()).toEqual(['tx.membership.create', 'tx.workspace.create']);
    expect(e1.map((f) => f.line)).toEqual([7, 8]);
    expect(r.exemptions).toEqual([]);
    expect(ofCheck(r, 'A')).toEqual([]); // the accessor is tx., CHECK A is silent by design
  });

  test('fixed: the same block through withTenant → nothing', () => {
    const fixed = BROKEN.replace('prisma.$transaction(async (tx) => {', 'withTenant(tenantId, async (tx) => {');
    const r = scanOne(fixed);
    expect(r.findings).toEqual([]);
  });

  test('fixed: the same block through withSystemScope → nothing', () => {
    const fixed = BROKEN.replace(
      'prisma.$transaction(async (tx) => {',
      "withSystemScope('platform-admin', 'fixture', async (tx) => {"
    );
    const r = scanOne(fixed);
    expect(ofFamilyE(r)).toEqual([]);
    // The escape itself is CHECK D's, counted so it stays sanctioned — unchanged.
    expect(ofCheck(r, 'D').map((f) => f.subject)).toEqual(['system-scope:platform-admin']);
  });

  test('the callback parameter is read from the block, not assumed to be `tx`', () => {
    const renamed = BROKEN.replaceAll('tx', 'client');
    const e1 = ofCheck(scanOne(renamed), 'E1');
    expect(e1.map((f) => f.subject).sort()).toEqual(['client.membership.create', 'client.workspace.create']);
  });

  test('a block that spans a line window boundary is still one block', () => {
    const wrapped = `${HEAD}
export async function wrapped(tenantId: string) {
  return prisma.$transaction(
    async (
      tx
    ) => {
      ${'// filler\n      '.repeat(40)}
      return tx.workspace.findMany({ where: { tenantId } });
    }
  );
}
`;
    expect(ofCheck(scanOne(wrapped), 'E1').map((f) => f.subject)).toEqual(['tx.workspace.findMany']);
  });

  test('the array form has no callback: its prisma.<model> calls are CHECK A, not E1', () => {
    const arrayForm = `${HEAD}
export async function arr(tenantId: string) {
  return prisma.$transaction([
    prisma.workspace.findMany({ where: { tenantId } }),
  ]);
}
`;
    const r = scanOne(arrayForm);
    expect(ofCheck(r, 'E1')).toEqual([]);
    expect(ofCheck(r, 'A').map((f) => f.subject)).toEqual(['workspace.findMany']);
  });

  test('a $transaction quoted in a comment or string is not a block', () => {
    const quoted = `${HEAD}
// \`prisma.$transaction(async (tx) => tx.workspace.create(...))\` is the shape this fixes
const doc = 'prisma.$transaction(async (tx) => { tx.membership.create({}) })';
export const nothing = doc;
`;
    expect(scanOne(quoted).findings).toEqual([]);
  });
});

describe('CHECK E1 exemption — bindTransactionToTenant inside the block (K-570148 = A)', () => {
  const BOUND = `${HEAD}
export async function register(email: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email } });
    const tenant = await tx.tenant.create({ data: { name: 'x', slug: 'x', country: 'TR', orgType: 'SME' } });
    await bindTransactionToTenant(tx, tenant.id);
    const ws = await tx.workspace.create({ data: { tenantId: tenant.id, name: 'x', slug: 'x' } });
    await tx.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'TENANT_OWNER', workspaceIds: [ws.id] },
    });
    return user;
  });
}
`;

  test('bound block → 0 findings, 1 exemption naming the block, the bind line and the access count', () => {
    const r = scanOne(BOUND);
    expect(r.findings).toEqual([]);
    expect(r.exemptions).toEqual([
      { check: 'E1', file: 'src/fixture.ts', line: 6, boundAt: 9, accesses: 2 },
    ]);
  });

  test('mutation probe: the SAME block without the bind call → ≥1 E1 finding (the exemption is the bind, not the shape)', () => {
    const unbound = BOUND.replace('    await bindTransactionToTenant(tx, tenant.id);\n', '');
    const r = scanOne(unbound);
    expect(ofCheck(r, 'E1').map((f) => f.subject).sort()).toEqual([
      'tx.membership.create',
      'tx.workspace.create',
    ]);
    expect(r.exemptions).toEqual([]);
  });

  test('mutation probe: a bind that is only MENTIONED in a comment does not exempt', () => {
    const commented = BOUND.replace(
      '    await bindTransactionToTenant(tx, tenant.id);\n',
      '    // bindTransactionToTenant(tx, tenant.id) — forgotten\n'
    );
    expect(ofCheck(scanOne(commented), 'E1')).toHaveLength(2);
  });

  test('an access BEFORE the bind is still a finding: the transaction is bare until then', () => {
    const early = BOUND.replace(
      '    await bindTransactionToTenant(tx, tenant.id);\n    const ws = await tx.workspace.create({ data: { tenantId: tenant.id, name: \'x\', slug: \'x\' } });\n',
      '    const ws = await tx.workspace.create({ data: { tenantId: tenant.id, name: \'x\', slug: \'x\' } });\n    await bindTransactionToTenant(tx, tenant.id);\n'
    );
    const r = scanOne(early);
    expect(ofCheck(r, 'E1').map((f) => f.subject)).toEqual(['tx.workspace.create']);
    expect(r.exemptions).toEqual([{ check: 'E1', file: 'src/fixture.ts', line: 6, boundAt: 10, accesses: 1 }]);
  });

  test('the exemption never becomes a finding in a fixture file either, and is not reported for fixtures', () => {
    const r = scan(fixtureRepo({ 'src/fixture.test.ts': BOUND }));
    expect(r.findings).toEqual([]);
    expect(r.testFindings).toEqual([]);
    expect(r.exemptions).toEqual([]);
  });

  // PR #121 review (crw3-gnd, finding 2): the probes below exempted the block
  // although the bind did not bind THIS transaction, or did not run for sure.
  const BIND_LINE = '    await bindTransactionToTenant(tx, tenant.id);\n';
  const BOTH = ['tx.membership.create', 'tx.workspace.create'];

  test('probe P1: the bind is on another client (`bindTransactionToTenant(prisma, id)`) → not exempt', () => {
    const r = scanOne(BOUND.replace(BIND_LINE, '    await bindTransactionToTenant(prisma, tenant.id);\n'));
    expect(ofCheck(r, 'E1').map((f) => f.subject).sort()).toEqual(BOTH);
    expect(r.exemptions).toEqual([]);
  });

  test('probe P2a: the bind sits behind a braceless `if` → not exempt', () => {
    const r = scanOne(
      BOUND.replace(BIND_LINE, '    if (process.env.NEVER_SET) await bindTransactionToTenant(tx, tenant.id);\n')
    );
    expect(ofCheck(r, 'E1').map((f) => f.subject).sort()).toEqual(BOTH);
    expect(r.exemptions).toEqual([]);
  });

  test('probe P2b: the bind sits inside an `if { … }` block → not exempt', () => {
    const r = scanOne(
      BOUND.replace(BIND_LINE, '    if (process.env.NEVER_SET) {\n      await bindTransactionToTenant(tx, tenant.id);\n    }\n')
    );
    expect(ofCheck(r, 'E1').map((f) => f.subject).sort()).toEqual(BOTH);
    expect(r.exemptions).toEqual([]);
  });

  test('probe P2c: a braceless `if` with the bind on the NEXT line → not exempt', () => {
    const r = scanOne(
      BOUND.replace(BIND_LINE, '    if (process.env.NEVER_SET)\n      await bindTransactionToTenant(tx, tenant.id);\n')
    );
    expect(ofCheck(r, 'E1').map((f) => f.subject).sort()).toEqual(BOTH);
    expect(r.exemptions).toEqual([]);
  });

  test('probe P2d: the bind lives in a nested function that nothing is shown to call → not exempt', () => {
    const r = scanOne(
      BOUND.replace(BIND_LINE, '    const later = async () => { await bindTransactionToTenant(tx, tenant.id); };\n    void later;\n')
    );
    expect(ofCheck(r, 'E1').map((f) => f.subject).sort()).toEqual(BOTH);
    expect(r.exemptions).toEqual([]);
  });

  test('a bind written as an expression statement without `await` still counts (it is the same set_config)', () => {
    const r = scanOne(BOUND.replace(BIND_LINE, '    bindTransactionToTenant(tx, tenant.id);\n'));
    expect(r.findings).toEqual([]);
    expect(r.exemptions).toHaveLength(1);
  });

  test('a `try { … }` around the bind is a nested block too: judged bare (stated limit, safe direction)', () => {
    const r = scanOne(BOUND.replace(BIND_LINE, '    try { await bindTransactionToTenant(tx, tenant.id); } catch { throw new Error(); }\n'));
    expect(ofCheck(r, 'E1')).toHaveLength(2);
    expect(r.exemptions).toEqual([]);
  });

  test('the src/lib/auth.ts:836 shape — the block only delegates to a helper — is neither a finding nor an exemption', () => {
    const src = `${HEAD}
import { bootstrapOAuthTenant } from '@/lib/auth/oauth-registration';
export async function oauth(userId: string) {
  await prisma.$transaction((tx) =>
    bootstrapOAuthTenant(tx, { userId, agencyId: null })
  );
}
`;
    const r = scanOne(src);
    expect(r.findings).toEqual([]);
    expect(r.exemptions).toEqual([]);
  });

  describe('qualifyingBindAt', () => {
    const body = (stmt: string) => `async (tx) => {\n  const t = await tx.tenant.create({ data: { a: { b: 1 } } });\n  ${stmt}\n  await tx.workspace.create({});\n}`;
    test('a top-level statement after `;` qualifies, with or without await', () => {
      expect(qualifyingBindAt(body('await bindTransactionToTenant(tx, t.id);'), 'tx')).toBeGreaterThan(0);
      expect(qualifyingBindAt(body('bindTransactionToTenant(tx, t.id);'), 'tx')).toBeGreaterThan(0);
    });
    test('first statement of the body (after `{`) and a statement after `}` qualify', () => {
      expect(qualifyingBindAt('async (tx) => {\n  await bindTransactionToTenant(tx, id);\n}', 'tx')).toBeGreaterThan(0);
      expect(qualifyingBindAt('async (tx) => {\n  if (x) { y(); }\n  await bindTransactionToTenant(tx, id);\n}', 'tx')).toBeGreaterThan(0);
    });
    test('wrong receiver, wrong callback name, conditional, nested or returned → -1', () => {
      expect(qualifyingBindAt(body('await bindTransactionToTenant(prisma, t.id);'), 'tx')).toBe(-1);
      expect(qualifyingBindAt(body('await bindTransactionToTenant(tx, t.id);'), 'client')).toBe(-1);
      expect(qualifyingBindAt(body('if (x) await bindTransactionToTenant(tx, t.id);'), 'tx')).toBe(-1);
      expect(qualifyingBindAt(body('x && (await bindTransactionToTenant(tx, t.id));'), 'tx')).toBe(-1);
      expect(qualifyingBindAt(body('if (x) { await bindTransactionToTenant(tx, t.id); }'), 'tx')).toBe(-1);
      expect(qualifyingBindAt(body('return bindTransactionToTenant(tx, t.id);'), 'tx')).toBe(-1);
    });
    test('the first QUALIFYING bind wins, not the first bind', () => {
      const at = qualifyingBindAt(body('if (x) await bindTransactionToTenant(tx, t.id);\n  await bindTransactionToTenant(tx, t.id);'), 'tx');
      expect(at).toBeGreaterThan(0);
      expect(qualifyingBindAt(body('if (x) await bindTransactionToTenant(tx, t.id);'), 'tx')).toBe(-1);
    });
  });
});

describe('CHECK E1 on a receiver that falls back to the singleton (PR #121 review, crw3-gnd finding 3)', () => {
  const FALLBACK = `${HEAD}
import type { TenantTx } from '@/lib/db';
export async function bootstrap(tenantId: string, client?: TenantTx) {
  const db = client ?? prisma;
  return db.$transaction(async (tx) => {
    return tx.workspace.create({ data: { tenantId, name: 'x', slug: 'x' } });
  });
}
`;

  test('broken: `db.$transaction` on `const db = client ?? prisma` → E1, judged as the singleton it falls back to', () => {
    const r = scanOne(FALLBACK);
    expect(ofCheck(r, 'E1').map((f) => f.subject)).toEqual(['tx.workspace.create']);
    expect(ofCheck(r, 'E1')[0]?.line).toBe(9);
    expect(r.exemptions).toEqual([]);
  });

  test('fixed: the client is required (no `?? prisma`), so `db` is a scoped client → nothing', () => {
    const r = scanOne(FALLBACK.replace('client?: TenantTx', 'client: TenantTx').replace('const db = client ?? prisma;', 'const db = client;'));
    expect(r.findings).toEqual([]);
  });

  test('a bound block on the fallback receiver is exempt under the same rule', () => {
    const bound = FALLBACK.replace(
      '    return tx.workspace.create(',
      '    await bindTransactionToTenant(tx, tenantId);\n    return tx.workspace.create('
    );
    const r = scanOne(bound);
    expect(r.findings).toEqual([]);
    expect(r.exemptions).toEqual([{ check: 'E1', file: 'src/fixture.ts', line: 8, boundAt: 9, accesses: 1 }]);
  });

  test('a receiver whose name contains `$` is matched literally, not as a regex anchor', () => {
    const dollar = FALLBACK.replaceAll('db', '$db');
    expect(ofCheck(scanOne(dollar), 'E1').map((f) => f.subject)).toEqual(['tx.workspace.create']);
  });
});

describe('CHECK E2 — tenant-scoped relation through a model that is not tenant-scoped', () => {
  test('broken: the admin tenants shape, _count.select over users/workspaces → one E2 finding naming both', () => {
    const src = `${HEAD}
export async function tenants() {
  return prisma.tenant.findMany({
    include: { _count: { select: { users: true, workspaces: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
`;
    const e2 = ofCheck(scanOne(src), 'E2');
    expect(e2).toHaveLength(1);
    expect(e2[0]?.subject).toBe('tenant.findMany->users,workspaces');
    expect(e2[0]?.line).toBe(6);
  });

  test('fixed: the same read inside withSystemScope → nothing', () => {
    const src = `${HEAD}
export async function tenants() {
  return withSystemScope('platform-admin', 'fixture', (tx) =>
    tx.tenant.findMany({ include: { _count: { select: { users: true, workspaces: true } } } })
  );
}
`;
    const r = scanOne(src);
    expect(ofFamilyE(r)).toEqual([]);
    expect(ofCheck(r, 'D')).toHaveLength(1);
  });

  test('broken: the listPlansForAdmin shape — assignments is policed, versions is not', () => {
    const src = `${HEAD}
export async function plans() {
  return prisma.plan.findMany({
    include: {
      versions: { include: { features: true } },
      assignments: { include: { tenant: { select: { name: true } } } },
    },
  });
}
`;
    expect(ofCheck(scanOne(src), 'E2').map((f) => f.subject)).toEqual(['plan.findMany->assignments']);
  });

  test('a read of the root alone, no policed relation named → nothing', () => {
    const src = `${HEAD}
export async function locale(id: string) {
  return prisma.tenant.findUnique({ where: { id }, select: { locale: true, name: true } });
}
`;
    expect(scanOne(src).findings).toEqual([]);
  });

  test('a where-clause relation filter is a join too', () => {
    const src = `${HEAD}
export async function withMembers(userId: string) {
  return prisma.tenant.findMany({ where: { users: { some: { userId } } } });
}
`;
    expect(ofCheck(scanOne(src), 'E2').map((f) => f.subject)).toEqual(['tenant.findMany->users']);
  });

  test('a write is not judged by E2: it carries data, not a join', () => {
    const src = `${HEAD}
export async function create() {
  return prisma.tenant.create({ data: { name: 'x', slug: 'x', country: 'TR', orgType: 'SME', users: { create: [] } } });
}
`;
    expect(ofCheck(scanOne(src), 'E2')).toEqual([]);
  });

  test('broken: the getEntitlements shape — a receiver that falls back to the singleton is judged as the singleton', () => {
    const src = `${HEAD}
import type { TenantTx } from '@/lib/db';
export async function entitlements(tenantId: string, client?: TenantTx) {
  const db = client ?? prisma;
  return db.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: { include: { addOns: true } } },
  });
}
`;
    const e2 = ofCheck(scanOne(src), 'E2');
    expect(e2.map((f) => f.subject)).toEqual(['tenant.findUnique->subscription']);
    expect(e2[0]?.line).toBe(8);
  });

  test('fixed: the client is required, so there is no fallback and no singleton → nothing', () => {
    const src = `${HEAD}
import type { TenantTx } from '@/lib/db';
export async function entitlements(tenantId: string, client: TenantTx) {
  return client.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: { include: { addOns: true } } },
  });
}
`;
    expect(scanOne(src).findings).toEqual([]);
  });

  test('inside a bare $transaction the callback non-scoped read is judged too; after a bind it is not', () => {
    const bare = `${HEAD}
export async function sub(tenantId: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
    return t;
  });
}
`;
    expect(ofCheck(scanOne(bare), 'E2').map((f) => f.subject)).toEqual(['tenant.findUnique->subscription']);

    const bound = bare.replace(
      '    const t = await tx.tenant.findUnique(',
      '    await bindTransactionToTenant(tx, tenantId);\n    const t = await tx.tenant.findUnique('
    );
    expect(scanOne(bound).findings).toEqual([]);
  });

  test('findings in a fixture file are reported, not judged', () => {
    const src = `${HEAD}
export const t = prisma.tenant.findMany({ include: { users: true } });
`;
    const r = scan(fixtureRepo({ 'src/x/__tests__/fixture.ts': src }));
    expect(r.findings).toEqual([]);
    expect(r.testFindings.map((f) => f.subject)).toEqual(['tenant.findMany->users']);
  });
});

describe('the baseline kind must agree with the check (E family included)', () => {
  test('only CHECK D records as system-scope', () => {
    expect(kindMatchesCheck('D', 'system-scope')).toBe(true);
    expect(kindMatchesCheck('D', 'allowed')).toBe(false);
    for (const check of ['A', 'B1', 'B2', 'C', 'E1', 'E2'] as const) {
      expect(kindMatchesCheck(check, 'system-scope')).toBe(false);
      expect(kindMatchesCheck(check, 'allowed')).toBe(true);
      expect(kindMatchesCheck(check, 'debt')).toBe(true);
    }
  });
});

describe('closingParen', () => {
  test('balances nested parentheses and reports an unbalanced span as -1', () => {
    const code = 'f(a, g(b, (c)), d)';
    expect(closingParen(code, 1)).toBe(code.length - 1);
    expect(closingParen('f(a, g(b', 1)).toBe(-1);
  });
});

describe('scan(cwd) reads cwd even when a git hook exported GIT_DIR (FO-111)', () => {
  // `git push` runs pre-push with GIT_DIR set and `pnpm gate` inherits it. Git
  // then ignores cwd: scan(fixture) listed the hook repository's index and read
  // its paths under the fixture dir (ENOENT), and the fixture's `git add`
  // wrote into that index. A decoy repository stands in for the hook's.
  test('the fixture is scanned and the decoy index is left alone', () => {
    const decoy = fixtureRepo({ 'src/decoy-only.ts': 'export const d = 1;\n' });
    const saved = Object.fromEntries(HOOK_GIT_VARS.map((k) => [k, process.env[k]]));
    process.env.GIT_DIR = join(decoy, '.git');
    process.env.GIT_INDEX_FILE = join(decoy, '.git', 'index');
    try {
      const r = scanOne(`${HEAD}
export const t = prisma.tenant.findMany({ include: { users: true } });
`);
      expect(r.filesScanned).toBe(1);
      expect(ofFamilyE(r).map((f) => f.file)).toEqual(['src/fixture.ts']);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    const decoyIndex = execFileSync('git', ['ls-files'], {
      cwd: decoy,
      env: gitEnvFor(process.env),
      encoding: 'utf8',
    });
    expect(decoyIndex.trim().split('\n')).toEqual(['src/decoy-only.ts']);
  });

  // FO-114: pushed from a LINKED worktree, the hook's GIT_DIR is
  // <repo>/.git/worktrees/<name>. A `git init` that inherits it guesses "bare"
  // from that path and writes core.bare=true into the SHARED .git/config, which
  // breaks the main checkout ("must be run in a work tree"). The decoy above is
  // main-checkout shaped, where git guesses non-bare, so it cannot catch this.
  test('a worktree GIT_DIR does not turn the decoy into a bare repository', () => {
    const decoy = fixtureRepo({ 'src/decoy-only.ts': 'export const d = 1;\n' });
    const clean = gitEnvFor(process.env);
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'decoy'], {
      cwd: decoy,
      env: clean,
    });
    const wt = join(mkdtempSync(join(tmpdir(), 'tenant-bypass-wt-')), 'wt');
    repos.push(join(wt, '..'));
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'wt', wt], { cwd: decoy, env: clean });

    const saved = Object.fromEntries(HOOK_GIT_VARS.map((k) => [k, process.env[k]]));
    process.env.GIT_DIR = join(decoy, '.git', 'worktrees', 'wt');
    process.env.GIT_INDEX_FILE = join(decoy, '.git', 'worktrees', 'wt', 'index');
    try {
      fixtureRepo({ 'src/fixture.ts': 'export const x = 1;\n' });
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    const bare = execFileSync('git', ['config', '--get', 'core.bare'], {
      cwd: decoy,
      env: clean,
      encoding: 'utf8',
    });
    expect(bare.trim()).toBe('false');
  });
});
