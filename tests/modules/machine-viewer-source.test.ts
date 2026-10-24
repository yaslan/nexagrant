/**
 * FO-86 review §2 (TASK-MVDV63H2OCK0, Ö2) — a `MachineViewer` literal is built in one
 * place only: the API-key viewer in src/lib/api-auth.ts. A second `kind: 'machine'`
 * object elsewhere would open PILOT to a caller that is not an API key, and the type
 * check cannot tell, because the shape is valid. The interface declaration in
 * state-machine.ts ends in `;`, not `,` or `}`, so it is a type, not a literal, and is not counted.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, test, expect } from 'vitest';

const MACHINE_LITERAL = /\bkind:\s*'machine'\s*[,}]/;

/** Comments are dropped, so a doc comment that quotes the literal does not count. */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The files (repo-relative, `/`-separated) whose code holds a `kind: 'machine'` object literal. */
function machineLiteralSites(files: Array<[string, string]>): string[] {
  return files
    .filter(([, src]) => MACHINE_LITERAL.test(codeOf(src)))
    .map(([path]) => path);
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, '..', '..');

describe('a MachineViewer is built only by the API-key viewer', () => {
  test("kind: 'machine' appears in src/ only in src/lib/api-auth.ts", () => {
    const files = tsFiles(join(root, 'src')).map((f): [string, string] => [
      relative(root, f).split(sep).join('/'),
      readFileSync(f, 'utf8'),
    ]);
    expect(machineLiteralSites(files)).toEqual(['src/lib/api-auth.ts']);
  });

  test('a second literal in another file is caught (red fixture)', () => {
    const sites = machineLiteralSites([
      ['src/lib/api-auth.ts', "const V = { kind: 'machine', role: 'API_KEY', isPlatformAdmin: false, isMachine: true };"],
      [
        'src/app/x/page.tsx',
        "const forged = { kind: 'machine', role: 'TENANT_MEMBER', isPlatformAdmin: false, isMachine: true };",
      ],
    ]);
    expect(sites).toEqual(['src/lib/api-auth.ts', 'src/app/x/page.tsx']);
  });

  test('the interface declaration and a comment quoting the literal are not counted', () => {
    const sites = machineLiteralSites([
      ['src/lib/modules/state-machine.ts', "export interface M {\n  kind: 'machine';\n}"],
      ['src/lib/modules/doc.ts', "// a viewer with kind: 'machine', built elsewhere\nexport const x = 1;"],
    ]);
    expect(sites).toEqual([]);
  });
});
