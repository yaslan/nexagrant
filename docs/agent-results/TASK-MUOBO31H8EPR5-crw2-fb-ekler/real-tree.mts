// Gerçek ağaç: fe-fb düzeltmesi ÖNCESİ (5e674e7f) CORDIS eylemi + importer'ı git'ten okuyup
// eylemde tek satırlık yeniden yazımlarla bekçinin yakalayıp yakalamadığına bakar.
import { execFileSync } from 'node:child_process';
import { actionReturnLeaks, fsModuleReader, type ModuleReader } from '../tests/api/action-leak-scan.ts';
const AT = '5e674e7f';
const atCommit: ModuleReader = (p) => { try { return execFileSync('git', ['show', `${AT}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return undefined; } };
const F = 'src/app/[locale]/admin/cordis/actions.ts';
const base = atCommit(F)!;
const IMP = "import { runCordisImport } from '@/lib/k2-cordis/importer';\n";
const variants: [string, string][] = [
  ['taban (statik import, İNCELEME-100 Y-1 hâli)', base],
  ['dinamik import', base.replace(IMP, '').replace('const importRes = await runCordisImport(', "const { runCordisImport } = await import('@/lib/k2-cordis/importer');\n  const importRes = await runCordisImport(")],
  ['sonuç parametre üzerinden (servis çağrıyı sarar: out nesnesi)', base.replace('const importRes = await runCordisImport({ dataset, limit });', "const out: { r?: Awaited<ReturnType<typeof runCordisImport>> } = {};\n  await capture(out, () => runCordisImport({ dataset, limit }));\n  const importRes = out.r!;").replace(IMP, IMP + "import { capture } from '@/lib/capture';\n")],
];
const overlay = (extra: Record<string, string>): ModuleReader => (p) => extra[p] ?? atCommit(p);
for (const [name, src] of variants) {
  const t0 = performance.now();
  const got = actionReturnLeaks(src, F, overlay({ 'src/lib/capture.ts': "export async function capture<T>(o: { r?: T }, f: () => Promise<T>) { o.r = await f(); }\n" }));
  console.log(`${got.length ? 'YAKALADI' : 'KAÇTI   '} | ${name} | ${JSON.stringify(got)} | ${Math.round(performance.now() - t0)} ms`);
}
// m11: gerçek dinamik import. withSystemScope'u yakaladığını döndüren hâle getir (overlay), eylem aynen.
const M11 = 'src/modules/m11/server/actions.ts';
const cwd = fsModuleReader(process.cwd());
const m11 = cwd(M11)!;
const ss = cwd('src/lib/system-scope.ts')!;
const leakySS = ss + "\nexport async function __probe() {}\n";
const leakyWith = ss.replace(/export async function withSystemScope<T>\(([\s\S]*?)\): Promise<T> \{\n  return withSystemScopeOn\(prisma, purpose, context, callback\);/, "export async function withSystemScope<T>($1): Promise<T> {\n  try { return await withSystemScopeOn(prisma, purpose, context, callback); } catch (e) { return String(e) as unknown as T; }");
console.log('m11 overlay uygulandı:', leakyWith !== ss);
const ovl: ModuleReader = (p) => (p === 'src/lib/system-scope.ts' ? leakyWith : cwd(p));
const dyn = actionReturnLeaks(m11, M11, ovl);
const stat = actionReturnLeaks(m11.replace("const { withSystemScope } = await import('@/lib/system-scope');", '').replace("'use server';", "'use server';\nimport { withSystemScope } from '@/lib/system-scope';"), M11, ovl);
console.log(`m11 sızdıran withSystemScope — gerçek dinamik import: ${JSON.stringify(dyn)} | statik import'a çevrilince: ${JSON.stringify(stat)}`);
void leakySS;
