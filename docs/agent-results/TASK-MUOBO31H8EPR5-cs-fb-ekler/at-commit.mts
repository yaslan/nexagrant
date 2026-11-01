// Bir commit'teki ağacı git'ten okuyarak tüm eylem dosyalarını tara (çalışma ağacına dokunmaz).
import { execFileSync } from 'node:child_process';
import { actionReturnLeaks, hasUseServerDirective, type ModuleReader } from '../../../tests/api/action-leak-scan.ts';
const rev = process.argv[2]!;
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, 'src'], { encoding: 'utf8' }).split('\n').filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const set = new Set(files);
const cache = new Map<string, string>();
const read: ModuleReader = (p) => {
  if (!set.has(p)) return undefined;
  if (!cache.has(p)) cache.set(p, execFileSync('git', ['show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  return cache.get(p);
};
const found: Record<string, number[]> = {};
let n = 0;
for (const f of files) {
  const src = read(f)!;
  if (!hasUseServerDirective(src, f)) continue;
  n++;
  const l = actionReturnLeaks(src, f, read);
  if (l.length) found[f] = l;
}
console.log(`${rev}: eylem dosyası=${n} sızıntılı=${JSON.stringify(found)}`);
