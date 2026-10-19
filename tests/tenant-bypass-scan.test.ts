import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  closingParen,
  kindMatchesCheck,
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
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  execFileSync('git', ['add', '--', ...Object.keys(files)], { cwd: dir });
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
