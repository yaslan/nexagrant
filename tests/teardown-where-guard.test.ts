import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { requireId, presentIds } from './helpers/teardown-guard';
import { testFiles, unguardedWheres } from './helpers/where-guard-scan';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * TASK-MUMSUA77J1C6Q — no test hands Prisma a `where` that can go filterless.
 *
 * Prisma drops a `where` key whose value is `undefined`. A teardown that runs
 * `tenant.deleteMany({ where: { id: tenantId } })` after a setup that threw
 * before assigning `tenantId` deletes every tenant — which is how the shared dev
 * DB lost all of them on 29.09 (TASK-MUMO37MNYHV42 B-4; reproduced on an
 * isolated database in docs/agent-results/TASK-MUMSUA77J1C6Q-be-fb.md).
 *
 * So in every `deleteMany` / `updateMany` call under tests/ and in src/ test
 * files, each value in the `where` object must be something that cannot be
 * `undefined` at run time:
 *
 *   - a literal (string, number, template, boolean, null) or `new X()`;
 *   - an array literal of scalars (`in: [a?.id]`) — Prisma rejects an
 *     `undefined` element outright ("Can not use `undefined` value within
 *     array"), it does not drop it;
 *   - but under `AND` / `OR` / `NOT` each element is a `where` of its own and
 *     must follow these rules: `AND: [{ id: x }]` with `x` undefined is
 *     `AND: [{}]`, every row (İNCELEME-27 B-2). `AND: []` is refused too;
 *   - `notIn` only over a non-empty literal: `notIn: []` excludes nothing, so
 *     `notIn: presentIds([x])` with `x` undefined deletes every row (B-2);
 *   - a nested object literal whose own values follow these rules;
 *   - `requireId(x, label)` / `presentIds([...])` (the latter only under `in`)
 *     from tests/helpers/teardown-guard, `requireActionId` from src/lib/required-id;
 *   - a name checked earlier in an enclosing block by `if (!isPresentId(x))
 *     return|throw` or `requireId(x, …);` / `assertTenantScope(x, …);`;
 *   - inside `withTenant(t, cb)`, the same `t` (withTenant asserts it first);
 *   - a field destructured from `requireTenantAction()` / `requireTenantApi()`
 *     / `sessionScope()` — the session, not the client;
 *   - a `const` in the same scope whose initializer follows these rules, unless
 *     a parameter of an enclosing function has the same name, or the const
 *     object has a field written after its declaration (`ids.x = …`).
 *
 * Anything else — a `let`, a parameter, a loop variable, `ids.tenantA`,
 * `{ tenantId }` shorthand over one of those, a call — is reported with its line.
 * So are `deleteMany` / `updateMany` nested in a write's `data`, `x['deleteMany']`,
 * a destructured `{ deleteMany }` and a raw DELETE / UPDATE / TRUNCATE with no
 * WHERE (İNCELEME-27 Ö-1). `delete` (singular) is not checked: it needs a unique
 * `where` and Prisma throws on `undefined` there.
 */

describe('test teardowns cannot run a filterless deleteMany/updateMany', () => {
  it('the scanner flags the B-4 shape and passes the guarded ones', () => {
    const bad = `
      let tenantId: string;
      const ids = makeIds();
      afterEach(async () => {
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
        await prisma.auditEvent.deleteMany({ where: { tenantId } });
        await db.x.deleteMany({ where: { tenantId: ids.tenantA } });
        await db.x.deleteMany({ where: { tenantId: { in: tenants } } });
        for (const t of ['a']) await db.x.deleteMany({ where: { tenantId: t } });
        await db.x.deleteMany();
      });`;
    expect(unguardedWheres(bad, 'bad.test.ts')).toHaveLength(6);

    const good = `
      const TENANT = 'fixed';
      const RUN = \`run-\${Date.now()}\`;
      const TENANTS = ['a', 'b'];
      const where = { tenantId: { in: TENANTS } };
      let tenantId: string;
      afterEach(async () => {
        await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
        await prisma.tenant.deleteMany({ where: { id: TENANT } });
        await prisma.tenant.deleteMany({ where: { slug: { startsWith: RUN } } });
        await prisma.tenant.deleteMany({ where: { id: { in: [a?.id, b?.id] } } });
        await prisma.tenant.deleteMany({ where: { id: { in: presentIds(list) } } });
        await prisma.savedSearch.deleteMany({ where });
      });`;
    expect(unguardedWheres(good, 'good.test.ts')).toEqual([]);
  });

  it('flags the İNCELEME-27 B-2 shapes: an array of wheres and notIn over a list that can be empty', () => {
    // Each of these deleted every row of the table on an isolated DB (TASK-MUN26P5IDKGST §1).
    const bad = `
      let tenantId: string;
      afterEach(async () => {
        await prisma.tenant.deleteMany({ where: { AND: [{ id: tenantId }] } });
        await prisma.tenant.deleteMany({ where: { OR: [{ id: 'fixed' }, { slug: tenantId }] } });
        await prisma.tenant.deleteMany({ where: { AND: [] } });
        await prisma.tenant.deleteMany({ where: { NOT: [{ id: tenantId }] } });
        await prisma.tenant.deleteMany({ where: { id: { notIn: presentIds([tenantId]) } } });
        await prisma.tenant.deleteMany({ where: { id: { notIn: [] } } });
        await prisma.tenant.deleteMany({ where: { id: { notIn: [...kept] } } });
      });`;
    expect(unguardedWheres(bad, 'b2.test.ts')).toHaveLength(7);

    const good = `
      const KEEP = { id: 'keep' };
      let tenantId: string;
      afterEach(async () => {
        await prisma.tenant.deleteMany({ where: { AND: [{ id: requireId(tenantId, 't') }, { slug: 'x' }] } });
        await prisma.tenant.deleteMany({ where: { OR: [{ id: 'a' }, KEEP] } });
        await prisma.tenant.deleteMany({ where: { id: { notIn: ['a', tenantId] } } });
        await prisma.tenant.deleteMany({ where: { id: { in: presentIds([tenantId]) } } });
      });`;
    expect(unguardedWheres(good, 'b2-good.test.ts')).toEqual([]);
  });

  it('flags the İNCELEME-27 Ö-1 escapes', () => {
    const cases: Record<string, string> = {
      nestedDeleteMany: `async function f(tx, parent, x) {
        await tx.opportunity.update({ where: { id: parent }, data: { seats: { deleteMany: { roleKey: x } } } });
      }`,
      nestedUpdateMany: `async function f(tx, parent, x) {
        await tx.opportunity.update({ where: { id: 'p' }, data: { seats: { updateMany: { where: { roleKey: x }, data: {} } } } });
      }`,
      shadowedConst: `const tenantId = 'fixed';
        async function cleanup(tenantId?: string) { await prisma.tenant.deleteMany({ where: { id: tenantId } }); }`,
      elementAccess: `let id: string; await prisma.tenant['deleteMany']({ where: { id } });`,
      destructured: `const { deleteMany } = prisma.tenant;`,
      mutatedConst: `const ctx = { id: 'p' }; ctx.id = maybe(); await prisma.tenant.deleteMany({ where: { id: ctx.id } });`,
      rawUnsafe: `await prisma.$executeRawUnsafe('DELETE FROM "Tenant"');`,
      rawTagged: 'await prisma.$executeRaw`UPDATE "Tenant" SET "name" = ${n}`;',
      guardInOtherBranch: `async function f(id?: string) {
        if (flag) { if (!isPresentId(id)) return; }
        await prisma.tenant.deleteMany({ where: { id } });
      }`,
      guardedThenReassigned: `async function f(id?: string) {
        if (!isPresentId(id)) return;
        id = undefined;
        await prisma.tenant.deleteMany({ where: { id } });
      }`,
      otherWrapperArg: `async function f(a: string, b?: string) {
        await withTenant(a, (tx) => tx.x.deleteMany({ where: { tenantId: b } }));
      }`,
    };
    for (const [name, src] of Object.entries(cases)) {
      expect(unguardedWheres(src, `${name}.test.ts`), name).not.toEqual([]);
    }
  });

  it('passes the shapes production code uses to prove an id is there', () => {
    const src = `
      export async function signDocument(docId: string) {
        const { tenantId } = await requireTenantAction();
        if (!isPresentId(docId)) return { success: false };
        await withTenant(tenantId, (tx) => tx.followupDoc.updateMany({ where: { id: docId, tenantId }, data: {} }));
      }
      export async function move({ opportunityId }: { opportunityId: string }) {
        const scope = await sessionScope();
        if (!scope) return null;
        const { tenantId } = scope;
        if (!isPresentId(opportunityId) || x) return null;
        await withTenant(tenantId, (tx) => tx.opportunity.updateMany({ where: { id: opportunityId, tenantId } }));
      }
      export async function PATCH() {
        const scope = await requireTenantApi({ write: true });
        const { tenantId, userId } = scope.scope;
        const id = requireActionId(raw, 'id');
        await prisma.savedSearch.deleteMany({ where: { id, tenantId, userId } });
      }
      async function helper(tx: TenantTx, tenantId: string, seatId: string) {
        assertTenantScope(tenantId, 'helper');
        if (!isPresentId(seatId)) throw new Error('no');
        await tx.seatCandidate.deleteMany({ where: { tenantId, seatId } });
      }
      async function persist(tx, c: { id: string; tenantId: string }) {
        if (c.score === null || !isPresentId(c.id) || !isPresentId(c.tenantId)) return false;
        await tx.opportunity.updateMany({ where: { id: c.id, tenantId: c.tenantId } });
      }
      async function prune() {
        const cutoff = new Date();
        await prisma.log.deleteMany({ where: { at: { lt: cutoff } } });
        await tx.plan.update({ where: { id: 'p' }, data: { versions: { deleteMany: {} } } });
      }`;
    expect(unguardedWheres(src, 'src/prod.ts')).toEqual([]);
  });

  it('requireId throws on a missing id and presentIds drops them', () => {
    expect(() => requireId(undefined, 'tenantId')).toThrow(/tenantId is undefined/);
    expect(() => requireId(null, 'tenantId')).toThrow(/tenantId is null/);
    expect(() => requireId('', 'tenantId')).toThrow(/tenantId is empty/);
    expect(requireId('t1', 'tenantId')).toBe('t1');
    expect(presentIds(['a', undefined, null, '', 'b'])).toEqual(['a', 'b']);
  });

  it('no test file in the repo has an unguarded where', () => {
    const files = [...testFiles(path.join(REPO_ROOT, 'tests'), true), ...testFiles(path.join(REPO_ROOT, 'src'), false)];
    expect(files.length).toBeGreaterThan(100);
    const found = files.flatMap((f) => unguardedWheres(fs.readFileSync(f, 'utf8'), f));
    expect(found).toEqual([]);
  }, 60_000);
});
