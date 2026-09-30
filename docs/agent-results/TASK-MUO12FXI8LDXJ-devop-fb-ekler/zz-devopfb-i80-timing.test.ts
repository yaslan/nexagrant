import fs from 'fs';
import path from 'path';
import { it } from 'vitest';
import { findingsFor } from './server-action-rbac-guard.test';
it('timing', () => {
  const SRC = path.join(__dirname, '..', 'src');
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '__tests__') walk(f); } else if (/\.tsx?$/.test(e.name) && !/\.test\.|\.spec\.|\.d\.ts$/.test(e.name)) files.push(f); } };
  walk(SRC);
  const out: string[] = [];
  for (let run = 1; run <= 3; run++) {
    const c0 = process.cpuUsage(); const t0 = performance.now(); let n = 0; let keys = 0; let fnd = 0;
    for (const f of files) { const text = fs.readFileSync(f, 'utf8'); if (!/['"]use server['"]/.test(text)) continue; n++; const r = findingsFor(path.relative(SRC, f).split(path.sep).join('/'), text, {}); keys += r.keys.length; fnd += r.findings.length; }
    const c = process.cpuUsage(c0);
    out.push(`scan#${run}: files=${n} keys=${keys} findings=${fnd} wall=${(performance.now() - t0).toFixed(0)}ms cpu=${((c.user + c.system) / 1000).toFixed(0)}ms (NO_OVERLAY yerine {} → önbelleksiz)`);
  }
  out.push(`src ts/tsx files=${files.length}`);
  fs.writeFileSync(process.env.OUT ?? '/dev/null', out.join('\n') + '\n');
});
