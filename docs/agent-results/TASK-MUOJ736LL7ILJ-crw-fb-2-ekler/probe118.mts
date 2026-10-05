// İNCELEME-118 ek sondası: Y-1 / Y-2 varyantları + yanlış pozitif kontrolleri. Kullanım: tsx probe118.mts <tarayıcı yolu>
const mod = await import(process.argv[2]!);
const { actionReturnLeaks, mapModuleReader } = mod;
const F = 'src/modules/m8/server/actions.ts';
const A = (body: string, imports = '') => `'use server';\n${imports}\nexport async function act(id: string) {\n${body}\n}\n`;
const CATCHER = "export async function run() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n";
const CLEAN = "export async function run() { try { await go(); return 'ok'; } catch { return 'failed'; } }\n";
const SVC = { 'src/lib/svc.ts': CATCHER };
const CSVC = { 'src/lib/svc.ts': CLEAN };
const NM = "import { createRequire } from 'node:module';";
type C = [string, string, string, Record<string, string>, 'leak' | 'clean'];
const cases: C[] = [
  // --- Y-1: createRequire ---
  ['I1', 'import { createRequire } from node:module; createRequire(import.meta.url)(…) (runtime probe biçimi)', A("return { error: await createRequire(import.meta.url)('@/lib/svc').run() };", NM), SVC, 'leak'],
  ['I2', "import { createRequire as cr } from 'node:module'; cr(…)(…)", A("return { error: await cr(import.meta.url)('@/lib/svc').run() };", "import { createRequire as cr } from 'node:module';"), SVC, 'leak'],
  ['I3', "import * as nm from 'node:module'; nm.createRequire(…)(…)", A("return { error: await nm.createRequire(import.meta.url)('@/lib/svc').run() };", "import * as nm from 'node:module';"), SVC, 'leak'],
  ['I4', 'const req = createRequire(…); req(…) (iki adım, import’lu)', A("const req = createRequire(import.meta.url);\nreturn { error: await req('@/lib/svc').run() };", NM), SVC, 'leak'],
  ['I5', 'createRequire global (import YOK — tsc bunu reddeder)', A("return { error: await createRequire(import.meta.url)('@/lib/svc').run() };"), SVC, 'leak'],
  ['I6', 'import’lu createRequire, değişken spesifikatör → fail-closed beklenir', A("const p = '@/lib/svc';\nreturn { error: await createRequire(import.meta.url)(p).run() };", NM), SVC, 'leak'],
  // --- Y-1: require varyantları ---
  ['R5', "require.apply(null, ['@/lib/svc'])", A("return { error: await require.apply(null, ['@/lib/svc']).run() };"), SVC, 'leak'],
  ['R6', 'require.apply(null, arr) değişken → fail-closed', A("const arr = ['@/lib/svc'];\nreturn { error: await require.apply(null, arr).run() };"), SVC, 'leak'],
  ['R7', 'require.call(null, p) değişken → fail-closed', A("const p = '@/lib/svc';\nreturn { error: await require.call(null, p).run() };"), SVC, 'leak'],
  ['R8', 'const r = require as any; r(…)', A("const r = require as any;\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'leak'],
  ['R9', 'const r = (require); r(…)', A("const r = (require);\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'leak'],
  ['R10', 'let r; r = require; r(…)', A("let r: any;\nr = require;\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'leak'],
  ['R11', 'const r = require, s = r; s(…) (zincir takma ad)', A("const r = require, s = r;\nreturn { error: await s('@/lib/svc').run() };"), SVC, 'leak'],
  ['R12', 'require.bind(null)(…)', A("return { error: await require.bind(null)('@/lib/svc').run() };"), SVC, 'leak'],
  ['R13', '(0, require)(…)', A("return { error: await (0, require)('@/lib/svc').run() };"), SVC, 'leak'],
  ['R14', "module['require'](…)", A("return { error: await module['require']('@/lib/svc').run() };"), SVC, 'leak'],
  ['R15', 'const { require: r } = module; r(…)', A("const { require: r } = module;\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'leak'],
  ['R16', 'const r = module.require; r(…)', A("const r = module.require;\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'leak'],
  // --- FP kontrolleri (temiz modül → temiz kalmalı) ---
  ['FP1', 'require.call(null, …) temiz modül', A("return { error: await require.call(null, '@/lib/svc').run() };"), CSVC, 'clean'],
  ['FP2', 'const r = require; r(…) temiz modül', A("const r = require;\nreturn { error: await r('@/lib/svc').run() };"), CSVC, 'clean'],
  ['FP3', 'module.require(…) temiz modül', A("return { error: await module.require('@/lib/svc').run() };"), CSVC, 'clean'],
  ['FP4', 'yerel fonksiyon r (require değil) → temiz', A("const r = (x: string) => ({ run: async () => x });\nreturn { error: await r('@/lib/svc').run() };"), SVC, 'clean'],
  ['FP5', 'Array.prototype.push.call(out, e) hâlâ yakalanmalı (Y-3 regresyon kontrolü)', A("const out: unknown[] = [];\ntry { await go(id); } catch (e) { Array.prototype.push.call(out, e); }\nreturn { items: out };"), {}, 'leak'],
  ['FP6', '[].push.call(out, String(e)) hâlâ yakalanmalı', A("const out: unknown[] = [];\ntry { await go(id); } catch (e) { [].push.call(out, String(e) as never); }\nreturn { items: out };"), {}, 'leak'],
  // --- Y-2: let/var export yeniden ataması ---
  ['V1', 'export let act = async…; act = run (X8)', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\nact = run;\n", SVC, 'leak'],
  ['V2', 'export var act = async…; act = run', "'use server';\nimport { run } from '@/lib/svc';\nexport var act = async () => ({ ok: true });\nact = run;\n", SVC, 'leak'],
  ['V3', 'export let act = async…; act = run as any', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\nact = run as any;\n", SVC, 'leak'],
  ['V4', 'export let act…; [act] = [run] (yapıbozum ataması)', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\n[act] = [run];\n", SVC, 'leak'],
  ['V5', 'export let act…; ({ act } = { act: run })', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\n({ act } = { act: run });\n", SVC, 'leak'],
  ['V6', 'export let act…; function init() { act = run } init()', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\nfunction init() { act = run; }\ninit();\n", SVC, 'leak'],
  ['V7', 'export let act…; act = c ? run : act', "'use server';\nimport { run } from '@/lib/svc';\nconst c = Math.random() > 2;\nexport let act = async () => ({ ok: true });\nact = c ? run : act;\n", SVC, 'leak'],
  ['V8', 'let act = async…; act = run; export { act } (bildirim ayrı)', "'use server';\nimport { run } from '@/lib/svc';\nlet act = async () => ({ ok: true });\nact = run;\nexport { act };\n", SVC, 'leak'],
  ['V9', 'export let act…; act = async () => { catch → String(e) } (satır içi sızıntı)', "'use server';\nexport let act = async () => ({ ok: true });\nact = async () => { try { await go(); return 'ok'; } catch (e) { return String(e); } };\n", {}, 'leak'],
  ['V10', 'export let act…; act ||= run', "'use server';\nimport { run } from '@/lib/svc';\nexport let act: any = async () => ({ ok: true });\nact ||= run;\n", SVC, 'leak'],
  ['VFP1', 'export let act…; act = async () => temiz → temiz kalmalı', "'use server';\nexport let act = async () => ({ ok: true });\nact = async () => ({ ok: false });\n", {}, 'clean'],
  ['VFP2', 'export let act…; iç kapsamda gölgeleyen act = run → temiz kalmalı', "'use server';\nimport { run } from '@/lib/svc';\nexport let act = async () => ({ ok: true });\nexport async function other() { let act: any = null; act = run; return { ok: !!act }; }\n", SVC, 'clean'],
  ['VFP3', 'export const act = async…; (yeniden atama yok) → temiz', "'use server';\nexport const act = async () => ({ ok: true });\n", {}, 'clean'],
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
