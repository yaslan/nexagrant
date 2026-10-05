import { readFileSync } from 'node:fs';
import { actionReturnFindings, fsModuleReader } from '../../../tests/api/action-leak-scan.ts';
const F = 'src/modules/m6/server/actions.ts';
const t0 = performance.now();
console.log(JSON.stringify(actionReturnFindings(readFileSync(F, 'utf8'), F, fsModuleReader(process.cwd())), null, 1), Math.round(performance.now() - t0), 'ms');
