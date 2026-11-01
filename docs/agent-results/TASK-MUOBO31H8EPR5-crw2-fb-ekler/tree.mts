// Gerçek ağaç: her 'use server' dosyasında actionReturnLeaks, soğuk süre.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { actionReturnLeaks, hasUseServerDirective, fsModuleReader } from '../tests/api/action-leak-scan.ts';
const ROOT = process.cwd();
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [f] : []; });
for (let run = 1; run <= 3; run++) {
  const read = fsModuleReader(ROOT); // yeni okuyucu = soğuk önbellek
  const t = performance.now(); const c = process.cpuUsage();
  const files = walk(join(ROOT, 'src')).filter((f) => hasUseServerDirective(readFileSync(f, 'utf8'), f));
  const found: Record<string, number[]> = {};
  for (const f of files) { const r = relative(ROOT, f).split(sep).join('/'); const l = actionReturnLeaks(readFileSync(f, 'utf8'), r, read); if (l.length) found[r] = l; }
  const cu = process.cpuUsage(c);
  console.log(`koşu ${run}: eylem dosyası=${files.length} sızıntılı=${Object.keys(found).length} duvar=${Math.round(performance.now() - t)} ms cpu=${Math.round((cu.user + cu.system) / 1000)} ms`);
  if (run === 1) console.log(JSON.stringify(found, null, 1));
}
