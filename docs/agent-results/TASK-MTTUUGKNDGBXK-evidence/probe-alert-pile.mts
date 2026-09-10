/**
 * TASK-MTTUUGKNDGBXK step 1 - MEASURE the SystemAlert pile. Read-only.
 *
 * Nothing here writes or deletes. It answers: how many rows, how many open,
 * how they distribute over (source x level x resolved), and which sources
 * dominate the console an operator actually opens.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function padl(s: string, n: number) {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

async function main() {
  const total = await prisma.systemAlert.count();
  const open = await prisma.systemAlert.count({ where: { resolvedAt: null } });
  const resolved = total - open;

  console.log('=== SystemAlert - the whole table ===');
  console.log(`total rows              : ${total}`);
  console.log(`open   (resolvedAt null): ${open}`);
  console.log(`resolved                : ${resolved}`);

  const rows = await prisma.systemAlert.findMany({
    select: {
      id: true,
      level: true,
      source: true,
      message: true,
      meta: true,
      createdAt: true,
      resolvedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n=== source x level x open/resolved ===');
  const key = (r: (typeof rows)[number]) =>
    `${r.source}|${r.level}|${r.resolvedAt ? 'resolved' : 'open'}`;
  const buckets = new Map<string, number>();
  for (const r of rows) buckets.set(key(r), (buckets.get(key(r)) ?? 0) + 1);
  const parsed = [...buckets.entries()]
    .map(([k, n]) => {
      const [source, level, state] = k.split('|') as [string, string, string];
      return { source, level, state, n };
    })
    .sort((a, b) => b.n - a.n);
  console.log(`${pad('source', 40)}${pad('level', 7)}${pad('state', 10)}count`);
  for (const b of parsed)
    console.log(`${pad(b.source, 40)}${pad(b.level, 7)}${pad(b.state, 10)}${b.n}`);

  console.log('\n=== top sources by OPEN row count ===');
  const bySource = new Map<string, number>();
  for (const r of rows.filter((r) => r.resolvedAt === null))
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
  const top = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  for (const [source, n] of top) {
    const pct = ((n / Math.max(1, open)) * 100).toFixed(1);
    console.log(`${padl(String(n), 4)}  (${padl(pct, 5)}%)  ${source}`);
  }

  console.log('\n=== identical (level, source, message) groups among OPEN rows ===');
  console.log('(a group with n>1 means dedup did NOT fold them - meta differs)');
  const groups = new Map<string, { n: number; metas: string[] }>();
  for (const r of rows.filter((r) => r.resolvedAt === null)) {
    const k = `${r.level}|${r.source}|${r.message}`;
    const g = groups.get(k) ?? { n: 0, metas: [] };
    g.n += 1;
    g.metas.push(JSON.stringify(r.meta));
    groups.set(k, g);
  }
  for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const [level, source, message] = k.split('|') as [string, string, string];
    console.log(`\n n=${g.n}  ${level} / ${source}`);
    console.log(`   message: ${message}`);
    if (g.n > 1) {
      const distinct = new Set(g.metas);
      console.log(`   distinct meta values among those ${g.n} rows: ${distinct.size}`);
      for (const m of [...distinct].slice(0, 4)) console.log(`     ${m?.slice(0, 220)}`);
      if (distinct.size > 4) console.log(`     ... +${distinct.size - 4} more`);
    }
  }

  console.log('\n=== age of the OPEN pile ===');
  const now = Date.now();
  const openRows = rows.filter((r) => r.resolvedAt === null);
  const ages = openRows
    .map((r) => (now - r.createdAt.getTime()) / 86_400_000)
    .sort((a, b) => a - b);
  if (ages.length > 0) {
    console.log(`newest open row : ${ages[0]!.toFixed(2)} days old`);
    console.log(`oldest open row : ${ages[ages.length - 1]!.toFixed(2)} days old`);
    const spread = { 'lt-1d': 0, '1-7d': 0, '7-30d': 0, 'gt-30d': 0 };
    for (const a of ages) {
      if (a < 1) spread['lt-1d'] += 1;
      else if (a < 7) spread['1-7d'] += 1;
      else if (a < 30) spread['7-30d'] += 1;
      else spread['gt-30d'] += 1;
    }
    console.log(JSON.stringify(spread));
  }

  console.log('\n=== repeat counters currently stored ===');
  let withRepeat = 0;
  let occurrences = 0;
  for (const r of openRows) {
    const m = (typeof r.meta === 'object' && r.meta !== null ? r.meta : {}) as Record<
      string,
      unknown
    >;
    const c = typeof m.alertRepeatCount === 'number' ? m.alertRepeatCount : 1;
    if (c > 1) withRepeat += 1;
    occurrences += c;
  }
  console.log(`open rows carrying a repeat counter gt 1 : ${withRepeat}`);
  console.log(`occurrences those ${openRows.length} open rows stand for : ${occurrences}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
