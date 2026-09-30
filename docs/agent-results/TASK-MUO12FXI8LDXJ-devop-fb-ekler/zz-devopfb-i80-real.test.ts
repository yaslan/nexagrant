import fs from 'fs';
import { it } from 'vitest';
import { findingsFor } from './server-action-rbac-guard.test';
const file = 'app/[locale]/(app)/[workspace]/evidence/i80-real.ts';
const header = "'use server';\nimport { prisma } from '@/lib/db';\nimport { requireTenantAction } from '@/lib/tenant';\n";
const ro = '  const { tenantId } = await requireTenantAction({ readOnly: true });\n';
const act = (spec: string) => header + `import { wipe } from '${spec}';\nexport async function x(id: string) {\n${ro}  await wipe(id);\n}\n`;
const rows: [string, string, string][] = [
  ['R0', 'kontrol', '@/lib/i80/realimpl'],
  ['P1', "alias içinde '..'", '@/lib/../lib/i80/realimpl'],
  ['P1b', "alias içinde './'", '@/lib/./i80/realimpl'],
  ['P4', "göreli 5×'..'", '../../../../../lib/i80/realimpl'],
  ['P8', 'büyük harf (mac: dosya bulunur)', '@/lib/I80/RealImpl'],
  ['X1', '.js kaynak (allowJs)', '@/lib/i80/legacy'],
  ['X1b', '.js kaynak, uzantılı', '@/lib/i80/legacy.js'],
  ['X3', '.mts kaynak', '@/lib/i80/modern.mjs'],
];
it('İNCELEME-80 real-file mutants', () => {
  const out = rows.map(([id, cls, spec]) => {
    const { findings } = findingsFor(file, act(spec));
    return `${id.padEnd(4)} ${cls.padEnd(34)} ${spec.padEnd(36)} → ${findings.length ? 'KIRMIZI ' + findings.map((f) => f.problem).join(' | ').slice(0, 170) : 'YEŞİL (kaçtı)'}`;
  });
  // büyük/küçük harf: TRUSTED ve CHECK_SOURCES
  const good = (db: string, rbac: string) =>
    `'use server';\nimport { prisma } from '${db}';\nimport { requireTenantAction } from '@/lib/tenant';\nimport { can } from '${rbac}';\nexport async function y(id: string) {\n  const { role } = await requireTenantAction();\n  if (!can(role, 'edit_proposal')) return;\n  await prisma.evidence.delete({ where: { id } });\n}\n`;
  for (const [id, db, rbac] of [['K0', '@/lib/db', '@/lib/rbac'], ['K1', '@/lib/DB', '@/lib/rbac'], ['K2', '@/lib/db', '@/lib/RBAC']]) {
    const { findings } = findingsFor(file, good(db!, rbac!));
    out.push(`${id!.padEnd(4)} iyi biçim db=${db} rbac=${rbac}`.padEnd(76) + ` → ${findings.length ? 'KIRMIZI ' + findings.map((f) => f.problem).join(' | ').slice(0, 150) : 'YEŞİL'}`);
  }
  fs.writeFileSync(process.env.OUT ?? '/dev/null', out.join('\n') + '\n');
});
