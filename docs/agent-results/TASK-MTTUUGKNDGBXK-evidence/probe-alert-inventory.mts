/**
 * TASK-MTTUUGKNDGBXK step 3 — the inventory an operator would triage from.
 *
 * READ-ONLY. Groups the open pile by root cause rather than by row, and for
 * each group states first seen, last seen, how many occurrences the rows stand
 * for, and whether the condition that raised it is still true today.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';
import { repeatCountOf, lastSeenAtOf } from '../../../src/lib/observability/system-alert';

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const padl = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

async function main() {
  const rows = await prisma.systemAlert.findMany({
    where: { resolvedAt: null },
    select: { id: true, level: true, source: true, message: true, meta: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const liveTenantIds = new Set((await prisma.tenant.findMany({ select: { id: true } })).map((t) => t.id));

  // Group by (source, level) — the unit an operator would actually act on.
  const groups = new Map<
    string,
    { rows: number; occurrences: number; first: Date; last: Date; message: string; deadTenants: number; liveTenants: number }
  >();

  for (const r of rows) {
    const k = `${r.source}|${r.level}`;
    const g = groups.get(k) ?? {
      rows: 0,
      occurrences: 0,
      first: r.createdAt,
      last: r.createdAt,
      message: r.message,
      deadTenants: 0,
      liveTenants: 0,
    };
    g.rows += 1;
    g.occurrences += repeatCountOf(r.meta);
    if (r.createdAt < g.first) g.first = r.createdAt;
    const seen = lastSeenAtOf(r.meta);
    const lastAt = seen ? new Date(seen) : r.createdAt;
    if (lastAt > g.last) g.last = lastAt;
    const tid = asObject(r.meta).tenantId;
    if (typeof tid === 'string') {
      if (liveTenantIds.has(tid)) g.liveTenants += 1;
      else g.deadTenants += 1;
    }
    groups.set(k, g);
  }

  console.log(`open rows: ${rows.length}   distinct (source, level) groups: ${groups.size}\n`);
  console.log(
    `${pad('source', 34)}${pad('level', 6)}${padl('rows', 5)}${padl('occur', 7)}  ${pad('first seen', 18)}${pad('last seen', 18)}${padl('dead/live tenant', 18)}`
  );
  console.log('-'.repeat(106));
  for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
    const [source, level] = k.split('|') as [string, string];
    console.log(
      `${pad(source, 34)}${pad(level, 6)}${padl(String(g.rows), 5)}${padl(String(g.occurrences), 7)}  ` +
        `${pad(g.first.toISOString().slice(0, 16).replace('T', ' '), 18)}` +
        `${pad(g.last.toISOString().slice(0, 16).replace('T', ' '), 18)}` +
        `${padl(g.deadTenants + '/' + g.liveTenants, 18)}`
    );
  }

  console.log('\n=== rows the console shows vs rows the database holds ===');
  const total = await prisma.systemAlert.count();
  const MAX_ROWS = 300; // src/app/[locale]/admin/alerts/page.tsx
  console.log(`SystemAlert rows            : ${total}`);
  console.log(`console MAX_ROWS (take)     : ${MAX_ROWS}`);
  console.log(`rows the console would load : ${Math.min(total, MAX_ROWS)}`);
  console.log(`rows it would silently drop : ${Math.max(0, total - MAX_ROWS)}`);
  console.log(`headroom before it lies     : ${MAX_ROWS - total} rows`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
