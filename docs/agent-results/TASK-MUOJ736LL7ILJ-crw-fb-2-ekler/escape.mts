// İNCELEME-116 yeni kaçış sondası. Kullanım: tsx escape.mts <tarayıcı yolu>
const mod = await import(process.argv[2]!);
const { actionReturnLeaks, mapModuleReader } = mod;
const A = (body: string, imports = '') => `'use server';\n${imports}\nexport async function act(id: string) {\n${body}\n}\n`;
const F = 'src/modules/m8/server/actions.ts';
const CATCHER = "export async function run() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n";
const SVC = { 'src/lib/svc.ts': CATCHER };
const CE = (w: string) => A(`try { await go(id); return { ok: true }; } catch (e: any) {\n${w}\nreturn { code: e.code };\n}`);
const TE = (w: string) => A(`const out: any = { ok: false };\ntry { await go(id); out.ok = true; } catch (e) {\n${w}\n}\nreturn out;`);
type C = [string, string, string, Record<string, string>, 'leak' | 'clean'];
const cases: C[] = [
  // --- import() / require() varyantları ---
  ['D1', 'import(`@/lib/svc`) şablon, ikamesiz', A("const m = await import(`@/lib/svc`);\nreturn { error: await m.run() };"), SVC, 'leak'],
  ['D2', 'import(`@/lib/${n}`) ikameli → fail-closed', A("const n = 'svc';\nconst m = await import(`@/lib/${n}`);\nreturn { error: await m.run() };"), SVC, 'leak'],
  ['D3', 'değişken spesifikatör import(p)', A("const p = '@/lib/svc';\nconst m = await import(p);\nreturn { error: await m.run() };"), SVC, 'leak'],
  ['D4', 'import().then(m => m.run())', A("return { error: await import('@/lib/svc').then((m) => m.run()) };"), SVC, 'leak'],
  ['D5', 'import().then(({ run }) => run())', A("return { error: await import('@/lib/svc').then(({ run }) => run()) };"), SVC, 'leak'],
  ['D6', 'await import + yapıbozum + alias', A("const { run: go2 } = await import('@/lib/svc');\nreturn { error: await go2() };"), SVC, 'leak'],
  ['D7', 'ad alanı sonra yapıbozum: const { run } = m', A("const m = await import('@/lib/svc');\nconst { run } = m;\nreturn { error: await run() };"), SVC, 'leak'],
  ['D8', 'require takma adı: const r = require; r(…)', A("const r = require;\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'leak'],
  ['D9', 'module.require(…)', A("return { error: await module.require('@/lib/svc').run() };"), SVC, 'leak'],
  ['D10', 'createRequire(import.meta.url)(…)', A("const req = createRequire(import.meta.url);\nreturn { error: await req('../../../lib/svc').run() };", "import { createRequire } from 'node:module';"), SVC, 'leak'],
  ['D11', 'yerel yükleyici: const load = () => import(…)', A("const load = () => import('@/lib/svc');\nreturn { error: await (await load()).run() };"), SVC, 'leak'],
  ['D12', 'Promise.all([import(…)])', A("const [m] = await Promise.all([import('@/lib/svc')]);\nreturn { error: await m.run() };"), SVC, 'leak'],
  ['D13', "(await import(…))['run']()", A("return { error: await (await import('@/lib/svc'))['run']() };"), SVC, 'leak'],
  ['D14', 'default export nesne: const { default: s } = await import', A("const { default: s } = await import('@/lib/svcd');\nreturn { error: await s.run() };"), { 'src/lib/svcd.ts': "export default { async run() { try { await go(); return 'ok'; } catch (e) { return String(e); } } };\n" }, 'leak'],
  ['D15', 'ara modül dinamik import yapar (zincir)', A("return { error: await run() };", "import { run } from '@/lib/mid';"), { ...SVC, 'src/lib/mid.ts': "export async function run() { const { run: r } = await import('./svc'); return r(); }\n" }, 'leak'],
  ['D16', 'require.call(null, …)', A("return { error: await require.call(null, '@/lib/svc').run() };"), SVC, 'leak'],
  ['D17', 'import(…, { with }) seçenekli', A("const m = await import('@/lib/svc', { with: {} });\nreturn { error: await m.run() };"), SVC, 'leak'],
  ['D18', 'const { run } = await (import(…) as Promise<any>)', A("const { run } = await (import('@/lib/svc') as Promise<typeof import('@/lib/svc')>);\nreturn { error: await run() };"), SVC, 'leak'],
  ['D19', 'const p = import(…); const { run } = await p', A("const p = import('@/lib/svc');\nconst { run } = await p;\nreturn { error: await run() };"), SVC, 'leak'],
  // --- fail-closed ---
  ['FC1', 'olmayan modül import(@/lib/yok)', A("const m = await import('@/lib/yok');\nreturn { r: await m.run() };"), {}, 'leak'],
  ['FC2', 'require(p) değişken', A("const p = '@/lib/svc';\nreturn { r: await require(p).run() };"), SVC, 'leak'],
  ['FC3', 'temiz modülde .then → fail-closed (bilinçli FP)', A("return { r: await import('@/lib/ok').then((m) => m.run()) };"), { 'src/lib/ok.ts': "export async function run() { return 'ok'; }\n" }, 'leak'],
  ['FC4', 'derin yapıbozum', A("const { a: { run } } = await import('@/lib/svc2');\nreturn { r: await run() };"), { 'src/lib/svc2.ts': "export const a = { async run() { return 'ok'; } };\n" }, 'leak'],
  ['FC5', 'olmayan modül require(@/lib/yok)', A("const { run } = require('@/lib/yok');\nreturn { r: await run() };"), {}, 'leak'],
  ['FC6', 'temiz modül statik yolla → temiz kalmalı', A("const { run } = await import('@/lib/ok');\nreturn { r: await run() };"), { 'src/lib/ok.ts': "export async function run() { return 'ok'; }\n" }, 'clean'],
  // --- .code güveni ---
  ['C1', 'Reflect.set(e, code, e.message)', CE("Reflect.set(e, 'code', e.message);"), {}, 'leak'],
  ['C2', 'Object.defineProperty(e, code, { value })', CE("Object.defineProperty(e, 'code', { value: e.message });"), {}, 'leak'],
  ['C3', 'spread: { ...e, code: e.message }.code', A("try { await go(id); return { ok: true }; } catch (e: any) {\nconst x = { ...e, code: e.message };\nreturn { code: x.code };\n}"), {}, 'leak'],
  ['C4', 'structuredClone(e).code (+ yazım)', A("try { await go(id); return { ok: true }; } catch (e: any) {\nconst x = structuredClone(e); x.code = e.message;\nreturn { code: x.code };\n}"), {}, 'leak'],
  ['C5', "Object['assign'](e, …)", CE("Object['assign'](e, { code: e.message });"), {}, 'leak'],
  ['C6', 'Object.assign.call(null, e, …)', CE("Object.assign.call(null, e, { code: e.message });"), {}, 'leak'],
  ['C7', 'Reflect.apply(Object.assign, null, [e, …])', CE("Reflect.apply(Object.assign, null, [e, { code: e.message }]);"), {}, 'leak'],
  ['C8', 'const O = Object; O.assign(e, …)', CE("const O = Object;\nO.assign(e, { code: e.message });"), {}, 'leak'],
  ['C9', 'globalThis.Object.assign(e, …)', CE("globalThis.Object.assign(e, { code: e.message });"), {}, 'leak'],
  ['C10', '[e].forEach(x => { x.code = x.message })', CE("[e].forEach((x: any) => { x.code = x.message; });"), {}, 'leak'],
  ['C11', 'const { assign } = Object; assign(e, …)', CE("const { assign } = Object;\nassign(e, { code: e.message });"), {}, 'leak'],
  ['C12', "Reflect['set'](e, 'code', …)", CE("Reflect['set'](e, 'code', e.message);"), {}, 'leak'],
  ['C13', 'Object.assign.apply(null, [e, …])', CE("Object.assign.apply(null, [e, { code: e.message }]);"), {}, 'leak'],
  ['C14', '[e].slice()[0] üzerinden yazım', CE("const arr = [e].slice();\narr[0].code = arr[0].message;"), {}, 'leak'],
  ['C15', 'kimlik fonksiyonu: same(e).code = …', CE("const same = (x: any) => x;\nsame(e).code = same(e).message;"), {}, 'leak'],
  ['C16', 'yapıbozum ataması ({ code: e.code } = …)', CE("({ code: e.code } = { code: e.message });"), {}, 'leak'],
  ['C17', 'e.code ??= e.message', CE("e.code ??= e.message;"), {}, 'leak'],
  ['C18', 'Object.setPrototypeOf(e, { code })', CE("Object.setPrototypeOf(e, { code: e.message });"), {}, 'leak'],
  ['C19', 'Promise.resolve(e).then(x => x.code = …) ', CE("await Promise.resolve(e).then((x: any) => { x.code = x.message; });"), {}, 'leak'],
  ['C20', 'e.code yalnız okunur → temiz kalmalı', CE("console.error(e.message);"), {}, 'clean'],
  // --- genel taint (Object/Reflect yazımının varyantları) ---
  ['T1', "Object['assign'](out, { m: String(e) })", TE("Object['assign'](out, { m: String(e) });"), {}, 'leak'],
  ['T2', 'const O = Object; O.assign(out, …)', TE("const O = Object;\nO.assign(out, { m: String(e) });"), {}, 'leak'],
  ['T3', 'globalThis.Object.assign(out, …)', TE("globalThis.Object.assign(out, { m: String(e) });"), {}, 'leak'],
  ['T4', 'Reflect.apply(Object.assign, null, [out, …])', TE("Reflect.apply(Object.assign, null, [out, { m: String(e) }]);"), {}, 'leak'],
  ['T5', 'Object.assign.call(null, out, …)', TE("Object.assign.call(null, out, { m: String(e) });"), {}, 'leak'],
  ['T6', '[out].forEach(o => { o.m = String(e) })', TE("[out].forEach((o: any) => { o.m = String(e); });"), {}, 'leak'],
  ['T7', 'const a = [out].slice(); a[0].m = String(e)', TE("const a = [out].slice();\na[0].m = String(e);"), {}, 'leak'],
  // --- Y-1 dışa aktarma biçimleri ---
  ['X1', "export * from '@/lib/svc'", "'use server';\nexport * from '@/lib/svc';\n", SVC, 'leak'],
  ['X2', 'let act; act = run; export { act }', "'use server';\nimport { run } from '@/lib/svc';\nlet act: any;\nact = run;\nexport { act };\n", SVC, 'leak'],
  ['X3', 'export const act = run.bind(null)', "'use server';\nimport { run } from '@/lib/svc';\nexport const act = run.bind(null);\n", SVC, 'leak'],
  ['X4', 'export const act = [run][0]', "'use server';\nimport { run } from '@/lib/svc';\nexport const act = [run][0];\n", SVC, 'leak'],
  ['X5', 'export const { act } = { act: run }', "'use server';\nimport { run } from '@/lib/svc';\nexport const { act } = { act: run };\n", SVC, 'leak'],
  ['X6', 'export const act = c ? run : run', "'use server';\nimport { run } from '@/lib/svc';\nconst c = Math.random() > 2;\nexport const act = c ? run : run;\n", SVC, 'leak'],
  ['X7', 'export default withAuth(run) (paket sarmalayıcı)', "'use server';\nimport { run } from '@/lib/svc';\nimport { withAuth } from 'some-pkg';\nexport default withAuth(run);\n", SVC, 'leak'],
  ['X8', 'export let act = async () => …; act = run', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\nact = run;\n", SVC, 'leak'],
  ['X9', 'export var act = run', "'use server';\nimport { run } from '@/lib/svc';\nexport var act = run;\n", SVC, 'leak'],
  ['X10', 'export const act = (await import(…)).run', "'use server';\nexport const act = (await import('@/lib/svc')).run;\n", SVC, 'leak'],
  ['X11', 'export { run as act } (statik import yeniden)', "'use server';\nimport { run } from '@/lib/svc';\nexport { run as act };\n", SVC, 'leak'],
  ['X12', 'export async function act(){ … } sonra act = run? (fonksiyon bildirimi yeniden atama)', "'use server';\nimport { run } from '@/lib/svc';\nexport async function act() { return { ok: true }; }\n// @ts-ignore\nact = run;\n", SVC, 'leak'],
  ['X13', 'export const act = withAuth(async () => { catch → String(e) })', "'use server';\nimport { withAuth } from 'some-pkg';\nexport const act = withAuth(async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } });\n", {}, 'leak'],
  ['X14', 'Object.assign(act, …) ile değil: export const act = Object.assign(run, {})', "'use server';\nimport { run } from '@/lib/svc';\nexport const act = Object.assign(run, {});\n", SVC, 'leak'],
];
let bad = 0;
for (const [idx, desc, src, mods, want] of cases) {
  let got: number[] | string;
  try { got = actionReturnLeaks(src, F, mapModuleReader(mods)); } catch (err) { got = 'THROW ' + String(err).slice(0, 80); }
  const res = typeof got === 'string' ? 'leak' : got.length ? 'leak' : 'clean';
  const verdict = res === want ? (want === 'leak' ? 'YAKALADI' : 'TEMİZ(doğru)') : want === 'leak' ? 'KAÇTI' : 'YANLIŞ-POZİTİF';
  if (res !== want) bad++;
  console.log(`${verdict.padEnd(14)} | ${idx.padEnd(4)} | ${desc} | ${JSON.stringify(got)}`);
}
console.log(`\ntoplam=${cases.length} sorunlu=${bad}`);
