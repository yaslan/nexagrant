import fs from 'fs';
import { it } from 'vitest';
import { findingsFor } from './server-action-rbac-guard.test';

// İNCELEME-89 (devop-fb) — gerçek dosyalarla (src/lib/i89, overlay YOK). M = KIRMIZI beklenir, F = YEŞİL.
const file = 'app/[locale]/i89/probe.ts';
const header = "'use server';\nimport { prisma } from '@/lib/db';\nimport { requireTenantAction } from '@/lib/tenant';\n";
const ro = '  await requireTenantAction({ readOnly: true });\n';
const stat = (spec: string) => header + `import { wipe } from '${spec}';\nexport async function x(id: string) {\n${ro}  await wipe(id);\n}\n`;
const body = (b: string) => header + `export async function x(id: string) {\n${ro}${b}}\n`;
type Row = [string, 'M' | 'F', string, string];
const rows: Row[] = [
  ['U1', 'M', 'uzantısız → .js', stat('@/lib/i89/legacy2')],
  ['U2', 'M', 'göreli uzantısız → .js', stat('../../../lib/i89/legacy2')],
  ['E1', 'M', "'./x.js' → x.ts", stat('@/lib/i89/tsimpl.js')],
  ['E1r', 'M', "göreli '../x.js' → x.ts", stat('../../../lib/i89/tsimpl.js')],
  ['E2', 'M', "'./x.jsx' → x.tsx", stat('@/lib/i89/tsximpl.jsx')],
  ['E2b', 'M', "'./x.js' → x.tsx", stat('@/lib/i89/tsximpl.js')],
  ['E3', 'M', "'./x.mjs' → x.mts", stat('@/lib/i89/mtsimpl.mjs')],
  ['E4', 'M', "'./x.cjs' → x.cts", stat('@/lib/i89/ctsimpl.cjs')],
  ['E5', 'M', "'./x.ts' (allowImportingTsExtensions biçimi)", stat('@/lib/i89/tsimpl.ts')],
  ['C1', 'M', '.cjs, ESM sözdizimi, uzantılı', stat('@/lib/i89/esmcjs.cjs')],
  ['C2', 'M', '.cjs module.exports = { wipe } + import { wipe }', stat('@/lib/i89/cjsexp.cjs')],
  ['C3', 'M', '.cjs exports.wipe = … + import { wipe }', stat('@/lib/i89/cjsexports.cjs')],
  ['C4', 'M', "require('@/lib/i89/cjsexp.cjs').wipe", body("  const m = require('@/lib/i89/cjsexp.cjs');\n  await m.wipe(id);\n")],
  ['C5', 'M', 'import d from .cjs (default)', header + "import d from '@/lib/i89/cjsexp.cjs';\nexport async function x(id: string) {\n" + ro + '  await d.wipe(id);\n}\n'],
  ['I1', 'M', 'dizin → dir/index.ts', stat('@/lib/i89/dir')],
  ['I1s', 'M', "dizin, sonda '/'", stat('@/lib/i89/dir/')],
  ['I1x', 'M', 'dir/index açık', stat('@/lib/i89/dir/index')],
  ['I2', 'M', 'dizin → dirjs/index.js', stat('@/lib/i89/dirjs')],
  ['I3', 'M', 'dizin → dirmts/index.mts', stat('@/lib/i89/dirmts')],
  ['I4', 'M', "göreli '..' dizin", stat('../../../lib/i89/dir')],
  ['T1', 'M', 'ikiz: twin.ts (okur) + twin.js (yazar) — bundler hangisini?', stat('@/lib/i89/twin')],
  ['T2', 'M', 'typed.d.ts + typed.js', stat('@/lib/i89/typed')],
  ['B1', 'M', "barrel .ts: export * from './legacy2.js'", stat('@/lib/i89/barreljs')],
  ['D1', 'M', "await import('@/lib/i89/legacy2.js').wipe", body("  await (await import('@/lib/i89/legacy2.js')).wipe(id);\n")],
  ['D2', 'M', "const { wipe } = await import('@/lib/i89/dirjs')", body("  const { wipe } = await import('@/lib/i89/dirjs');\n  await wipe(id);\n")],
  ['X1', 'M', 'çözülemeyen @/ (fail-closed mesajı)', stat('@/lib/i89/missing')],
  ['X2', 'M', 'çözülemeyen göreli (fail-closed)', stat('./missing')],
  ['X3', 'M', 'çözülemeyen uzantılı .js', stat('@/lib/i89/missing.js')],
  ['X4', 'F', "çözülemeyen yan-etki import '@/app/nope.css' (yazma yok)", header + "import '@/app/nope.css';\nexport async function x(id: string) {\n" + ro + '  return id;\n}\n'],
  ['X5', 'F', "var olan json '@/contracts/…json'", header + "import j from '@/i18n/../../package.json';\nexport async function x(id: string) {\n" + ro + '  return j;\n}\n'],
  ['X6', 'F', 'çözülemeyen, ama yalnız tip import', header + "import type { Foo } from '@/lib/i89/missing';\nexport async function x(id: string, f?: Foo) {\n" + ro + '  return id;\n}\n'],
  ['X7', 'M', 'çözülemeyen ad-alanı import * as ns', header + "import * as ns from '@/lib/i89/missing';\nexport async function x(id: string) {\n" + ro + '  await ns.anything(id);\n}\n'],
  ['X8', 'F', 'çözülemeyen import VAR ama readOnly action onu çağırmıyor', header + "import { wipe } from '@/lib/i89/missing';\nexport async function x(id: string) {\n" + ro + '  return id;\n}\nexport const _k = wipe;\n'],
  ['P1', 'M', "'#i89/…' package.json imports alias'ı (bundler çözer)", stat('#i89/legacy2')],
];
it('İNCELEME-89 probes', () => {
  const out: string[] = [];
  let bad = 0;
  for (const [id, exp, cls, src] of rows) {
    let red: boolean | null = null;
    let res: string;
    try {
      const { findings } = findingsFor(file, src);
      red = findings.length > 0;
      res = red ? 'KIRMIZI  ' + findings.map((f) => f.problem).join(' | ').slice(0, 260) : 'YEŞİL';
    } catch (e) {
      res = 'HATA ' + String(e).slice(0, 200);
    }
    const ok = red === (exp === 'M');
    if (!ok) bad++;
    out.push(`${ok ? 'ok ' : 'XX '} ${id.padEnd(4)} [${exp === 'M' ? 'KIRMIZI bekl.' : 'YEŞİL bekl.'}] ${cls.padEnd(58)} → ${res}`);
  }
  out.push(`beklenenden sapan: ${bad}/${rows.length}`);
  fs.writeFileSync(process.env.OUT ?? '/dev/null', out.join('\n') + '\n');
});
