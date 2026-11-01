import fs from 'fs';
import { it } from 'vitest';
import { findingsFor } from './server-action-rbac-guard.test';
const file = 'app/[locale]/i89/probe.ts';
const h = "'use server';\nimport { prisma } from '@/lib/db';\nimport { requireTenantAction } from '@/lib/tenant';\nimport { can } from '@/lib/rbac';\n";
const rows: [string, string][] = [
  ['W1 yazma action, çözülemeyen import kontrolden ÖNCE', h + "import { wipe } from '@/lib/i89/missing';\nexport async function x(id: string) {\n  const { role } = await requireTenantAction();\n  await wipe(id);\n  if (!can(role, 'edit_proposal')) return;\n}\n"],
  ['W2 yazma action, çözülemeyen import kontrolden SONRA', h + "import { wipe } from '@/lib/i89/missing';\nexport async function x(id: string) {\n  const { role } = await requireTenantAction();\n  if (!can(role, 'edit_proposal')) return;\n  await wipe(id);\n}\n"],
  ['TP1 üçüncü parti: zod/next/headers/@prisma/client/@auth scoped', h + "import { z } from 'zod';\nimport { headers } from 'next/headers';\nimport { Prisma } from '@prisma/client';\nimport { revalidatePath } from 'next/cache';\nexport async function x(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await headers(); revalidatePath('/'); z.string().parse(id); return Prisma.sql`x`;\n}\n"],
  ['TP2 dinamik üçüncü parti import', h + "export async function x(id: string) {\n  await requireTenantAction({ readOnly: true });\n  const { z } = await import('zod');\n  return z.string().parse(id);\n}\n"],
  ['J1 var olan src json', h + "import s from '@/locales/en/settings.json';\nexport async function x(id: string) {\n  await requireTenantAction({ readOnly: true });\n  return s ? id : id;\n}\n"],
  ['J2 var olmayan src json (tsc de kırar)', h + "import s from '@/locales/en/nope.json';\nexport async function x(id: string) {\n  await requireTenantAction({ readOnly: true });\n  return s ? id : id;\n}\n"],
];
it('i89b', () => {
  const out = rows.map(([c, s]) => { const { findings } = findingsFor(file, s); return `${c.padEnd(60)} → ${findings.length ? 'KIRMIZI  ' + findings.map((f) => f.problem).join(' | ') : 'YEŞİL'}`; });
  fs.writeFileSync(process.env.OUT ?? '/dev/null', out.join('\n') + '\n');
});
