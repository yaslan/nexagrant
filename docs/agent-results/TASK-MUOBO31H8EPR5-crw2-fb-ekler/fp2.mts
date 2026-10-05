import { actionReturnLeaks, mapModuleReader } from '../tests/api/action-leak-scan.ts';
const A = (body: string, imports = '') => `'use server';\n${imports}\nexport async function act(id: string) {\n${body}\n}\n`;
const F = 'src/modules/m8/server/actions.ts';
const cases: [string, string][] = [
  ['F12 catch içinde forEach ok gövdesi loglar', A("try { await go(id); return { ok: true }; } catch (e) { [1].forEach(() => console.error(String(e))); return { ok: false, code: 'failed' }; }")],
  ['F13 catch içinde setTimeout(() => log(e))', A("try { await go(id); return { ok: true }; } catch (e) { setTimeout(() => console.error(e), 0); return { ok: false, code: 'failed' }; }")],
  ['F14 after() ile arka plan log', A("try { await go(id); return { ok: true }; } catch (e) { after(() => console.error('x', e)); return { ok: false, code: 'failed' }; }", "import { after } from 'next/server';")],
];
for (const [n, s] of cases) console.log(`${n}: ${JSON.stringify(actionReturnLeaks(s, F, mapModuleReader({})))}`);
