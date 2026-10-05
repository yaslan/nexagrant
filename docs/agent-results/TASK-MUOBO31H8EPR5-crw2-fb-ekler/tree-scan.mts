import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hasUseServerDirective } from '../tests/api/action-leak-scan.ts';
const ROOT = process.cwd();
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : /\.(tsx?|jsx?)$/.test(n) && !/\.test\./.test(n) ? [f] : []; });
const files = walk(join(ROOT, 'src'));
const acts = files.filter((f) => hasUseServerDirective(readFileSync(f, 'utf8'), f));
const pat: [string, RegExp, string[]][] = [
  ['eylem: dinamik import/require', /\bimport\(|\brequire\(/, acts],
  ['eylem: export {…} from / export *', /^export\s+(\{[^}]*\}|\*)\s+from/m, acts],
  ['eylem: export const x = ident / call (fonksiyon değil)', /^export\s+const\s+\w+\s*=\s*(?!async\b|\(|function\b)[\w.]+\s*(\(|;)/m, acts],
  ['eylem: export default ident', /^export\s+default\s+\w+\s*;/m, acts],
  ['src: new Promise', /new Promise\s*[<(]/, files],
  ['src: allSettled', /allSettled/, files],
  ['src: captureException', /captureException/, files],
  ['src: catch binding .code ataması', /\b(e|err|error)\.code\s*=[^=]/, files],
  ['src: onError/ callback param', /onError\s*[?:(]/, files],
  ['src: export let', /^export\s+let\b/m, files],
];
for (const [name, re, set] of pat) {
  const hits = set.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
  console.log(`${name}: ${hits.length}${hits.length ? '\n  ' + hits.slice(0, 12).join('\n  ') : ''}`);
}
console.log('eylem dosyası:', acts.length, 'src dosyası:', files.length);
