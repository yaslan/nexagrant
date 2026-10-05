// Full-tree run of the scanner, the way api-error-body-guard does it. Usage: tsx tree.mts <scanner path>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const mod = await import(process.argv[2]!);
const ROOT = process.cwd();
const files: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); } else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) files.push(p); } };
walk(join(ROOT, 'src'));
const read = mod.fsModuleReader(ROOT);
const t0 = performance.now();
const found: Record<string, unknown> = {};
const per: [string, number][] = [];
let n = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!mod.hasUseServerDirective(src, f)) continue;
  n++;
  const t = performance.now();
  const r = mod.actionReturnFindings ? mod.actionReturnFindings(src, relative(ROOT, f), read) : mod.actionReturnLeaks(src, relative(ROOT, f), read);
  per.push([relative(ROOT, f), Math.round(performance.now() - t)]);
  if (r.length) found[relative(ROOT, f)] = r;
}
console.log(`files=${n} total=${Math.round(performance.now() - t0)} ms`);
console.log('slowest:', per.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, ms]) => `${f} ${ms}`).join(' | '));
console.log('found:', JSON.stringify(found, null, 1));
