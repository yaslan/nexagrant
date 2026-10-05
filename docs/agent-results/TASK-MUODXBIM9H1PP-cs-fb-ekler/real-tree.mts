// Usage: tsx real-tree.mts <scanner path>. CORDIS at 5e674e7f (before its fix) and m11 with a leaking withSystemScope.
import { execFileSync } from 'node:child_process';
const mod = await import(process.argv[2]!);
const AT = '5e674e7f';
const cache = new Map<string, string | undefined>();
const atCommit = (p: string) => {
  if (!cache.has(p)) {
    let v: string | undefined;
    try { v = execFileSync('git', ['cat-file', 'blob', `${AT}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { v = undefined; }
    cache.set(p, v);
  }
  return cache.get(p);
};
const F = 'src/app/[locale]/admin/cordis/actions.ts';
const base = atCommit(F)!;
const IMP = "import { runCordisImport } from '@/lib/k2-cordis/importer';\n";
if (!base.includes(IMP)) throw new Error('import line not found');
const dyn = base.replace(IMP, '').replace('const importRes = await runCordisImport(', "const { runCordisImport } = await import('@/lib/k2-cordis/importer');\n  const importRes = await runCordisImport(");
if (dyn === base.replace(IMP, '')) throw new Error('call not found');
const show = (name: string, src: string, read: (p: string) => string | undefined, file = F) => {
  const t0 = performance.now();
  const f = mod.actionReturnFindings ? mod.actionReturnFindings(src, file, read) : mod.actionReturnLeaks(src, file, read).map((line: number) => ({ line }));
  console.log(`${f.length ? 'YAKALADI' : 'KAÇTI   '} | ${name} | ${JSON.stringify(f.map((x: any) => x.line))} | ${Math.round(performance.now() - t0)} ms`);
  for (const x of f) if (x.via) console.log(`           line ${x.line} ← ${x.via}`);
};
show('CORDIS 5e674e7f, static import', base, atCommit);
show('CORDIS 5e674e7f, import made dynamic (one line)', dyn, atCommit);
const cwd = mod.fsModuleReader(process.cwd());
const M11 = 'src/modules/m11/server/actions.ts';
const m11 = cwd(M11)!;
const ss = cwd('src/lib/system-scope.ts')!;
const leaky = ss.replace(/export async function withSystemScope<T>\(([\s\S]*?)\): Promise<T> \{\n  return withSystemScopeOn\(prisma, purpose, context, callback\);/, "export async function withSystemScope<T>($1): Promise<T> {\n  try { return await withSystemScopeOn(prisma, purpose, context, callback); } catch (e) { return String(e) as unknown as T; }");
if (leaky === ss) throw new Error('overlay not applied');
const ovl = (p: string) => (p === 'src/lib/system-scope.ts' ? leaky : cwd(p));
show('m11 as is (real tree)', m11, cwd, M11);
show('m11, withSystemScope made to leak (dynamic import as in src)', m11, ovl, M11);
