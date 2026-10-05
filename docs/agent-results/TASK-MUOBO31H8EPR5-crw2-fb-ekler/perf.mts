import { actionReturnLeaks, mapModuleReader } from '../tests/api/action-leak-scan.ts';
const F = 'src/modules/m8/server/actions.ts';
const t = (f: () => unknown) => { const a = performance.now(); const r = f(); return [Math.round(performance.now() - a), r] as const; };
// P1: tek dosyada N catch + ortak dizilere yazan zincir (taint fixpoint derinliği N)
for (const n of [25, 50, 100, 200]) {
  let body = "const b0: string[] = [];\n";
  for (let i = 1; i <= n; i++) body += `const b${i}: string[] = [];\n`;
  for (let i = n; i >= 1; i--) body += `b${i}.forEach((x) => b${i - 1}.push(x));\n`;
  body += `try { await go(id); } catch (e) { b${n}.push(String(e)); }\nreturn { b0 };`;
  const src = `'use server';\nexport async function act(id: string) {\n${body}\n}\n`;
  const [ms, r] = t(() => actionReturnLeaks(src, F, mapModuleReader({})));
  console.log(`P1 zincir n=${n}: ${ms} ms, satır=${JSON.stringify(r)}`);
}
// P2: K kirli argümanlı src yardımcı çağrısı (argEffects önbelleksiz), büyük yardımcı modül
for (const k of [10, 40, 80]) {
  let helper = '';
  for (let i = 0; i < 60; i++) helper += `export function h${i}(o: Record<string, unknown>, x: unknown) { const t${i} = [x]; if (t${i}.length > 1) o.v = 1; }\n`;
  let body = "const out: Record<string, unknown> = {};\n";
  for (let i = 0; i < k; i++) body += `try { await go(id); } catch (e) { h${i % 60}(out, e); }\n`;
  body += 'return { ok: out.v === 1 };';
  const src = `'use server';\nimport { ${Array.from({ length: 60 }, (_, i) => 'h' + i).join(', ')} } from '@/lib/h';\nexport async function act(id: string) {\n${body}\n}\n`;
  const [ms, r] = t(() => actionReturnLeaks(src, F, mapModuleReader({ 'src/lib/h.ts': helper })));
  console.log(`P2 src yardımcı çağrısı k=${k}: ${ms} ms, satır=${JSON.stringify(r)}`);
}
// P3: M modüllük derin zincir
for (const m of [20, 60, 120]) {
  const mods: Record<string, string> = {};
  for (let i = 0; i < m; i++) mods[`src/lib/c${i}.ts`] = `import { f${i + 1} } from './c${i + 1}';\nexport async function f${i}() { return f${i + 1}(); }\n`;
  mods[`src/lib/c${m}.ts`] = `export async function f${m}() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n`;
  const src = `'use server';\nimport { f0 } from '@/lib/c0';\nexport async function act() { return { r: await f0() }; }\n`;
  const [ms, r] = t(() => actionReturnLeaks(src, F, mapModuleReader(mods)));
  console.log(`P3 zincir modül=${m}: ${ms} ms, satır=${JSON.stringify(r)}`);
}
