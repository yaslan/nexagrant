/**
 * READ-ONLY probe. How fast is the SystemAlert pile growing, and when does it
 * cross the console's MAX_ROWS cap? Nothing here writes, updates or deletes.
 */
import { prisma } from '@/lib/db';

const MAX_ROWS = 300; // must match src/app/[locale]/admin/alerts/page.tsx

const rows = await prisma.systemAlert.findMany({
  select: { source: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
});

const byHour = new Map<string, number>();
for (const r of rows) {
  const k = r.createdAt.toISOString().slice(0, 13);
  byHour.set(k, (byHour.get(k) ?? 0) + 1);
}

console.log('=== rows created per hour (UTC), last 14 buckets ===');
for (const [k, v] of [...byHour.entries()].slice(-14)) {
  console.log(`  ${k}:00  ${'#'.repeat(Math.min(v, 60))} ${v}`);
}

const now = Date.now();
const last24 = rows.filter((r) => now - r.createdAt.getTime() < 86_400_000).length;
const last1 = rows.filter((r) => now - r.createdAt.getTime() < 3_600_000).length;

console.log(`\ntotal rows          : ${rows.length}`);
console.log(`created in last 24h : ${last24}`);
console.log(`created in last  1h : ${last1}`);
console.log(`console MAX_ROWS    : ${MAX_ROWS}   headroom: ${MAX_ROWS - rows.length} rows`);
if (last24 > 0) {
  const hours = (MAX_ROWS - rows.length) / (last24 / 24);
  console.log(`at the last-24h rate the cap is crossed in ~${hours.toFixed(1)} hours`);
}

await prisma.$disconnect();
