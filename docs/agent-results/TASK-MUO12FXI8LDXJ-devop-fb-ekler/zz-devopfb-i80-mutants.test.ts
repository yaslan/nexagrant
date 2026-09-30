import fs from 'fs';
import { it } from 'vitest';
import { findingsFor } from './server-action-rbac-guard.test';

// İNCELEME-80 (devop-fb) — yeni mutant sınıfları. Beklenen: M = KIRMIZI olmalı (gerçek açık),
// F = YEŞİL olmalı (meşru biçim, FP olmamalı). Sonuç satırı: beklenen / gerçekleşen.
const file = 'app/[locale]/(app)/[workspace]/evidence/i80-mutant.ts';
const header = [
  "'use server';",
  "import { withTenant, prisma } from '@/lib/db';",
  "import { requireTenantAction } from '@/lib/tenant';",
  "import { can } from '@/lib/rbac';",
  '',
].join('\n');
const fn = (name: string, body: string, sig = '(id: string, flag = false)') => `export async function ${name}${sig} {\n${body}}\n`;
const ro = '  const { tenantId } = await requireTenantAction({ readOnly: true });\n';
const ctl = '  const { tenantId, role } = await requireTenantAction();\n';
const impl = (name = 'wipe') =>
  `import { prisma } from '@/lib/db';\nexport async function ${name}(id: string) { await prisma.evidence.delete({ where: { id } }); }\n`;
const reader = "import { prisma } from '@/lib/db';\nexport async function read(id: string) { return prisma.evidence.findUnique({ where: { id } }); }\n";
const imp = (line: string) => header.replace("import { can }", `${line}\nimport { can }`);

type Row = [id: string, expect: 'M' | 'F', cls: string, src: string, overlay?: Record<string, string>];
const M: Row[] = [
  // --- kontrol
  ['K1', 'M', 'kontrol: readOnly doğrudan yazma', header + fn('k1', ro + '  await prisma.evidence.delete({ where: { id } });\n')],
  ['K2', 'F', 'kontrol: iyi biçim', header + fn('k2', "  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });\n  await prisma.evidence.delete({ where: { id } });\n")],
  // --- barrel / export … from
  ['B1', 'M', "export { default as w } from './impl' (anonim default fn)", imp("import { wB1 } from '@/lib/i80/b1barrel';") + fn('b1', ro + '  await wB1(id);\n'),
    { 'lib/i80/b1barrel': "export { default as wB1 } from './b1impl';\n", 'lib/i80/b1impl': "import { prisma } from '@/lib/db';\nexport default async function (id: string) { await prisma.evidence.delete({ where: { id } }); }\n" }],
  ['B2', 'M', 'iki export * barrel, ad ikincide', imp("import { wipe } from '@/lib/i80/b2barrel';") + fn('b2', ro + '  await wipe(id);\n'),
    { 'lib/i80/b2barrel': "export * from './b2a';\nexport * from './b2b';\n", 'lib/i80/b2a': reader, 'lib/i80/b2b': impl() }],
  ['B3', 'M', 'iç içe export * (3 kat)', imp("import { wipe } from '@/lib/i80/b3top';") + fn('b3', ro + '  await wipe(id);\n'),
    { 'lib/i80/b3top': "export * from './b3mid';\n", 'lib/i80/b3mid': "export * from './b3impl';\n", 'lib/i80/b3impl': impl() }],
  ['B4', 'M', "export { wipe as default } from + import w from", imp("import w from '@/lib/i80/b4barrel';") + fn('b4', ro + '  await w(id);\n'),
    { 'lib/i80/b4barrel': "export { wipe as default } from './b4impl';\n", 'lib/i80/b4impl': impl() }],
  ['B5', 'M', 'import * as ns + barrel export * → ns.wipe()', imp("import * as ns from '@/lib/i80/b5barrel';") + fn('b5', ro + '  await ns.wipe(id);\n'),
    { 'lib/i80/b5barrel': "export * from './b5impl';\n", 'lib/i80/b5impl': impl() }],
  ['B6', 'M', "barrel alias yolu: export { wipe } from '@/lib/…'", imp("import { wipe } from '@/lib/i80/b6barrel';") + fn('b6', ro + '  await wipe(id);\n'),
    { 'lib/i80/b6barrel': "export { wipe } from '@/lib/i80/b6impl';\n", 'lib/i80/b6impl': impl() }],
  ['B7', 'M', 'barrel export type {…} + değer export', imp("import { wipe } from '@/lib/i80/b7barrel';") + fn('b7', ro + '  await wipe(id);\n'),
    { 'lib/i80/b7barrel': "export type { Row } from './b7impl';\nexport { type Row as R2, wipe } from './b7impl';\n", 'lib/i80/b7impl': impl() + 'export interface Row { id: string }\n' }],
  ['B8', 'M', 'export * ile gelen ad namespace içinde: import {ns}; ns.wipe', imp("import { ns } from '@/lib/i80/b8barrel';") + fn('b8', ro + '  await ns.wipe(id);\n'),
    { 'lib/i80/b8barrel': "export * from './b8mid';\n", 'lib/i80/b8mid': "export * as ns from './b8impl';\n", 'lib/i80/b8impl': impl() }],
  ['B9', 'M', 'döngüsel barrel (a→b→a), ad yok → fail-closed', imp("import { wipe } from '@/lib/i80/b9a';") + fn('b9', ro + '  await wipe(id);\n'),
    { 'lib/i80/b9a': "export * from './b9b';\nimport { prisma } from '@/lib/db';\nexport async function other(id: string) { await prisma.evidence.delete({ where: { id } }); }\n", 'lib/i80/b9b': "export * from './b9a';\n" }],
  // --- koşullu / dolaylı dinamik import
  ['C1', 'M', 'koşullu: const m = flag ? await import(a) : await import(b)', header + fn('c1', ro + "  const m = flag ? await import('@/lib/i80/c1a') : await import('@/lib/i80/c1b');\n  await m.wipe(id);\n"),
    { 'lib/i80/c1a': impl(), 'lib/i80/c1b': impl() }],
  ['C2', 'M', 'import(…).then((m) => m.wipe(id))', header + fn('c2', ro + "  await import('@/lib/i80/c2impl').then((m) => m.wipe(id));\n"), { 'lib/i80/c2impl': impl() }],
  ['C3', 'M', 'let m = await import(…); m.wipe()', header + fn('c3', ro + "  let m = await import('@/lib/i80/c3impl');\n  await m.wipe(id);\n"), { 'lib/i80/c3impl': impl() }],
  ['C4', 'M', 'const { wipe } = await (flag ? import(a) : import(b))', header + fn('c4', ro + "  const { wipe } = await (flag ? import('@/lib/i80/c4a') : import('@/lib/i80/c4b'));\n  await wipe(id);\n"),
    { 'lib/i80/c4a': impl(), 'lib/i80/c4b': impl() }],
  ['C5', 'M', 'üst düzey const lazy = import(…); (await lazy).wipe()', header + "const lazy = import('@/lib/i80/c5impl');\n" + fn('c5', ro + '  await (await lazy).wipe(id);\n'), { 'lib/i80/c5impl': impl() }],
  ['C6', 'M', 'Promise.all([import(a)]) → [m]', header + fn('c6', ro + "  const [m] = await Promise.all([import('@/lib/i80/c6impl')]);\n  await m.wipe(id);\n"), { 'lib/i80/c6impl': impl() }],
  ['C7', 'M', 'const m = await import(…) as any; m.wipe()', header + fn('c7', ro + "  const m = (await import('@/lib/i80/c7impl')) as any;\n  await m.wipe(id);\n"), { 'lib/i80/c7impl': impl() }],
  ['C8', 'M', 'koşullu statik: flag ? a.wipe : b.wipe (import {..})', imp("import { wipe as wa } from '@/lib/i80/c8a';\nimport { wipe as wb } from '@/lib/i80/c8b';") + fn('c8', ro + '  await (flag ? wa : wb)(id);\n'),
    { 'lib/i80/c8a': reader.replace('read', 'wipe'), 'lib/i80/c8b': impl() }],
  // --- tip-only (FP olmamalı) ve tip/değer karışık
  ['T1', 'F', 'import type {X} from yazan modül (readOnly)', imp("import type { Row } from '@/lib/i80/t1impl';") + fn('t1', ro + '  const r: Row | null = null;\n  return r;\n'), { 'lib/i80/t1impl': impl() + 'export interface Row { id: string }\n' }],
  ['T2', 'F', 'import { type Row, read } (readOnly okuma)', imp("import { type Row, read } from '@/lib/i80/t2impl';") + fn('t2', ro + '  const r = (await read(id)) as Row | null;\n  return r;\n'),
    { 'lib/i80/t2impl': reader + impl() + 'export interface Row { id: string }\n' }],
  ['T3', 'F', 'import { Row } (tip, type-siz import) yalnız tip konumunda', imp("import { Row, read } from '@/lib/i80/t3impl';") + fn('t3', ro + '  const r: Row | null = await read(id);\n  return r satisfies Row | null;\n'),
    { 'lib/i80/t3impl': reader + impl() + 'export interface Row { id: string }\n' }],
  ['T4', 'F', 'class implements ImportedInterface (heritage)', imp("import { Repo } from '@/lib/i80/t4impl';") + 'class R implements Repo { id = 1 }\n' + fn('t4', ro + '  return new R().id;\n'),
    { 'lib/i80/t4impl': impl() + 'export interface Repo { id: number }\n' }],
  ['T5', 'F', 'enum değer import (readOnly)', imp("import { Kind } from '@/lib/i80/t5impl';") + fn('t5', ro + '  return Kind.A;\n'), { 'lib/i80/t5impl': impl() + 'export enum Kind { A = 1 }\n' }],
  ['T6', 'F', 'typeof import: type M = typeof import(…)', header + "type Mod = typeof import('@/lib/i80/t6impl');\n" + fn('t6', ro + '  const x: Mod | null = null;\n  return x;\n'), { 'lib/i80/t6impl': impl() }],
  // --- JSON import (FP olmamalı)
  ['J1', 'F', "import data from '@/contracts/…json'", imp("import data from '@/contracts/artifacts/DualApproval.json';") + fn('j1', ro + '  return Object.keys(data).length;\n')],
  ['J2', 'F', "import … with { type: 'json' }", imp("import data from '@/locales/en/settings.json' with { type: 'json' };") + fn('j2', ro + '  return Object.keys(data).length;\n')],
  ['J3', 'F', "await import('@/locales/en/settings.json')", header + fn('j3', ro + "  const m = await import('@/locales/en/settings.json');\n  return Object.keys(m.default).length;\n")],
  // --- yol / alias varyantları (overlay'siz, gerçek ağaç)
  ['P1', 'M', "alias içinde '..': '@/lib/../lib/i80/p1impl'", imp("import { wipe } from '@/lib/../lib/i80/p1impl';") + fn('p1', ro + '  await wipe(id);\n'), { 'lib/i80/p1impl': impl() }],
  ['P2', 'M', "uzantılı: '@/lib/i80/p2impl.js'", imp("import { wipe } from '@/lib/i80/p2impl.js';") + fn('p2', ro + '  await wipe(id);\n'), { 'lib/i80/p2impl': impl() }],
  ['P3', 'M', "açık index: '@/lib/i80/p3dir/index'", imp("import { wipe } from '@/lib/i80/p3dir/index';") + fn('p3', ro + '  await wipe(id);\n'), { 'lib/i80/p3dir/index': impl() }],
  ['P4', 'M', "göreli '../..' ile src içi", imp("import { wipe } from '../../../../lib/i80/p4impl';") + fn('p4', ro + '  await wipe(id);\n'), { 'lib/i80/p4impl': impl() }],
  ['P5', 'F', "gerçek: can '@/lib/rbac' + '@/lib/./rbac' değil → iyi biçim", header + fn('p5', ctl + "  if (!can(role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n")],
  ['P6', 'F', "can '@/lib/./rbac' (normalize edilmemiş, meşru TS)", header.replace("'@/lib/rbac'", "'@/lib/./rbac'") + fn('p6', ctl + "  if (!can(role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n")],
  ['P7', 'F', "db '@/lib/../lib/db' + iyi biçim", header.replace("'@/lib/db'", "'@/lib/../lib/db'") + fn('p7', "  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });\n  await withTenant(tenantId, (tx) => tx.evidence.delete({ where: { id } }));\n")],
  // --- oturum rolü, ek varyantlar
  ['S1', 'M', 'oturum kopyası üzerine yazma: {...scope, role: input}', header + fn('s1', "  const scope = await requireTenantAction();\n  const s2 = { ...scope, role: input.role as never };\n  if (!can(s2.role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n", '(id: string, input: { role: string })')],
  ['S2', 'M', 'iç blokta aynı ad: { const role = input.role; if(!can(role)) }', header + fn('s2', "  const { role } = await requireTenantAction();\n  {\n    const role = input.role as never;\n    if (!can(role, 'edit_proposal')) return;\n    await prisma.evidence.delete({ where: { id } });\n  }\n", '(id: string, input: { role: string })')],
  ['S3', 'M', "scope.role ??= / ||= ile yazma", header + fn('s3', "  const scope = await requireTenantAction();\n  scope.role ||= input.role as never;\n  if (!can(scope.role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n", '(id: string, input: { role: string })')],
  ['S4', 'M', 'sahte auth: auth barrel üzerinden başka modülden', header + "import { auth } from '@/lib/i80/s4auth';\n" + fn('s4', "  const s = await auth();\n  if (!can(s.user.role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n"),
    { 'lib/i80/s4auth': "export async function auth() { return { user: { role: 'TENANT_OWNER' as const } }; }\n" }],
  ['S5', 'M', 'kapanış içinde yazma: const f = () => { scope.role = x }', header + fn('s5', "  const scope = await requireTenantAction();\n  const f = () => { scope.role = input.role as never; };\n  f();\n  if (!can(scope.role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n", '(id: string, input: { role: string })')],
  ['S6', 'M', 'belgeli: takma ad üzerinden yazma const s2 = scope; s2.role = x', header + fn('s6', "  const scope = await requireTenantAction();\n  const s2 = scope;\n  s2.role = input.role as never;\n  if (!can(scope.role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n", '(id: string, input: { role: string })')],
  // --- FP: tüm-değer yürüyüşü
  ['F1', 'F', 'readOnly: repo.find() — repo nesnesinde ayrıca save() yazması var', imp("import { repo } from '@/lib/i80/f1impl';") + fn('f1', ro + '  return repo.find(id);\n'),
    { 'lib/i80/f1impl': "import { prisma } from '@/lib/db';\nexport const repo = {\n  find: (id: string) => prisma.evidence.findUnique({ where: { id } }),\n  save: (id: string) => prisma.evidence.delete({ where: { id } }),\n};\n" }],
  ['F2', 'F', 'readOnly: Repo.find() — sınıfta ayrıca static save() yazması', imp("import { Repo } from '@/lib/i80/f2impl';") + fn('f2', ro + '  return Repo.find(id);\n'),
    { 'lib/i80/f2impl': "import { prisma } from '@/lib/db';\nexport class Repo {\n  static find(id: string) { return prisma.evidence.findUnique({ where: { id } }); }\n  static save(id: string) { return prisma.evidence.delete({ where: { id } }); }\n}\n" }],
  ['F3', 'F', 'readOnly: ns.read() — aynı modülde wipe() de var', imp("import * as ns from '@/lib/i80/f3impl';") + fn('f3', ro + '  return ns.read(id);\n'), { 'lib/i80/f3impl': reader + impl() }],
  ['F4', 'F', 'readOnly: barrel export * üzerinden read()', imp("import { read } from '@/lib/i80/f4barrel';") + fn('f4', ro + '  return read(id);\n'),
    { 'lib/i80/f4barrel': "export * from './f4w';\nexport * from './f4r';\n", 'lib/i80/f4w': impl(), 'lib/i80/f4r': reader }],
];

it('İNCELEME-80 mutants', () => {
  const rows: string[] = [];
  let bad = 0;
  for (const [id, exp, cls, src, overlay] of M) {
    let res: string;
    let red: boolean | null = null;
    try {
      const { findings } = findingsFor(file, src, overlay ?? {});
      red = findings.length > 0;
      res = red ? `KIRMIZI  ${findings.map((f) => f.problem).join(' | ').slice(0, 220)}` : 'YEŞİL';
    } catch (e) {
      res = `HATA ${String(e).slice(0, 160)}`;
    }
    const ok = red === (exp === 'M');
    if (!ok) bad++;
    rows.push(`${ok ? 'ok ' : 'XX '} ${id.padEnd(3)} [${exp === 'M' ? 'açık→KIRMIZI beklenir' : 'meşru→YEŞİL beklenir'}] ${cls.padEnd(62)} → ${res}`);
  }
  rows.push(`beklenenden sapan: ${bad}/${M.length}`);
  fs.writeFileSync(process.env.OUT ?? '/dev/null', rows.join('\n') + '\n');
});
