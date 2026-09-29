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
 *   - a literal (string, number, template, boolean, null);
 *   - an array literal — Prisma rejects an `undefined` element outright
 *     ("Can not use `undefined` value within array"), it does not drop it;
 *   - a nested object literal whose own values follow these rules;
 *   - `requireId(x, label)` / `presentIds([...])` from tests/helpers/teardown-guard;
 *   - a `const` in the same file whose initializer follows these rules.
 *
 * Anything else — a `let`, a parameter, a loop variable, `ids.tenantA`,
 * `{ tenantId }` shorthand over one of those, a call — is reported with its line.
 * `delete` (singular) is not checked: it needs a unique `where` and Prisma
 * throws on `undefined` there.
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
