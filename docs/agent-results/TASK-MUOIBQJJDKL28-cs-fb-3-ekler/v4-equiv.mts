// V4 (ad metniyle eşleme) eşdeğerlik sondası: gölgeleme varyantlarında orijinal ve mutant aynı sonucu mu veriyor?
const [o, m] = await Promise.all([import(process.argv[2]!), import(process.argv[3]!)]);
const F = 'src/modules/m8/server/actions.ts';
const LEAK = { 'src/lib/svc.ts': "export async function run() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n" };
const H = "'use server';\nimport { run } from '@/lib/svc';\nexport let act: any = async () => ({ ok: true });\n";
const cases: [string, string][] = [
  ['iç let act = run', H + 'export async function other() { let act: any = null; act = run; return { ok: !!act }; }\n'],
  ['parametre act = run', H + 'export async function other(act: any) { act = run; return { ok: !!act }; }\n'],
  ['iç [act] = [run]', H + 'export async function other() { let act: any; [act] = [run]; return { ok: !!act }; }\n'],
  ['iç act ||= run', H + 'export async function other() { let act: any; act ||= run; return { ok: !!act }; }\n'],
  ['catch (act) { act = run }', H + 'export async function other() { try { await go(); } catch (act: any) { act = run; } return { ok: true }; }\n'],
  ['dış act = run (kontrol)', H + 'act = run;\n'],
];
let diff = 0;
for (const [name, src] of cases) {
  const a = JSON.stringify(o.actionReturnLeaks(src, F, o.mapModuleReader(LEAK)));
  const b = JSON.stringify(m.actionReturnLeaks(src, F, m.mapModuleReader(LEAK)));
  if (a !== b) diff++;
  console.log(`${a === b ? 'AYNI ' : 'FARKLI'} | ${name.padEnd(28)} | orijinal=${a} mutant=${b}`);
}
console.log(`farklı=${diff}/${cases.length}`);
