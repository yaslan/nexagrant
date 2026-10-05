/** READ-ONLY. Distinct message per source, so each row can be matched to its
 *  emit site in code. Nothing here writes, updates or deletes. */
import { prisma } from '@/lib/db';

const rows = await prisma.systemAlert.findMany({
  where: { resolvedAt: null },
  select: { source: true, level: true, message: true },
});

const g = new Map<string, Map<string, number>>();
for (const r of rows) {
  const k = `${r.source} [${r.level}]`;
  if (!g.has(k)) g.set(k, new Map());
  const m = g.get(k)!;
  m.set(r.message, (m.get(r.message) ?? 0) + 1);
}

for (const [k, msgs] of [...g.entries()].sort()) {
  console.log(`\n### ${k}`);
  for (const [msg, n] of [...msgs.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  n=${n}  ${msg.slice(0, 150)}`);
  }
}
await prisma.$disconnect();
