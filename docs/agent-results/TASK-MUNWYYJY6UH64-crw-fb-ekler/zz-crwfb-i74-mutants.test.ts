import { it } from 'vitest';
import { findingsFor } from './server-action-rbac-guard.test';

const file = 'app/[locale]/(app)/[workspace]/evidence/i74-mutant.ts';
const header = [
  "'use server';",
  "import { withTenant, prisma } from '@/lib/db';",
  "import { requireTenantAction } from '@/lib/tenant';",
  "import { can } from '@/lib/rbac';",
  "import { Prisma, Role as R, $Enums } from '@prisma/client';",
  '',
].join('\n');
const wipe = '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n';
const fn = (name: string, body: string, pre = '') => pre + `export async function ${name}(id: string) {\n${body}}\n`;
const ctl = "  const { tenantId, role } = await requireTenantAction();\n";
const ro = "  const { tenantId } = await requireTenantAction({ readOnly: true });\n";

// [id, class, source, overlay?]  — every one of these is a real hole (no role check before the write / readOnly writes)
const M: [string, string, string, Record<string, string>?][] = [
  // --- positive controls (must be KIRMIZI)
  ['C1', 'kontrol: readOnly doğrudan yazma', header + fn('c1', ro + wipe)],
  ['C2', "kontrol: export { wipe } from './impl' barrel", header.replace("import { can }", "import { wipeC2 } from '@/lib/i74/c2barrel';\nimport { can }") + fn('c2', ro + '  await wipeC2(id);\n'),
    { 'lib/i74/c2barrel': "export { wipe as wipeC2 } from './c2impl';\n", 'lib/i74/c2impl': "import { prisma } from '@/lib/db';\nexport async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['C3', 'kontrol: üst düzey fonksiyon kontrolden önce', header + "function wipeTop(t: string) { void withTenant(t, (tx) => tx.evidence.deleteMany({ where: { tenantId: t } })); }\n" + fn('c3', ctl + "  wipeTop(tenantId);\n  if (!can(role as never, 'edit_proposal')) return;\n")],
  ['C4', "kontrol: can('TENANT_OWNER', …) literal", header + fn('c4', "  const { tenantId } = await requireTenantAction();\n  if (!can('TENANT_OWNER', 'edit_proposal')) return;\n" + wipe)],
  ['C5', 'kontrol: Role.TENANT_OWNER', header.replace('Role as R', 'Role') + fn('c5', "  const { tenantId } = await requireTenantAction();\n  if (!can(Role.TENANT_OWNER, 'edit_proposal')) return;\n" + wipe)],
  ['C6', 'kontrol: $queryRaw`DELETE…` satır içi', header + fn('c6', ro + '  await withTenant(tenantId, (tx) => tx.$queryRaw`DELETE FROM "Evidence" WHERE id = ${id} RETURNING id`);\n')],
  ['C7', 'kontrol: iyi biçim (YEŞİL beklenir)', header + fn('c7', "  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });\n" + wipe)],
  // --- dynamic import
  ['D1', 'dinamik import (readOnly)', fn('d1', ro + "  const m = await import('@/lib/scoring/consortium');\n  await m.scoreCandidatesForSeat(id, tenantId as never);\n")],
  ['D2', 'dinamik import (kontrolden önce)', fn('d2', ctl + "  const { scoreCandidatesForSeat } = await import('@/lib/scoring/consortium');\n  await scoreCandidatesForSeat(id, tenantId as never);\n  if (!can(role as never, 'manage_workspaces')) return;\n")],
  // --- re-export chains
  ['R1', "barrel: import {w} + export {w} (yerel yeniden-ihraç)", header.replace("import { can }", "import { wipeR1 } from '@/lib/i74/r1barrel';\nimport { can }") + fn('r1', ro + '  await wipeR1(id);\n'),
    { 'lib/i74/r1barrel': "import { wipeR1 } from './r1impl';\nexport { wipeR1 };\n", 'lib/i74/r1impl': "import { prisma } from '@/lib/db';\nexport async function wipeR1(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['R2', 'barrel: export default <import edilen ad>', header.replace("import { can }", "import wipeR2 from '@/lib/i74/r2barrel';\nimport { can }") + fn('r2', ro + '  await wipeR2(id);\n'),
    { 'lib/i74/r2barrel': "import { wipe } from './r2impl';\nexport default wipe;\n", 'lib/i74/r2impl': "import { prisma } from '@/lib/db';\nexport async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['R3', 'barrel: export const x = importedFn (takma ad)', header.replace("import { can }", "import { wipeR3 } from '@/lib/i74/r3barrel';\nimport { can }") + fn('r3', ro + '  await wipeR3(id);\n'),
    { 'lib/i74/r3barrel': "import { wipe } from './r3impl';\nexport const wipeR3 = wipe;\n", 'lib/i74/r3impl': "import { prisma } from '@/lib/db';\nexport async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['R4', 'export * as ns from', header.replace("import { can }", "import { ns } from '@/lib/i74/r4barrel';\nimport { can }") + fn('r4', ro + '  await ns.wipe(id);\n'),
    { 'lib/i74/r4barrel': "export * as ns from './r4impl';\n", 'lib/i74/r4impl': "import { prisma } from '@/lib/db';\nexport async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['R5', 'namespace eleman erişimi ns["wipe"]', header.replace("import { can }", "import * as ns from '@/lib/i74/r5impl';\nimport { can }") + fn('r5', ro + "  await ns['wipe'](id);\n"),
    { 'lib/i74/r5impl': "import { prisma } from '@/lib/db';\nexport async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['R6', 'namespace destructure const {wipe}=ns', header.replace("import { can }", "import * as ns from '@/lib/i74/r6impl';\nimport { can }") + fn('r6', ro + '  const { wipe } = ns;\n  await wipe(id);\n'),
    { 'lib/i74/r6impl': "import { prisma } from '@/lib/db';\nexport async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['R7', 'başka modülde export const x = wrap(async …)', header.replace("import { can }", "import { wipeR7 } from '@/lib/i74/r7impl';\nimport { can }") + fn('r7', ro + '  await wipeR7(id);\n'),
    { 'lib/i74/r7impl': "import { prisma } from '@/lib/db';\nconst logged = <T,>(f: T) => f;\nexport const wipeR7 = logged(async (id: string) => { await prisma.evidence.delete({ where: { id } }); });\n" }],
  ['R8', 'başka modülde nesne: export const repo = { wipe() }', header.replace("import { can }", "import { repo } from '@/lib/i74/r8impl';\nimport { can }") + fn('r8', ro + '  await repo.wipe(id);\n'),
    { 'lib/i74/r8impl': "import { prisma } from '@/lib/db';\nexport const repo = { async wipe(id: string) { await prisma.evidence.delete({ where: { id } }); } };\n" }],
  // --- try/finally
  ['T1', 'try{check} finally{write}', header + fn('t1', "  const { tenantId } = await requireTenantAction();\n  try {\n    await requireTenantAction({ can: 'edit_proposal' });\n  } finally {\n" + wipe + '  }\n')],
  ['T2', 'yardımcı: try{check} finally{return}', header + "async function gate(role: string) {\n  try {\n    if (!can(role as never, 'edit_proposal')) throw new Error('no');\n  } finally {\n    return;\n  }\n}\n" + fn('t2', ctl + '  await gate(role);\n' + wipe)],
  ['T3', 'try{check} catch{ if(x) throw }', header + fn('t3', ctl + "  try {\n    await requireTenantAction({ can: 'edit_proposal' });\n  } catch (e) {\n    if (String(e).includes('PILOT')) throw e;\n  }\n" + wipe)],
  // --- inverted / tricky early returns
  ['E1', 'ters: if (can(..)) return', header + fn('e1', ctl + "  if (can(role as never, 'edit_proposal')) return;\n" + wipe)],
  ['E2', 'if (!can(..) && false) return', header + fn('e2', ctl + "  if (!can(role as never, 'edit_proposal') && false) return;\n" + wipe)],
  ['E3', 'if (!can(..)) {} else return', header + fn('e3', ctl + "  if (!can(role as never, 'edit_proposal')) {\n  } else return;\n" + wipe)],
  ['E4', 'hoisted iç fonksiyon kontrolden ÖNCE çağrılıyor', header + fn('e4', "  const { tenantId, role } = await requireTenantAction();\n  wipeInner();\n  if (!can(role as never, 'edit_proposal')) return;\n  function wipeInner() {\n    void withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { tenantId } }));\n  }\n")],
  ['E5', 'if (!can(..)) return → döngü içinde (for…of [])', header + fn('e5', ctl + "  for (const _ of []) {\n    if (!can(role as never, 'edit_proposal')) return;\n  }\n" + wipe)],
  // --- shadowing / role source
  ['S1', 'yerel gölgeleme: const can = () => true', header + fn('s1', ctl + "  const can = (_r: unknown, _a: string) => true;\n  if (!can(role, 'edit_proposal')) return;\n" + wipe)],
  ['S2', 'parametre gölgeleme: requireTenantAction', header + "export async function s2(id: string, requireTenantAction = async (_o?: unknown) => ({ tenantId: id })) {\n  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });\n" + wipe + '}\n'],
  ['S3', 'rol istemciden: can(input.role, …)', header + "export async function s3(id: string, input: { role: string }) {\n  const { tenantId } = await requireTenantAction();\n  if (!can(input.role as never, 'edit_proposal')) return;\n" + wipe + '}\n'],
  ['S4', "fonksiyon-içi sabit rol: const r = 'TENANT_OWNER'", header + fn('s4', "  const { tenantId } = await requireTenantAction();\n  const r = 'TENANT_OWNER';\n  if (!can(r, 'edit_proposal')) return;\n" + wipe)],
  ['S5', 'sabit rol: R.TENANT_OWNER (import { Role as R })', header + fn('s5', "  const { tenantId } = await requireTenantAction();\n  if (!can(R.TENANT_OWNER, 'edit_proposal')) return;\n" + wipe)],
  ['S6', 'sabit rol: $Enums.Role.TENANT_OWNER', header + fn('s6', "  const { tenantId } = await requireTenantAction();\n  if (!can($Enums.Role.TENANT_OWNER, 'edit_proposal')) return;\n" + wipe)],
  ['S7', 'sabit rol: template `TENANT_${"OWNER"}`', header + fn('s7', "  const { tenantId } = await requireTenantAction();\n  if (!can(`TENANT_${'OWNER'}` as never, 'edit_proposal')) return;\n" + wipe)],
  ['S8', "sabit rol: role ?? 'TENANT_OWNER' yerine ('TENANT_OWNER' || role)", header + fn('s8', ctl + "  if (!can(('TENANT_OWNER' || role) as never, 'edit_proposal')) return;\n" + wipe)],
  // --- hidden writes
  ['W1', 'yazma metodu takma adda: const del = tx.evidence.deleteMany', header + fn('w1', ro + '  await withTenant(tenantId, (tx) => { const del = tx.evidence.deleteMany; return del({ where: { id, tenantId } }); });\n')],
  ['W2', 'destructure: const { deleteMany } = tx.evidence', header + fn('w2', ro + '  await withTenant(tenantId, (tx) => { const { deleteMany } = tx.evidence; return deleteMany({ where: { id, tenantId } }); });\n')],
  ['W3', '.bind/.call: tx.evidence.deleteMany.call(tx.evidence, …)', header + fn('w3', ro + '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany.call(tx.evidence, { where: { id, tenantId } }));\n')],
  ['W4', "hesaplanmış metod: tx.evidence[m] (m='deleteMany')", header + fn('w4', ro + "  const m = 'deleteMany' as const;\n  await withTenant(tenantId, (tx) => tx.evidence[m]({ where: { id, tenantId } }));\n")],
  ['W5', '$queryRaw(değişkendeki SQL)', header + fn('w5', ro + '  const q = Prisma.sql`DELETE FROM "Evidence" WHERE id = ${id} RETURNING id`;\n  await withTenant(tenantId, (tx) => tx.$queryRaw(q));\n')],
  ['W6', 'aynı dosyada nesne yardımcı: const helpers = { wipe }', header + "const helpers = { wipe: (tx: any, id: string) => tx.evidence.deleteMany({ where: { id } }) };\n" + fn('w6', ro + '  await withTenant(tenantId, (tx) => helpers.wipe(tx, id));\n')],
  ['W7', 'aynı dosyada sınıf static metodu', header + "class Wiper { static run(tx: any, id: string) { return tx.evidence.deleteMany({ where: { id } }); } }\n" + fn('w7', ro + '  await withTenant(tenantId, (tx) => Wiper.run(tx, id));\n')],
  ['W8', 'model erişimcisi argümanla: wipeVia(tx.evidence)', header + "async function wipeVia(repo: { deleteMany: (a: unknown) => Promise<unknown> }, id: string) { await repo.deleteMany({ where: { id } }); }\n" + fn('w8', ro + '  await withTenant(tenantId, (tx) => wipeVia(tx.evidence, id));\n')],
  ['W9', 'yardımcı adı: tx.evidence.deleteMany via Reflect.apply', header + fn('w9', ro + '  await withTenant(tenantId, (tx) => Reflect.apply(tx.evidence.deleteMany, tx.evidence, [{ where: { id } }]));\n')],
];

// 7+ levels
const chain = (n: number) => {
  const o: Record<string, string> = {};
  for (let i = 1; i < n; i++) o[`lib/i74/c${i}`] = `import { c${i + 1} } from './c${i + 1}';\nexport async function c${i}(id: string) { await c${i + 1}(id); }\n`;
  o[`lib/i74/c${n}`] = `import { prisma } from '@/lib/db';\nexport async function c${n}(id: string) { await prisma.evidence.delete({ where: { id } }); }\n`;
  return o;
};
for (const n of [6, 7, 8, 12]) {
  M.push([`L${n}`, `${n} modül zinciri (readOnly)`, header.replace("import { can }", "import { c1 } from '@/lib/i74/c1';\nimport { can }") + fn(`l${n}`, ro + '  await c1(id);\n'), chain(n)]);
}

it('İNCELEME-74 mutants', () => {
  const rows: string[] = [];
  for (const [id, cls, src, overlay] of M) {
    const text = src.startsWith("'use server'") ? src : header + src;
    let res: string;
    try {
      const { findings } = findingsFor(file, text, overlay ?? {});
      res = findings.length ? `KIRMIZI  ${findings.map((f) => f.problem).join(' | ').slice(0, 150)}` : 'YEŞİL (kaçtı)';
    } catch (e) {
      res = `HATA ${String(e).slice(0, 120)}`;
    }
    rows.push(`${id.padEnd(4)} ${cls.padEnd(52)} → ${res}`);
  }
  require('fs').writeFileSync(process.env.OUT ?? '/dev/null', rows.join('\n') + '\n');
});
