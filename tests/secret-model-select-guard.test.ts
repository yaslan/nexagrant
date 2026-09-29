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
 * Scope: route-segment files under src/app (page, layout, template, default,
 * route, not-found, error) and every `'use server'` module. Library helpers
 * that need the secret (src/lib/calendar/sync.ts, src/lib/api-auth.ts) are
 * outside it on purpose. The runtime half of this pin is
 * tests/secret-model-props.test.tsx.
 */

/** Prisma accessor → the secret columns on that model (for the report only). */
const SECRET_MODELS: Record<string, string> = {
  calendarConnection: 'accessToken, refreshToken',
  account: 'access_token, refresh_token, id_token',
  session: 'sessionToken',
  verificationToken: 'token',
  apiKey: 'keyHash',
  invitation: 'tokenHash',
  applicationPart: 'magicTokenHash',
  agencyInviteCode: 'codeHash',
};

/** Relation fields that pull the same rows in through `include`. */
const SECRET_RELATIONS = [
  'calendarConnections',
  'accounts',
  'sessions',
  'apiKeys',
  'invitations',
  'applicationParts',
  'agencyInviteCodes',
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
 * Relation includes that are allowed without `select`, each with the line that
 * makes it safe. Keep this list short; a new entry needs a reviewer.
 */
const RELATION_INCLUDE_ALLOWLIST: Record<string, string> = {
  'src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/page.tsx::applicationParts':
    'magicTokenHash is destructured off every part before <ApplicationClient> (hasPortalLink only)',
};

const ROUTE_FILE = /^(page|layout|template|default|route|not-found|error)\.(ts|tsx)$/;

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

/**
 * The argument text of the call whose `(` is at `open`, or null if unbalanced.
 * Strings and template literals are skipped so a `)` inside one is not counted.
 */
function callArgument(code: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i++; i < code.length && code[i] !== quote; i++) if (code[i] === '\\') i++;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

/** Whether the object literal `arg` has `key:` at its own top level (not nested). */
function hasTopLevelKey(arg: string, key: string): boolean {
  const trimmed = arg.trim();
  if (!trimmed.startsWith('{')) return false; // a variable: cannot be verified
  let depth = 0;
  let topLevel = '';
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i++; i < trimmed.length && trimmed[i] !== quote; i++) if (trimmed[i] === '\\') i++;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      if (depth === 1) continue;
    } else if (c === '}' || c === ')' || c === ']') {
      depth--;
      continue;
    }
    if (depth === 1) topLevel += c;
  }
  return new RegExp(`(^|[\\s,{])${key}\\s*:`).test(topLevel);
}

interface Offence {
  file: string;
  what: string;
}

/** Every whole-row read of a secret model, and every select-less include of one, in `code`. */
export function findOffences(code: string, file: string): Offence[] {
  const offences: Offence[] = [];
  const call = new RegExp(`\\.\\s*(${Object.keys(SECRET_MODELS).join('|')})\\s*\\.\\s*(${ROW_OPS.join('|')})\\s*\\(`, 'g');
  for (const m of code.matchAll(call)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const arg = callArgument(code, open);
    if (arg === null || !hasTopLevelKey(arg, 'select')) {
      const line = code.slice(0, m.index).split('\n').length;
      offences.push({ file, what: `${m[1]}.${m[2]} without select (line ${line}; exposes ${SECRET_MODELS[m[1] ?? '']})` });
    }
  }
  const include = new RegExp(`\\b(${SECRET_RELATIONS.join('|')})\\s*:\\s*true\\b`, 'g');
  for (const m of code.matchAll(include)) {
    if (RELATION_INCLUDE_ALLOWLIST[`${file}::${m[1]}`]) continue;
    const line = code.slice(0, m.index).split('\n').length;
    offences.push({ file, what: `${m[1]}: true in include (line ${line}) — use { select: … }` });
  }
  return offences;
}

describe('secret-bearing models are read with select where the result reaches the client', () => {
  it('route-segment files and server actions never read a secret model without select', () => {
    const scanned: string[] = [];
    const offences: Offence[] = [];
    for (const full of sourceFiles(SRC_DIR)) {
      const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
      const code = stripComments(fs.readFileSync(full, 'utf-8'));
      const inScope = (rel.startsWith('src/app/') && ROUTE_FILE.test(path.basename(full))) || isUseServerModule(code);
      if (!inScope) continue;
      scanned.push(rel);
      offences.push(...findOffences(code, rel));
    }

    // The scan must actually be looking at the files this card fixed.
    expect(scanned).toContain('src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx');
    expect(scanned).toContain('src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts');
    expect(scanned).toContain('src/modules/m11/server/actions.ts');
    expect(offences.map((o) => `${o.file}: ${o.what}`)).toEqual([]);
  });

  it('the allowlist names only entries that still exist', () => {
    for (const key of Object.keys(RELATION_INCLUDE_ALLOWLIST)) {
      const [file, relation] = key.split('::');
      const code = stripComments(fs.readFileSync(path.join(REPO_ROOT, file ?? ''), 'utf-8'));
      expect(new RegExp(`\\b${relation}\\s*:\\s*true\\b`).test(code), key).toBe(true);
    }
  });

  // The detector itself: each of these is a shape the scan has to call.
  it.each([
    ['whole-row findMany', 'tx.calendarConnection.findMany({ where: { tenantId, userId } })', 1],
    ['multi-line call', 'tx\n  .calendarConnection\n  .findMany({\n    where: { tenantId },\n  })', 1],
    ['select nested under include only', 'tx.applicationPart.findFirst({ where: { id }, include: { opportunity: { select: { title: true } } } })', 1],
    ['arguments in a variable', 'tx.apiKey.findMany(args)', 1],
    ['no arguments', 'tx.invitation.findMany()', 1],
    ['create returning the row', 'tx.apiKey.create({ data: { keyHash } })', 1],
    ['relation include', 'tx.opportunity.findFirst({ include: { applicationParts: true } })', 1],
    ['select present', 'tx.calendarConnection.findMany({ where: { tenantId }, select: { id: true } })', 0],
    ['select on create', 'tx.apiKey.create({ data: { keyHash }, select: { id: true } })', 0],
    ['string containing a paren', "tx.apiKey.findFirst({ where: { name: ')' }, select: { id: true } })", 0],
    ['count-returning write', 'tx.calendarConnection.deleteMany({ where: { userId } })', 0],
    ['other model', 'tx.opportunity.findMany({ where: { tenantId } })', 0],
  ])('%s', (_name, code, expected) => {
    expect(findOffences(code, 'fixture.ts')).toHaveLength(expected);
  });
});
