// İNCELEME-118: çalışma anı probe dosyalarında bekçinin hükmü. Kullanım: tsx scan-probe118.mts <tarayıcı yolu>  (cwd = worktree)
import { readFileSync } from 'node:fs';
const { actionReturnFindings, fsModuleReader } = await import(process.argv[2]!);
const read = fsModuleReader(process.cwd());
for (const f of ['let-actions', 'req-actions', 'modreq-actions', 'creq-actions', 'reqas-actions'].map((n) => `src/app/probe116/${n}.ts`))
  console.log(f.padEnd(34), JSON.stringify(actionReturnFindings(readFileSync(f, 'utf8'), f, read).map((x: { line: number; via: string }) => [x.line, x.via])));
