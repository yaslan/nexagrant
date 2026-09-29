import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

/**
 * Models that carry a credential or a credential's verifier are read with an
 * explicit `select` wherever the result can reach the browser
 * (TASK-MUMT3KVHJTYX0, İNCELEME-23 Ö-2).
 *
 * `settings/calendar/page.tsx` read `CalendarConnection` without one and
 * handed the rows to a client component, so `accessToken`/`refreshToken`
 * travelled in the RSC payload. A server component's props and a server
 * action's return value are both serialised to the client, so in those files a
 * whole-row read of one of these models is refused outright; the `select` is
 * the reviewable list of what leaves the server.
 *
 * What counts as a `select` (İNCELEME-29 Ö-1, TASK-MUN2TQ1W6WP8E): an object
 * literal, or an UPPER_SNAKE `*_SELECT` constant declared as an object literal
 * in the same file. `select: undefined` or `select: cond ? … : …` is a whole-row
 * read to Prisma and is refused, and so is a select that names a secret column
 * (`accessToken: true`) unless SECRET_SELECT_ALLOWLIST says why.
 *
 * Relations (İNCELEME-29 B-1): `include: { applicationParts: true }` and
 * `include: { applicationParts: { where/orderBy/include … } }` both return the
 * whole rows; the relation's own object must carry a `select`. Relation filters
 * (`some`/`every`/`none`/`is`/`isNot`) and nested writes (`create`, `connect`, …)
 * are not reads and are skipped.
 *
 * Scope: every file under src/app (route segments and the server components
 * beside them, İNCELEME-29 Ö-3) and every `'use server'` module. Library helpers
 * that need the secret (src/lib/calendar/sync.ts, src/lib/api-auth.ts) are
 * outside it on purpose.
 *
 * Known blind spots (İNCELEME-29 Ö-2) — a text scan cannot see these, and none
 * of them occurs in src/ today; tests/secret-model-props.test.tsx is the
 * runtime half of this pin and catches what reaches a client prop or action
 * result through them:
 *   - bracket access `tx['calendarConnection'].findMany(…)`,
 *   - an aliased delegate `const cc = tx.calendarConnection; cc.findMany(…)`,
 *   - optional chaining `tx.calendarConnection?.findMany(…)`,
 *   - raw SQL (`$queryRaw`) and `aggregate({ _max: { accessToken: true } })`,
 *   - a relation whose arguments are a variable (`applicationParts: partArgs`),
 *   - a whole row returned from a src/lib helper to a component.
 */

/** Prisma accessor → the secret columns on that model. */
const SECRET_MODELS: Record<string, string[]> = {
  calendarConnection: ['accessToken', 'refreshToken'],
  account: ['access_token', 'refresh_token', 'id_token'],
  session: ['sessionToken'],
  verificationToken: ['token'],
  apiKey: ['keyHash'],
  invitation: ['tokenHash'],
  applicationPart: ['magicTokenHash'],
  agencyInviteCode: ['codeHash'],
};

/** Relation fields that pull the same rows in through `include`/`select` → their model. */
const SECRET_RELATIONS: Record<string, string> = {
  calendarConnections: 'calendarConnection',
  accounts: 'account',
  sessions: 'session',
  apiKeys: 'apiKey',
  invitations: 'invitation',
  applicationParts: 'applicationPart',
  agencyInviteCodes: 'agencyInviteCode',
};

/** Top-level keys that make a relation's object a filter or a nested write, not a read. */
const NOT_A_READ = [
  'some', 'every', 'none', 'is', 'isNot',
  'create', 'createMany', 'connect', 'connectOrCreate', 'disconnect', 'set',
  'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
];

/** Operations that return rows (the `*Many` writes and `count` return numbers). */
const ROW_OPS = [
  'findUniqueOrThrow',
  'findUnique',
  'findFirstOrThrow',
  'findFirst',
  'findMany',
  'createManyAndReturn',
  'create',
  'updateManyAndReturn',
  'update',
  'upsert',
  'delete',
];

/**
 * Selects that name a secret column on purpose, each with the reason it stays
 * on the server. Keyed `file::model.column`; a new entry needs a reviewer.
 * The partner portal resolves a part by its token and compares the hash with
 * secretTokenMatches(); nothing on that page is a client component, and
 * addBudgetLineByToken returns only `{ success }`.
 */
const SECRET_SELECT_ALLOWLIST: Record<string, string> = {
  'src/app/[locale]/portal/partner/[token]/page.tsx::applicationPart.magicTokenHash':
    'timing-safe comparison in generateMetadata and the page; no client component on the page',
  'src/modules/m11/server/actions.ts::applicationPart.magicTokenHash':
    'addBudgetLineByToken compares the hash and returns { success } only',
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** Blanks out `/* … *​/` and `// …` so prose cannot trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function isUseServerModule(code: string): boolean {
  return /^\s*['"]use server['"]/.test(code);
}

/** Index just past the string or template literal that opens at `i`. */
function skipString(code: string, i: number): number {
  const quote = code[i];
  for (i++; i < code.length && code[i] !== quote; i++) if (code[i] === '\\') i++;
  return i + 1;
}

/**
 * The bracketed text that opens at `open` — `(…)`, `{…}` or `[…]`, brackets
 * included — or null if unbalanced. Strings are skipped so a `)` inside one is
 * not counted.
 */
function balanced(code: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(code, i) - 1;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return null;
}

/** The argument text of the call whose `(` is at `open`, or null if unbalanced. */
function callArgument(code: string, open: number): string | null {
  const text = balanced(code, open);
  return text === null ? null : text.slice(1, -1);
}

/**
 * The value text of `key:` at the top level of the object literal `obj` (not
 * nested), or null if `obj` is not a literal or has no such key.
 */
function topLevelValue(obj: string, key: string): string | null {
  const text = obj.trim();
  if (!text.startsWith('{')) return null; // a variable: cannot be verified
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(text, i) - 1;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (depth === 1 && /[\s,{]/.test(text[i - 1] ?? '')) {
      const head = new RegExp(`^${key}\\s*:\\s*`).exec(text.slice(i));
      if (!head) continue;
      const start = i + head[0].length;
      let d = 0;
      let j = start;
      for (; j < text.length; j++) {
        const v = text[j];
        if (v === '"' || v === "'" || v === '`') {
          j = skipString(text, j) - 1;
          continue;
        }
        if (v === '{' || v === '(' || v === '[') d++;
        else if (v === '}' || v === ')' || v === ']') {
          if (d === 0) break;
          d--;
        } else if (v === ',' && d === 0) break;
      }
      return text.slice(start, j).trim();
    }
  }
  return null;
}

/**
 * Why the read `arg` of `model` may carry a secret to the caller, or null when
 * it is a select that leaves every secret column out.
 */
function selectProblem(arg: string | null, model: string, code: string, file: string): string | null {
  const value = arg === null ? null : topLevelValue(arg, 'select');
  if (value === null) return 'without select';
  let fields = value;
  if (!value.startsWith('{')) {
    const constant = /^[A-Z][A-Z0-9_]*_SELECT$/.test(value)
      ? new RegExp(`\\bconst\\s+${value}\\b[^=]*=\\s*\\{`).exec(code)
      : null;
    const literal = constant ? balanced(code, constant.index + constant[0].length - 1) : null;
    if (literal === null) return `select: ${value} is not an object literal or a local *_SELECT constant`;
    fields = literal;
  }
  for (const column of SECRET_MODELS[model] ?? []) {
    const picked = topLevelValue(fields, column);
    if (picked === null || picked === 'false') continue;
    if (SECRET_SELECT_ALLOWLIST[`${file}::${model}.${column}`]) continue;
    return `select names ${column}`;
  }
  return null;
}

interface Offence {
  file: string;
  what: string;
}

/** Every read of a secret model, direct or through a relation, that can hand a secret column back. */
export function findOffences(code: string, file: string): Offence[] {
  const offences: Offence[] = [];
  const lineOf = (index: number | undefined) => code.slice(0, index).split('\n').length;

  const call = new RegExp(`\\.\\s*(${Object.keys(SECRET_MODELS).join('|')})\\s*\\.\\s*(${ROW_OPS.join('|')})\\s*\\(`, 'g');
  for (const m of code.matchAll(call)) {
    const model = m[1] ?? '';
    const open = (m.index ?? 0) + m[0].length - 1;
    const problem = selectProblem(callArgument(code, open), model, code, file);
    if (problem) {
      offences.push({
        file,
        what: `${model}.${m[2]} ${problem} (line ${lineOf(m.index)}; exposes ${SECRET_MODELS[model]?.join(', ')})`,
      });
    }
  }

  const relation = new RegExp(`\\b(${Object.keys(SECRET_RELATIONS).join('|')})\\s*:\\s*(true\\b|\\{)`, 'g');
  for (const m of code.matchAll(relation)) {
    const model = SECRET_RELATIONS[m[1] ?? ''] ?? '';
    let problem: string | null;
    if (m[2] === 'true') {
      problem = 'is true — use { select: … }';
    } else {
      const obj = balanced(code, (m.index ?? 0) + m[0].length - 1);
      if (obj !== null && NOT_A_READ.some((key) => topLevelValue(obj, key) !== null)) continue;
      problem = selectProblem(obj, model, code, file);
    }
    if (problem) {
      offences.push({ file, what: `relation ${m[1]} ${problem} (line ${lineOf(m.index)})` });
    }
  }
  return offences;
}

describe('secret-bearing models are read with select where the result reaches the client', () => {
  it('src/app files and server actions never read a secret model without select', () => {
    const scanned: string[] = [];
    const offences: Offence[] = [];
    for (const full of sourceFiles(SRC_DIR)) {
      const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
      const code = stripComments(fs.readFileSync(full, 'utf-8'));
      if (!rel.startsWith('src/app/') && !isUseServerModule(code)) continue;
      scanned.push(rel);
      offences.push(...findOffences(code, rel));
    }

    // The scan must actually be looking at the files these cards fixed.
    expect(scanned).toContain('src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx');
    expect(scanned).toContain('src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts');
    expect(scanned).toContain('src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/page.tsx');
    expect(scanned).toContain('src/modules/m11/server/actions.ts');
    expect(offences.map((o) => `${o.file}: ${o.what}`)).toEqual([]);
  });

  it('the allowlist names only entries that still exist', () => {
    for (const key of Object.keys(SECRET_SELECT_ALLOWLIST)) {
      const [file, field] = key.split('::');
      const column = field?.split('.')[1];
      const code = stripComments(fs.readFileSync(path.join(REPO_ROOT, file ?? ''), 'utf-8'));
      expect(new RegExp(`\\b${column}\\s*:\\s*true\\b`).test(code), key).toBe(true);
    }
  });

  // The detector itself: each of these is a shape the scan has to call.
  // E1–E11 are the escapes İNCELEME-29 (TASK-MUN2AMIFGBQ90) found; the ones a
  // text scan cannot see are listed as blind spots at the top of this file.
  it.each([
    ['whole-row findMany', 'tx.calendarConnection.findMany({ where: { tenantId, userId } })', 1],
    ['multi-line call', 'tx\n  .calendarConnection\n  .findMany({\n    where: { tenantId },\n  })', 1],
    ['select nested under include only', 'tx.applicationPart.findFirst({ where: { id }, include: { opportunity: { select: { title: true } } } })', 1],
    ['arguments in a variable', 'tx.apiKey.findMany(args)', 1],
    ['no arguments', 'tx.invitation.findMany()', 1],
    ['create returning the row', 'tx.apiKey.create({ data: { keyHash } })', 1],
    ['relation include', 'tx.opportunity.findFirst({ include: { applicationParts: true } })', 1],
    ['E1 relation include with orderBy', "tx.opportunity.findFirst({ where: { id }, include: { applicationParts: { orderBy: { createdAt: 'asc' } } } })", 1],
    ['E2 relation include with where', "tx.user.findUnique({ where: { id }, include: { accounts: { where: { provider: 'google' } } } })", 1],
    ['relation with select: undefined', 'tx.opportunity.findFirst({ include: { applicationParts: { select: undefined } } })', 1],
    ['relation select naming the secret', 'tx.opportunity.findFirst({ include: { applicationParts: { select: { id: true, magicTokenHash: true } } } })', 1],
    ['relation under an outer select', 'tx.tenant.findFirst({ select: { id: true, invitations: true } })', 1],
    ['E6 select: undefined', 'tx.calendarConnection.findMany({ where: { tenantId }, select: undefined })', 1],
    ['E7 conditional select', 'tx.calendarConnection.findMany({ select: full ? undefined : { id: true } })', 1],
    ['E8 select naming the secret', 'tx.calendarConnection.findMany({ select: { id: true, accessToken: true } })', 1],
    ['select constant naming the secret', 'const CAL_SELECT = { id: true, refreshToken: true };\ntx.calendarConnection.findMany({ select: CAL_SELECT })', 1],
    ['select constant not in this file', 'tx.apiKey.findMany({ select: IMPORTED_SELECT })', 1],
    ['select in a lower-case variable', 'tx.apiKey.findMany({ select: pick })', 1],
    ['E11 relation select with nested include', 'tx.opportunity.findFirst({ include: { applicationParts: { include: { opportunity: true } } } })', 1],
    ['secret on another model is not this one', 'tx.opportunity.findFirst({ select: { id: true, keyHash: true } })', 0],
    ['select present', 'tx.calendarConnection.findMany({ where: { tenantId }, select: { id: true } })', 0],
    ['select naming the secret as false', 'tx.calendarConnection.findMany({ select: { id: true, accessToken: false } })', 0],
    ['local select constant', 'const PART_ROW_SELECT = { id: true, content: true } as const;\ntx.applicationPart.findFirst({ select: PART_ROW_SELECT })', 0],
    ['relation with select', "tx.opportunity.findFirst({ include: { applicationParts: { select: { id: true }, orderBy: { createdAt: 'asc' } } } })", 0],
    ['relation filter', 'tx.opportunity.findMany({ where: { applicationParts: { some: { part: "PART_A" } } }, select: { id: true } })', 0],
    ['nested write', 'tx.tenant.update({ where: { id }, data: { invitations: { create: { email } } }, select: { id: true } })', 0],
    ['select on create', 'tx.apiKey.create({ data: { keyHash }, select: { id: true } })', 0],
    ['string containing a paren', "tx.apiKey.findFirst({ where: { name: ')' }, select: { id: true } })", 0],
    ['count-returning write', 'tx.calendarConnection.deleteMany({ where: { userId } })', 0],
    ['other model', 'tx.opportunity.findMany({ where: { tenantId } })', 0],
  ])('%s', (_name, code, expected) => {
    expect(findOffences(code, 'fixture.ts')).toHaveLength(expected);
  });
});
