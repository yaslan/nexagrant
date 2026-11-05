import fs from 'fs';
import { isBuiltin } from 'module';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'src');

/**
 * TASK-MUN80UOUPB2A4 (FB GÜVENLİK Y-3) + TASK-MUN4H2RL79D8B (se-fb Ö-4) — the
 * two things a server action must say about itself, checked statically.
 *
 * 1. A write names its permission. Every exported function of a 'use server'
 *    module — and every function with an inline 'use server' — is a public
 *    POST endpoint. `requireTenantAction` makes it a write by default (the
 *    pilot gate fails closed), and a write must also check the caller's role
 *    against src/lib/rbac.ts. 52 write actions once checked nothing but the
 *    tenant, so a MEMBER could evaluate gates, delete evidence and rewrite
 *    concept notes.
 * 2. `readOnly: true` means it. The flag skips the expired-pilot gate, so an
 *    action marked read-only that writes is a write an expired pilot can still
 *    make (m11 `updatePresenceHeartbeat` did, TASK-MUN4H2RL79D8B N-2).
 *
 * TASK-MUNQAXELV83HO (İNCELEME-59 Y-1): the first version counted any `can`
 * anywhere as "role checked" and matched writes only on `prisma|tx|db`, and 8
 * of se-fb's 10 mutants passed it — `updateRelationship` itself shipped with a
 * `can` that only ran for one field (B-1). A role check counts only in a shape
 * that stops the action:
 *
 *   - a statement that is the check itself: `await requireTenantAction({ can:
 *     '<Action>' })`, `assertTenantActionRole(scope, '<Action>')`, `await
 *     requirePlatformAdmin()`, alone or as a declaration's initializer. Not
 *     behind `void`, `.catch`/`.then`, `?.`, `&&`, `||`, `?:`, not as another
 *     call's argument, not inside a callback, and an async check is awaited;
 *   - `if (!<check>(…)) return|throw` with no `else`, where <check> is one of
 *     BOOLEAN_CHECKS (`||` of such conditions, or `&&` of all of them, too);
 *   - a call to a same-file helper whose body does one of the above before it
 *     can return: a helper that may `return` first, that refuses by returning
 *     instead of throwing, or that swallows the refusal in a `catch`, checks
 *     nothing for its caller.
 *
 * TASK-MUNSRKW0HJYBV (İNCELEME-63 Y-A/Y-B, se-fb N1–N14 and G5):
 *
 *   - a check is a check only when its name is imported from the module that
 *     defines it (CHECK_SOURCES) — a same-file `can` that answers yes is not;
 *   - a check inside `try` covers what follows the `try` only when every
 *     `catch` leaves (a helper's catch must rethrow);
 *   - parameter defaults are walked (they run before the body);
 *   - a function referenced rather than called (`withTenant(t, wipeTx)`) is
 *     walked where it is referenced;
 *   - calls are followed into imported functions of src/, up to MAX_DEPTH
 *     modules deep — a readOnly action must not reach a write in any module,
 *     and a write action must not reach one before its check. The modules that
 *     implement tenancy and the checks themselves (TRUSTED) are not entered:
 *     they are what the actions are checked against;
 *   - the anonymous `export default` is scanned, and an exported value that is
 *     not a function the guard can read is refused.
 *
 * TASK-MUNY0V7B590EI (İNCELEME-74 Y-1/Y-2, D-1..D-3; crw-fb R1–R8, S1–S8,
 * W1–W9, E4, D1/D2, L7+):
 *
 *   - imports are resolved through what a module exports again: `import { x };
 *     export { x }`, `export default x`, `export const a = x`, `export * as
 *     ns`, `ns['x']`, `const { x } = ns`, `await import('<literal>')`. Values
 *     are walked whole where they are referenced: `export const x =
 *     wrap(async …)`, an object of methods, a class, `const helpers = { … }`;
 *   - fail-closed: a name of a src/ module the guard cannot resolve stands for
 *     the whole module, and a call past MAX_DEPTH is itself a finding (for a
 *     readOnly action anywhere, for a write action before its check);
 *   - a specifier into src/ is one of a relative path or any alias tsconfig
 *     `paths` or package.json `imports` declares, not only `@/` (İNCELEME-89
 *     Y-4); an alias into src/ with more than one target is fail-closed, and a
 *     config the guard does not read (`extends`, `exports`) fails the suite.
 *     A bare specifier is resolved in the order `paths`, then tsconfig
 *     `baseUrl`, then `imports`, then node_modules, each step only when the
 *     one before names no file. tsc (5.9, bundler) is narrower: once a `paths`
 *     key matches, it goes straight to node_modules (İNCELEME-101 B-2); the
 *     guard reads on, which is stricter — tsc then fails the typecheck with
 *     TS2307 anyway. Each file's key is picked by its own
 *     rule (Node's longer key on an equal prefix; tied `paths` keys are
 *     fail-closed), so `baseUrl` + `'src/lib/x'` is walked and a catch-all
 *     `"*": ["./src/*"]` leaves `zod` a package (İNCELEME-97 Y-1/Y-2/B-1,
 *     TASK-MUOACFUBMNOGQ);
 *   - the role a check is asked about must come from the session: `role` /
 *     `scope.role` / `s?.role` / `asRole(…)` of one, bound by a `const` that is
 *     never written to, from `requireTenantAction()` / `requireTenantApi()` /
 *     `auth()` / `tenantScopeOf(<session>)` / a same-file helper that returns
 *     only those — or a helper parameter its caller filled so. An argument of
 *     the action, a role written in the code (`'TENANT_OWNER'`, `Role.X`,
 *     `R.X`, a template, `x || role`), a `let`, a destructuring default: no
 *     check. `assertTenantActionRole(scope, …)` and `isPlatformAdminSession(s)`
 *     are held to the same rule for their first argument;
 *   - a check or helper name that a local or a parameter shadows is not it;
 *   - a nested function declaration is walked where it is called (it is
 *     hoisted), with the checks that hold there;
 *   - a write method taken as a value (`const del = tx.x.deleteMany`, `.call`,
 *     `Reflect.apply`, `const { deleteMany } = tx.x`), a method name the guard
 *     cannot read (`tx.x[m]`), a `$queryRaw*` whose SQL it cannot read, and a
 *     model accessor handed to a function (`f(tx.evidence)`) all count as
 *     writes.
 *
 * TASK-MUO4GP1P89HS7 (İNCELEME-80 Y-1/Y-2/Ö-1, se-fb Y-3):
 *
 *   - every file the build compiles is a source: `.js`/`.jsx`/`.mjs`/`.cjs`/
 *     `.mts`/`.cts` too (tsconfig `allowJs`), scanned for 'use server' and
 *     resolved like TS does (`./x.js` → `x.ts`, `./x.mjs` → `x.mts`); each is
 *     parsed as what it is, so a `.ts` file's `<T>expr` is not read as JSX;
 *   - an `@/` or relative specifier is normalized, and one that names no file
 *     under src/ is a write the guard cannot see past (fail-closed), not a
 *     package;
 *   - a constant `import('<spec>')` into src/ is followed by name only as a
 *     member (`(await import(x)).f`) or a `const` in a function holding it or
 *     destructuring it flat; any other shape (`?:`, `Promise.all`, a
 *     top-level `const`, nested destructuring, `let`, a callback) and every
 *     constant `require('<spec>')` stand for the whole module;
 *   - what a function or value reached from an action writes is walked once
 *     per depth and reused for every caller (a check before the call only
 *     moves its writes out of "unchecked"), unless a recursion stop outside
 *     that walk cut it short.
 *
 * `<Action>` must be a literal (or a same-file `const`) that rbac.ts declares.
 * Every write must come after such a check on its own path: a check inside a
 * `withTenant` callback covers the writes after it in that callback only, and
 * one inside an `if` block covers only that block.
 *
 * A write is `<anything>.<model>.<write method>(…)` or `<model>.<write
 * method>(…)` for a model of prisma/schema.prisma (so `(t) =>`, a destructured
 * `{ evidence }`, `prisma as client`, `tx['evidence']` and `const ev =
 * tx.evidence` are all seen), plus `$executeRaw*` and a `$queryRaw*` whose SQL
 * writes, in call or tagged-template form, and the shapes above.
 *
 * What stays out of reach, for the behaviour tests
 * (tests/server-action-rbac.test.ts) and review:
 *   - a model accessor kept in an object or a collection (`{ ev: tx.evidence
 *     }`, `[tx.evidence]`) or chosen at run time (`tx[model].deleteMany`);
 *   - `require()` / `import()` of a computed specifier, `eval`, getters, Proxies;
 *   - a session object mutated through a call (`Object.assign(scope, …)`) or
 *     through another alias of it;
 *   - what TRUSTED modules do — they are what the actions are checked against.
 * An action that answers to something other than a tenant role goes in ALLOWED
 * with the reason.
 */

/** The permissions src/lib/rbac.ts declares. A `can` naming anything else is not a check. */
const RBAC_ACTIONS = new Set(
  [
    ...fs
      .readFileSync(path.join(SRC, 'lib/rbac.ts'), 'utf8')
      .match(/export type Action =([^;]*);/)![1]!
      .matchAll(/["']([a-z_]+)["']/g),
  ].map(([, name]) => name!),
);

/** Prisma model accessors (`tx.evidence`, `{ evidence }`), from the schema. */
const MODELS = new Set(
  [...fs.readFileSync(path.join(REPO_ROOT, 'prisma/schema.prisma'), 'utf8').matchAll(/^model (\w+) \{/gm)].map(
    ([, name]) => name!.charAt(0).toLowerCase() + name!.slice(1),
  ),
);

/** Checks that answer yes/no. They count only as `if (!check(…)) return|throw`. */
const BOOLEAN_CHECKS = new Set([
  'can',
  'isPlatformAdminSession',
  // Owner-or-pipeline-role rule, src/lib/pipeline/archive.ts.
  'canArchiveOpportunity',
  // manage_approvals rule for confirming a seat, src/modules/m8/server/seat-transitions.ts.
  'canConfirmSeat',
]);

/**
 * Where each check is defined (module under src/, no extension). A check counts
 * only when the name is imported from there, so a same-file stand-in (se-fb
 * N3) is just another function.
 */
const CHECK_SOURCES: Record<string, string> = {
  can: 'lib/rbac',
  requireTenantAction: 'lib/tenant',
  assertTenantActionRole: 'lib/tenant',
  requirePlatformAdmin: 'lib/tenant',
  isPlatformAdminSession: 'lib/tenant',
  canArchiveOpportunity: 'lib/pipeline/archive',
  canConfirmSeat: 'modules/m8/server/seat-transitions',
};

/**
 * Where the caller's session comes from (İNCELEME-74 Y-2): the role a check is
 * asked about must be read from one of these. `tenantScopeOf` reads the session
 * it is given, so its argument must be one too.
 */
const SESSION_SOURCES: Record<string, string> = {
  requireTenantAction: 'lib/tenant',
  requireTenantApi: 'lib/tenant',
  tenantScopeOf: 'lib/tenant',
  auth: 'lib/auth',
};
const SESSION_OF_ARGUMENT = new Set(['tenantScopeOf']);
/** `asRole(x)` is `x` for the check. */
const AS_ROLE: Record<string, string> = { asRole: 'lib/rbac' };

/** Checks that return a promise: they stop the action only when awaited (se-fb N2). */
const ASYNC_CHECKS = new Set(['requireTenantAction', 'requirePlatformAdmin']);

/**
 * Modules the transitive walk does not enter: tenancy (`withTenant`,
 * `withSystemScope`, the session) and the checks themselves. Their own
 * `$executeRaw` sets the RLS tenant, it is not the action writing; a callback
 * handed to them is walked where the action writes it.
 */
const TRUSTED = new Set(['lib/db', 'lib/tenant', 'lib/rbac', 'lib/system-scope', 'lib/auth']);

/** How many modules deep an action's calls are followed (se-fb G5 / N14). */
const MAX_DEPTH = 6;

/** Prisma write methods. */
const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);
const RAW_WRITES = new Set(['$executeRaw', '$executeRawUnsafe']);
const RAW_QUERIES = new Set(['$queryRaw', '$queryRawUnsafe']);
/** SQL that changes data, in a `$queryRaw` (se-fb N9: `DELETE … RETURNING`). */
const SQL_WRITE = /\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke)\b/i;

/**
 * Exported server actions that are neither read-only nor role-checked, and why
 * that is correct. Keyed `path/under/src#name`. A stale entry fails the suite.
 */
export const ALLOWED: Record<string, string> = {
  // No session exists yet, or the caller is signing in/out: there is no role to check.
  'lib/actions/auth.ts#loginWithCredentialsAction': 'sign-in; no session yet',
  'lib/actions/auth.ts#loginWithSocialAction': 'sign-in; no session yet',
  'lib/actions/auth.ts#logoutAction': 'signs the caller out of their own session',
  'app/[locale]/(public)/fon-hazirlik/actions.ts#submitReadinessLead': 'public lead form, no session by design',
  'app/[locale]/(public)/accept-invite/continue/actions.ts#startInvitationSignInAction':
    'invitation sign-in; the invitation token is the credential',
  'app/[locale]/(public)/accept-invite/continue/actions.ts#acceptInvitationAction':
    'joins a tenant by invitation; the role comes from the invitation, the caller has none yet',
  'app/[locale]/(public)/accept-invite/continue/actions.ts#signOutForInvitationAction': 'signs the caller out',
  // Personal data of the caller themself (KVKK/GDPR), not tenant business data.
  'actions/user/export-data.ts#exportUserData': "the caller's own data export (KVKK right of access)",
  'actions/user/request-deletion.ts#requestAccountDeletion': "the caller's own account (KVKK erasure)",
  'actions/user/request-deletion.ts#cancelAccountDeletion': "the caller's own account (KVKK erasure)",
  'actions/user/request-deletion.ts#getDeletionStatus': "reads the caller's own deletion request",
  // ADR-0011 (TASK-MUVR24EHWI2RA): the caller's own read state. Every query is
  // `where { tenantId, userId }` of the session; every role has a bell, and an
  // expired pilot must still be able to clear it, so neither `can` nor the pilot gate.
  'actions/user/notifications.ts#markNotificationsRead': "marks the caller's own notifications read (userId = session user)",
  // Token-authenticated partner portal: no session, no tenant role. Narrow by
  // construction (Part A budget lines only) and pilot-gated on the token's tenant.
  'modules/m11/server/actions.ts#addBudgetLineByToken': 'partner portal; the magic token is the credential',
  // The portal form's inline action only hands the form to addBudgetLineByToken
  // above; an inline action that writes itself is refused regardless of this entry.
  'app/[locale]/(public)/portal/partner/[token]/page.tsx#inline:PartnerPortalPage:1':
    'partner portal form; delegates to addBudgetLineByToken, the token is the credential',
  // Reads that resolve the tenant through pipeline/actions.ts `sessionScope()`
  // rather than `requireTenantAction({ readOnly: true })`.
  'app/[locale]/(app)/[workspace]/pipeline/actions.ts#getOpportunityFormMembers': 'read-only member list',
  'app/[locale]/(app)/[workspace]/pipeline/actions.ts#getSuggestedTopics': 'read-only shared call catalogue',
  // Role checked inline against its own set (TENANT_OWNER/TENANT_ADMIN), and the
  // refusal is a result value the co-brand form shows.
  'app/[locale]/(app)/ajans/cobrand-actions.ts#saveCoBrand': 'EDITOR_ROLES.has(scope.role) — owner/admin only',
};

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Source files the build compiles (TASK-MUO4GP1P89HS7, İNCELEME-80 Y-1):
 * tsconfig has `allowJs` and includes `.mts` files, and the bundler takes
 * `.js`/`.jsx`/`.mjs`/`.cjs`/`.cts` too, so a 'use server' module or a writer
 * in any of them is scanned and walked like a `.ts` one.
 */
const SOURCE_FILE = /\.(tsx?|jsx?|[mc][tj]s)$/;
const NOT_SOURCE = /\.test\.|\.spec\.|\.d\.[mc]?ts$|\.d\.[^.]+\.ts$/;
/** Resolution order for a specifier without an extension (TS `bundler`, then JS). */
const CODE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
/** What an explicit extension may stand for (TS maps `.js` to `.ts`/`.tsx`, `.mjs` to `.mts`). */
const EXT_MAP: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '.ts': ['.ts'],
  '.tsx': ['.tsx'],
  '.mts': ['.mts'],
  '.cts': ['.cts'],
};

/**
 * How the file is parsed. A `.ts` file parsed as TSX reads `<any>tx.x.delete()`
 * as a JSX element and never sees the write (se-fb, TASK-MUO4GP1P89HS7 Y-3),
 * while tsc takes it as a type assertion.
 */
function scriptKindOf(file: string): ts.ScriptKind {
  if (/\.tsx$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.[mc]?ts$/.test(file)) return ts.ScriptKind.TS;
  if (/\.jsx$/.test(file)) return ts.ScriptKind.JSX;
  // `.js` may hold JSX (Next compiles it so); JSX kind reads plain JS the same.
  return ts.ScriptKind.JSX;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') found.push(...sourceFiles(full));
    } else if (SOURCE_FILE.test(entry.name) && !NOT_SOURCE.test(entry.name)) found.push(full);
  }
  return found;
}

function hasDirective(statements: ts.NodeArray<ts.Statement>, directive: string): boolean {
  for (const stmt of statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === directive) return true;
  }
  return false;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);
const hasExport = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

const isFn = (node: ts.Node): node is Fn =>
  ts.isFunctionDeclaration(node) ||
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isMethodDeclaration(node);

/** `(x)`, `x as T`, `x!`, `x satisfies T`, `<T>x` → `x`. */
function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isTypeAssertionExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

/** `unwrap`, and `await x` → `x` too. */
function strip(e: ts.Expression): ts.Expression {
  e = unwrap(e);
  while (ts.isAwaitExpression(e)) e = unwrap(e.expression);
  return e;
}

interface Import {
  /**
   * Module under src/ without extension (`lib/rbac`), null outside src/, or
   * `?<path under src/>` for one that resolves to no file (fail-closed).
   */
  target: string | null;
  /** The name it has there: `default`, `*` for a namespace, or the export name. */
  name: string;
}

interface Module {
  sf: ts.SourceFile;
  /** Module under src/ without extension. */
  id: string;
  /** Normalized specifier bases it imports, to tell whether an overlay can change them. */
  specs: Set<string>;
  /** Top-level functions by name (`default` for an anonymous default export). */
  all: Map<string, Fn>;
  /**
   * Top-level values that are not functions: `const repo = { … }`, `const x =
   * wrap(async …)`, `const w = imported`, classes, enums, `export default <expr>`
   * (İNCELEME-74 R3/R7/R8, W6/W7). Walked whole where they are referenced.
   */
  values: Map<string, ts.Node>;
  /** Top-level `const X = '<string>'`. */
  consts: Map<string, string>;
  /** Value imports by local name. */
  imports: Map<string, Import>;
  /**
   * Exported name → local name (a function, a value or an import), and
   * re-exports `export { a } from` / `export *` / `export * as ns` (`from: '*'`).
   */
  exports: Map<string, string>;
  reexports: { target: string | null; from: string | null; to: string | null }[];
  /** Variables holding a model accessor: `const ev = tx.evidence` (se-fb N12). */
  aliases: Set<string>;
  /** A 'use server' module: its exports are endpoints, judged on their own. */
  useServer: boolean;
}

/** Test-only source overrides by module id, for the multi-module mutants below. */
type Overlay = Record<string, string>;

/** A module id for a specifier inside src/ that names no file: whatever it is, the guard cannot see it. */
const UNRESOLVED = '?';
const isUnresolved = (id: string) => id.startsWith(UNRESOLVED);
/** How such an import is labelled: counted like a write, but reported as what it is (İNCELEME-89 D-4). */
const BLIND = 'imports ';

const existing = new Map<string, boolean>();
/** A file under src/ (the tree does not change during a run). */
function exists(rel: string): boolean {
  let hit = existing.get(rel);
  if (hit === undefined) existing.set(rel, (hit = fs.existsSync(path.join(SRC, rel)) && fs.statSync(path.join(SRC, rel)).isFile()));
  return hit;
}

/** The file a module id stands for: the id itself when it carries a code extension, else the first of CODE_EXTS. */
function fileOfId(id: string, overlay: Overlay): string | null {
  if (id in overlay) return SOURCE_FILE.test(id) ? id : `${id}.ts`;
  if (SOURCE_FILE.test(id) && exists(id)) return id;
  const ext = CODE_EXTS.find((x) => exists(id + x));
  return ext ? id + ext : null;
}

/**
 * Import aliases (İNCELEME-89 Y-4, TASK-MUO827UIF3IHL): every tsconfig `paths`
 * entry and every package.json `imports` entry, read from the files, so a new
 * alias into src/ (`~lib/*`, `#x/*`) is walked like `@/` and not taken for a
 * package. Tests stand in for the two files with overlay keys.
 */
const TSCONFIG_JSON = ':tsconfig.json';
const PACKAGE_JSON = ':package.json';
/** A specifier matched by an alias whose targets are not exactly one path under src/: `?` + this + the specifier. */
const ALIAS_BLIND = '!alias:';

interface Alias {
  /** Where it is declared, for messages. */
  source: 'tsconfig.json' | 'package.json';
  /** The part before the `*`, or the whole key without one. */
  prefix: string;
  /** The part after the `*`; null for a key without one (exact match). */
  suffix: string | null;
  /** Every target, repo-relative and `*` still in it, or null for a target that is no path (a package, `null`). */
  targets: (string | null)[];
}
interface AliasTable {
  aliases: Alias[];
  /** tsconfig `baseUrl`, repo-relative: a bare specifier is looked up under it (İNCELEME-97 Y-1). */
  baseUrl: string | null;
  /** What the guard cannot read in the two files: each one is a failing assertion, never a silent pass. */
  problems: string[];
}

function readRepoFile(name: string, overlay: Overlay, key: string): string | null {
  if (key in overlay) return overlay[key]!;
  const file = path.join(REPO_ROOT, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Every string a package.json `imports` target leads to: a string, a list of fallbacks, or conditions. */
function importTargets(value: unknown, out: (string | null)[]): void {
  if (typeof value === 'string') out.push(value.startsWith('./') ? path.posix.normalize(value) : null);
  else if (Array.isArray(value)) value.forEach((v) => importTargets(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => importTargets(v, out));
  else if (value !== null) out.push('!');
}

function aliasTableOf(overlay: Overlay): AliasTable {
  const aliases: Alias[] = [];
  const problems: string[] = [];
  let baseUrl: string | null = null;
  const add = (source: Alias['source'], key: string, targets: (string | null)[]) => {
    const stars = key.split('*').length - 1;
    if (stars > 1 || targets.some((t) => t === '!' || (t !== null && t.split('*').length - 1 !== stars))) {
      problems.push(`${source}: alias '${key}' is not a shape the guard reads (one '*' in the key and in each target)`);
      return;
    }
    const [prefix, suffix] = stars === 1 ? key.split('*') : [key, null];
    aliases.push({ source, prefix: prefix!, suffix: suffix ?? null, targets });
  };

  const tsText = readRepoFile('tsconfig.json', overlay, TSCONFIG_JSON);
  if (tsText !== null) {
    const { config, error } = ts.parseConfigFileTextToJson('tsconfig.json', tsText);
    if (error) problems.push(`tsconfig.json: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
    if (config?.extends !== undefined) problems.push('tsconfig.json `extends`: the guard reads `paths` from tsconfig.json alone');
    const opts = config?.compilerOptions ?? {};
    if (opts.baseUrl !== undefined && typeof opts.baseUrl !== 'string') problems.push('tsconfig.json `baseUrl`: not a string');
    if (typeof opts.baseUrl === 'string') baseUrl = path.posix.normalize(opts.baseUrl);
    const base = baseUrl ?? '.';
    for (const [key, list] of Object.entries<unknown>(opts.paths ?? {})) {
      const targets = Array.isArray(list) ? list.map((t) => (typeof t === 'string' ? path.posix.normalize(path.posix.join(base, t)) : '!')) : ['!'];
      add('tsconfig.json', key, targets);
    }
  }
  const pkgText = readRepoFile('package.json', overlay, PACKAGE_JSON);
  if (pkgText !== null) {
    const pkg = JSON.parse(pkgText) as { imports?: Record<string, unknown>; exports?: unknown };
    // With `exports`, the package imports itself by its name: an alias the guard would not see.
    if (pkg.exports !== undefined) problems.push('package.json `exports`: a self-reference by package name is not read by the guard');
    for (const [key, value] of Object.entries(pkg.imports ?? {})) {
      const targets: (string | null)[] = [];
      importTargets(value, targets);
      add('package.json', key, targets);
    }
  }
  return { aliases, baseUrl, problems };
}

const aliasTables = new WeakMap<Overlay, AliasTable>();
function aliasTable(overlay: Overlay): AliasTable {
  const own = TSCONFIG_JSON in overlay || PACKAGE_JSON in overlay ? overlay : NO_OVERLAY;
  let table = aliasTables.get(own);
  if (!table) aliasTables.set(own, (table = aliasTableOf(own)));
  return table;
}
export const aliasProblems = (overlay: Overlay): string[] => aliasTable(overlay).problems;

/**
 * The alias `spec` matches in one of the two files, as the resolver that reads
 * that file picks it: an exact key first, else the wildcard key with the
 * longest prefix. Node (and tsc for `imports`) breaks a tie by the longer key,
 * PATTERN_KEY_COMPARE (İNCELEME-97 Y-2), and its `*` matches at least one
 * character. tsc keeps the first `paths` key of a tie, a bundler may not: every
 * tied key is returned, and their targets are taken together.
 */
function matchAlias(spec: string, source: Alias['source'], overlay: Overlay): { alias: Alias; star: string }[] {
  const node = source === 'package.json';
  let best: Alias[] = [];
  for (const alias of aliasTable(overlay).aliases) {
    if (alias.source !== source) continue;
    if (alias.suffix === null) {
      if (spec === alias.prefix) return [{ alias, star: '' }];
      continue;
    }
    if (!spec.startsWith(alias.prefix) || !spec.endsWith(alias.suffix)) continue;
    if (spec.length < alias.prefix.length + alias.suffix.length + (node ? 1 : 0)) continue;
    const top = best[0];
    if (!top || alias.prefix.length > top.prefix.length || (node && alias.prefix.length === top.prefix.length && alias.suffix.length > top.suffix!.length)) best = [alias];
    else if (!node && alias.prefix.length === top.prefix.length) best.push(alias);
  }
  return best.map((alias) => ({ alias, star: spec.slice(alias.prefix.length, spec.length - alias.suffix!.length) }));
}

/** The targets of the matched keys, `*` filled in and without repeats; null stands for a package. */
function targetsOf(matches: { alias: Alias; star: string }[]): (string | null)[] {
  return [...new Set(matches.flatMap(({ alias, star }) => alias.targets.map((t) => (t === null ? null : path.posix.normalize(t.replace('*', star))))))];
}

/** A repo-relative path → its path under src/ (normalized, no trailing `/`), or null outside src/. */
function underSrc(target: string): string | null {
  if (target !== 'src' && !target.startsWith('src/')) return null;
  return path.posix.normalize(target.slice(4)).replace(/\/+$/, '');
}

/** Whether a repo-relative path outside src/ names a file tsc would take: a scripts/ file, a type stub. */
function resolvesOutside(target: string): boolean {
  const ext = path.posix.extname(target);
  const stem = EXT_MAP[ext] ? target.slice(0, -ext.length) : target;
  const exts = [...(EXT_MAP[ext] ?? CODE_EXTS), '.d.ts', '.json'];
  return [target, ...exts.map((x) => stem + x), ...exts.map((x) => `${stem}/index${x}`)].some((f) => {
    const abs = path.join(REPO_ROOT, f);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  });
}

const packages = new Map<string, boolean>();
/** A specifier tsc finds in node_modules (or @types) or a Node built-in: what a bare specifier falls back to. */
function isPackage(spec: string): boolean {
  if (isBuiltin(spec)) return true;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
  let hit = packages.get(name);
  if (hit === undefined) {
    const types = name.startsWith('@') ? name.slice(1).replace('/', '__') : name;
    hit = !!name && (fs.existsSync(path.join(REPO_ROOT, 'node_modules', name)) || fs.existsSync(path.join(REPO_ROOT, 'node_modules/@types', types)));
    packages.set(name, hit);
  }
  return hit;
}

/** What one resolver makes of a bare specifier: a path under src/, something outside src/, or no one file (fail-closed). */
type Pick = { base: string } | 'out' | 'blind';
const pickKey = (p: Pick) => (typeof p === 'string' ? p : `:${p.base}`);

/**
 * A bare specifier (not `./`) → a module id under src/, null outside src/, or
 * `?…` fail-closed. The guard reads in this order, each step only when the one
 * before names no file: `paths` (every target of the key in turn), `baseUrl` +
 * the specifier (İNCELEME-97 Y-1), package.json `imports`, node_modules. tsc
 * 5.9 stops earlier: a matched `paths` key whose targets name no file sends it
 * to node_modules, not to `baseUrl` or `imports` (İNCELEME-101 B-2, seen with
 * `traceResolution`). Reading on is the stricter side: what tsc cannot find
 * fails its typecheck (TS2307). So with a catch-all `"*": ["./src/*"]`, `zod` is still a
 * package (B-1), but a specifier that did point into src/ and names neither a
 * file there nor a package is a typo the guard cannot see past. Node reads
 * `imports` alone and throws on a missing target, so that match never falls
 * through. When tsconfig and `imports` both name a place and they differ, the
 * guard cannot know which one the build takes: fail-closed.
 */
function resolveBare(spec: string, overlay: Overlay, probed?: Set<string>): string | null {
  const picks: Pick[] = [];
  let missed: string | null = null;
  // tsconfig: `paths`, then `baseUrl`.
  const at = (target: string): Pick | null => {
    const base = underSrc(target);
    if (base === null) return resolvesOutside(target) ? 'out' : null;
    probed?.add(base);
    if (!isUnresolved(lookup(base, overlay) ?? '')) return { base };
    missed ??= base;
    return null;
  };
  let tsPick: Pick | null = null;
  const pathsMatch = matchAlias(spec, 'tsconfig.json', overlay);
  if (pathsMatch.length) {
    const targets = targetsOf(pathsMatch) as string[];
    // Fallbacks or tied keys: the guard does not guess which one the build finds.
    if (targets.length > 1) tsPick = targets.some((t) => underSrc(t) !== null) ? 'blind' : 'out';
    else tsPick = at(targets[0]!);
  }
  const { baseUrl } = aliasTable(overlay);
  if (tsPick === null && baseUrl !== null) tsPick = at(path.posix.normalize(path.posix.join(baseUrl, spec)));
  if (tsPick !== null) picks.push(tsPick);
  // package.json `imports`.
  const importsMatch = matchAlias(spec, 'package.json', overlay);
  if (importsMatch.length) {
    const bases = targetsOf(importsMatch).map((t) => (t === null ? null : underSrc(t)));
    bases.forEach((b) => b !== null && probed?.add(b));
    if (bases.every((b) => b === null)) picks.push('out');
    else picks.push(bases.length === 1 ? { base: bases[0]! } : 'blind');
  }
  // node_modules.
  if (picks.length === 0) return missed !== null && !isPackage(spec) ? UNRESOLVED + missed : null;
  const pick = new Set(picks.map(pickKey)).size === 1 ? picks[0]! : picks.every((p) => p === 'out') ? 'out' : 'blind';
  if (pick === 'out') return null;
  if (pick === 'blind') return UNRESOLVED + ALIAS_BLIND + spec;
  return lookup(pick.base, overlay);
}

/**
 * `@/x/y` or `./y` from module `from` → a module id under src/, null for a
 * package, a path out of src/ or a file that is not code (`.json`, `.css`), or
 * `?<path>` for a specifier into src/ that names no file (İNCELEME-80 Y-1: it
 * used to be taken for a package and passed silently). Every path under src/
 * it looks at goes into `probed`, so an overlay adding one of them is seen.
 */
function resolveSpec(from: string, spec: string, overlay: Overlay, probed?: Set<string>): string | null {
  if (!spec.startsWith('.')) return resolveBare(spec, overlay, probed);
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)).replace(/\/+$/, '');
  if (base === '..' || base.startsWith('../')) return null;
  probed?.add(base);
  return lookup(base, overlay);
}

/** A path under src/ → the module id it names, null for a file that is not code, or `?<path>` for none. */
function lookup(base: string, overlay: Overlay): string | null {
  const ext = path.posix.extname(base);
  const mapped = EXT_MAP[ext];
  const stem = mapped ? base.slice(0, -ext.length) : base;
  // The overlay stands in for files: `lib/x` (a `.ts`) or `lib/x.js`.
  if (stem in overlay) return stem;
  for (const x of mapped ?? CODE_EXTS) if (stem + x in overlay) return stem + x;
  if (!mapped && `${stem}/index` in overlay) return `${stem}/index`;
  for (const x of mapped ? [] : CODE_EXTS) if (`${stem}/index${x}` in overlay) return `${stem}/index${x}`;
  // A file that is not code: nothing to walk.
  if (!mapped && exists(base)) return null;
  const candidates = mapped ? mapped.map((x) => [stem, x]) : [...CODE_EXTS.map((x) => [stem, x]), ...CODE_EXTS.map((x) => [`${stem}/index`, x])];
  for (const [id, x] of candidates) {
    if (!exists(id! + x)) continue;
    // `lib/x` names its first file in CODE_EXTS order; another one keeps its extension in the id.
    return fileOfId(id!, overlay) === id! + x ? id! : id! + x;
  }
  return UNRESOLVED + base;
}

/** The model a receiver names: `x.evidence`, `x['evidence']`, `evidence`, or an alias of one. */
function modelOf(receiver: ts.Expression, aliases?: Set<string>): string | null {
  const e = unwrap(receiver);
  const name = ts.isPropertyAccessExpression(e)
    ? e.name.text
    : ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)
      ? e.argumentExpression.text
      : ts.isIdentifier(e)
        ? e.text
        : null;
  if (name && MODELS.has(name)) return name;
  return name && ts.isIdentifier(e) && aliases?.has(name) ? name : null;
}

function aliasesOf(sf: ts.SourceFile): Set<string> {
  const aliases = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && !MODELS.has(node.name.text) && modelOf(strip(node.initializer))) {
        const init = unwrap(strip(node.initializer));
        if (!ts.isIdentifier(init)) aliases.add(node.name.text);
      }
    }
    // `{ evidence: ev }` in a declaration or a parameter.
    if (ts.isBindingElement(node) && node.propertyName && ts.isIdentifier(node.name)) {
      const prop = node.propertyName;
      if ((ts.isIdentifier(prop) || ts.isStringLiteral(prop)) && MODELS.has(prop.text)) aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
}

/** Top-level functions, constants, imports and exports of a module. */
function moduleOf(
  id: string,
  sf: ts.SourceFile,
  overlay: Overlay,
): { mod: Module; exported: Map<string, string>; badExports: Finding[] } {
  const all = new Map<string, Fn>();
  const values = new Map<string, ts.Node>();
  const consts = new Map<string, string>();
  const imports = new Map<string, Import>();
  const exported = new Map<string, string>(); // exported name → local function name
  const exportsAll = new Map<string, string>(); // exported name → any local
  const reexports: Module['reexports'] = [];
  const badExports: Finding[] = [];
  const exportLists: ts.ExportDeclaration[] = [];
  const specs = new Set<string>();
  const resolve = (spec: string) => resolveSpec(id, spec, overlay, specs);
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body) {
      // se-fb N11: `export default async function (…)` has no name, and is an endpoint all the same.
      const name = stmt.name?.text ?? (hasModifier(stmt, ts.SyntaxKind.DefaultKeyword) ? 'default' : null);
      if (!name) continue;
      all.set(name, stmt);
      if (hasExport(stmt)) exported.set(hasModifier(stmt, ts.SyntaxKind.DefaultKeyword) ? 'default' : name, name);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          all.set(d.name.text, init);
          if (hasExport(stmt)) exported.set(d.name.text, d.name.text);
          continue;
        }
        if (ts.isIdentifier(d.name) && init) {
          if (ts.isStringLiteralLike(init)) consts.set(d.name.text, init.text);
          else values.set(d.name.text, init);
          if (hasExport(stmt)) exportsAll.set(d.name.text, d.name.text);
        }
        // se-fb N10: `export const x = wrap(async …)` is an endpoint whose body the guard cannot read.
        if (hasExport(stmt)) {
          badExports.push({
            key: `${sf.fileName}#${d.name.getText(sf)}`,
            problem: 'exported value is not a function the guard can read (declare the action as a function)',
          });
        }
      }
    } else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const e = unwrap(stmt.expression);
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
        all.set('default', e);
        exported.set('default', 'default');
      } else if (ts.isIdentifier(e)) {
        exportLists.push(
          ts.factory.createExportDeclaration(
            undefined,
            false,
            ts.factory.createNamedExports([ts.factory.createExportSpecifier(false, e.text, 'default')]),
          ),
        );
      } else {
        values.set('default', e);
        exportsAll.set('default', 'default');
        badExports.push({
          key: `${sf.fileName}#default@${at(stmt)}`,
          problem: 'export default is not a function the guard can read',
        });
      }
    } else if ((ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) {
      values.set(stmt.name.text, stmt);
      if (hasExport(stmt)) exportsAll.set(hasModifier(stmt, ts.SyntaxKind.DefaultKeyword) ? 'default' : stmt.name.text, stmt.name.text);
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const target = resolve(stmt.moduleSpecifier.text);
        if (!stmt.exportClause) reexports.push({ target, from: null, to: null });
        // `export * as ns from` (İNCELEME-74 R4).
        else if (ts.isNamespaceExport(stmt.exportClause)) reexports.push({ target, from: '*', to: stmt.exportClause.name.text });
        else if (ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            if (!el.isTypeOnly) reexports.push({ target, from: (el.propertyName ?? el.name).text, to: el.name.text });
          }
        }
      }
      exportLists.push(stmt);
    } else if (ts.isImportDeclaration(stmt) && stmt.importClause && !stmt.importClause.isTypeOnly) {
      const target = ts.isStringLiteral(stmt.moduleSpecifier) ? resolve(stmt.moduleSpecifier.text) : null;
      const clause = stmt.importClause;
      if (clause.name) imports.set(clause.name.text, { target, name: 'default' });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { target, name: '*' });
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (!el.isTypeOnly) imports.set(el.name.text, { target, name: (el.propertyName ?? el.name).text });
        }
      }
    }
  }
  // `export { fn }` / `export { fn as other }` (se-fb G7): the same endpoint as `export async function`.
  for (const decl of exportLists) {
    if (decl.moduleSpecifier || !decl.exportClause || !ts.isNamedExports(decl.exportClause)) {
      badExports.push({
        key: `${sf.fileName}#export@${at(decl)}`,
        problem: 're-export from another module; the guard cannot see what it exports',
      });
      continue;
    }
    for (const el of decl.exportClause.elements) {
      if (el.isTypeOnly) continue;
      const local = (el.propertyName ?? el.name).text;
      exportsAll.set(el.name.text, local);
      if (all.has(local)) exported.set(el.name.text, local);
      else
        badExports.push({
          key: `${sf.fileName}#${el.name.text}`,
          problem: 'exported through `export { … }` but not a function this module declares',
        });
    }
  }
  const mod: Module = {
    sf,
    id,
    specs,
    all,
    values,
    consts,
    imports,
    exports: new Map([...exportsAll, ...exported]),
    reexports,
    aliases: aliasesOf(sf),
    useServer: hasDirective(sf.statements, 'use server'),
  };
  return { mod, exported, badExports };
}

/** Modules reached by the transitive walk, parsed once per overlay. */
const moduleCache = new WeakMap<Overlay, Map<string, Module | null>>();
const NO_OVERLAY: Overlay = {};

function loadModule(id: string, overlay: Overlay): Module | null {
  if (isUnresolved(id)) return null;
  let cache = moduleCache.get(overlay);
  if (!cache) moduleCache.set(overlay, (cache = new Map()));
  if (cache.has(id)) return cache.get(id)!;
  let mod: Module | null = null;
  const file = fileOfId(id, overlay);
  if (file && id in overlay) {
    mod = moduleOf(id, ts.createSourceFile(file, overlay[id]!, ts.ScriptTarget.Latest, true, scriptKindOf(file)), overlay).mod;
  } else if (file && overlay !== NO_OVERLAY) {
    // A file of the tree is parsed once for every overlay (TASK-MUO4GP1P89HS7
    // Ö-1); its imports are resolved again only when the overlay names one.
    const real = loadModule(id, NO_OVERLAY);
    const shadowed = real && (aliasTable(overlay) !== aliasTable(NO_OVERLAY) || [...real.specs].some((b) => b in overlay || CODE_EXTS.some((x) => b + x in overlay) || `${b}/index` in overlay));
    mod = real && shadowed ? moduleOf(id, real.sf, overlay).mod : real;
  } else if (file) {
    mod = moduleOf(id, ts.createSourceFile(file, fs.readFileSync(path.join(SRC, file), 'utf8'), ts.ScriptTarget.Latest, true, scriptKindOf(file)), overlay).mod;
  }
  cache.set(id, mod);
  return mod;
}

/**
 * What module `id` exports as `name`, following re-exports and imports it
 * exports again (İNCELEME-74 R1–R4): a function or value to walk, a namespace
 * (`export * as ns`, `import * as ns; export { ns }`), a name from outside src/,
 * or null — a name the guard could not find, which the walk treats as the
 * whole module (fail-closed).
 */
type Resolved = { mod: Module; node: Fn | ts.Node; name: string } | { ns: string } | { external: true } | { unresolved: string } | null;
// `external`: outside src/, or a string constant — nothing to walk.

function resolveExport(id: string, name: string, overlay: Overlay, seen = new Set<string>()): Resolved {
  if (isUnresolved(id)) return { unresolved: id };
  const key = `${id}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const mod = loadModule(id, overlay);
  if (!mod) return null;
  const local = mod.exports.get(name);
  if (local !== undefined) {
    const node = mod.all.get(local) ?? mod.values.get(local);
    if (node) return { mod, node, name: local };
    // A string constant: nothing to walk.
    if (mod.consts.has(local)) return { external: true };
    const imp = mod.imports.get(local);
    if (imp) {
      if (!imp.target) return { external: true };
      return imp.name === '*' ? { ns: imp.target } : resolveExport(imp.target, imp.name, overlay, seen);
    }
  }
  for (const r of mod.reexports) {
    if (r.to !== null && r.to !== name) continue;
    if (!r.target) {
      if (r.to === name) return { external: true };
      continue;
    }
    if (r.from === '*') return { ns: r.target };
    const found = resolveExport(r.target, r.from ?? name, overlay, seen);
    if (found) return found;
  }
  return null;
}

function calleeName(call: ts.CallExpression): string | null {
  const e = strip(call.expression);
  return ts.isIdentifier(e) ? e.text : null;
}

/** The declaration `target` has in `name`, a declared name or a binding pattern. */
function bindingIn(name: ts.BindingName, target: string): ts.Node | null {
  if (ts.isIdentifier(name)) return name.text === target ? name.parent : null;
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue;
    const found = bindingIn(el.name, target);
    if (found) return found;
  }
  return null;
}

/**
 * What an identifier names inside the functions and blocks around it: a
 * parameter, a `VariableDeclaration`, a `BindingElement`, or a nested function
 * or class declaration. Null for a top-level name (an import, a top-level
 * function or value). Hoisting is kept: a declaration later in the block is
 * found all the same (İNCELEME-74 D-1, D-3).
 */
const bindings = new WeakMap<ts.Identifier, ts.Node | null>();
function localBinding(id: ts.Identifier): ts.Node | null {
  let found = bindings.get(id);
  if (found === undefined) bindings.set(id, (found = findBinding(id)));
  return found;
}

function findBinding(id: ts.Identifier): ts.Node | null {
  const name = id.text;
  for (let n: ts.Node = id.parent; n && !ts.isSourceFile(n); n = n.parent) {
    if (isFn(n)) {
      for (const p of n.parameters) {
        const found = bindingIn(p.name, name);
        if (found) return found;
      }
      if (ts.isFunctionExpression(n) && n.name?.text === name) return n;
    }
    const list = ts.isBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : undefined;
    for (const s of list ?? []) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          const found = bindingIn(d.name, name);
          if (found) return found;
        }
      } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name?.text === name) return s;
    }
    const init =
      ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) ? n.initializer : ts.isCatchClause(n) ? n.variableDeclaration : undefined;
    if (init && ts.isVariableDeclarationList(init)) {
      for (const d of init.declarations) {
        const found = bindingIn(d.name, name);
        if (found) return found;
      }
    } else if (init && ts.isVariableDeclaration(init)) {
      const found = bindingIn(init.name, name);
      if (found) return found;
    }
  }
  return null;
}

/** The import an identifier reads, unless a local declaration shadows it (İNCELEME-74 S1/S2). */
function importOf(id: ts.Identifier, mod: Module): Import | null {
  return localBinding(id) ? null : (mod.imports.get(id.text) ?? null);
}

/** The imported name a call's callee is, when it comes from `source` (a module id). */
function importedCall(e: ts.Expression, mod: Module, source: Record<string, string>): string | null {
  const call = strip(e);
  if (!ts.isCallExpression(call) || call.questionDotToken) return null;
  const callee = strip(call.expression);
  const imp = ts.isIdentifier(callee) ? importOf(callee, mod) : null;
  return imp && imp.name in source && source[imp.name] === imp.target ? imp.name : null;
}

/** The check a call makes, when its callee is imported from the check's own module (se-fb N3) and not shadowed. */
function checkName(call: ts.CallExpression, mod: Module): string | null {
  return importedCall(call, mod, CHECK_SOURCES);
}

/**
 * Something in the enclosing function assigns to the binding `decl` makes, or
 * to a property of it: `role = 'X'`, `scope.role = 'X'`, `s['role'] = …`, `++`
 * (İNCELEME-74 Y-2: a `const` object is still mutable).
 */
const writtenCache = new WeakMap<ts.Node, boolean>();
function writtenTo(decl: ts.Node): boolean {
  let hit = writtenCache.get(decl);
  if (hit === undefined) writtenCache.set(decl, (hit = findWrite(decl)));
  return hit;
}

function findWrite(decl: ts.Node): boolean {
  let scope: ts.Node = decl.parent;
  while (!isFn(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  const within = (n: ts.Node | null) => {
    for (; n && n !== scope; n = n.parent) if (n === decl) return true;
    return false;
  };
  let written = false;
  // `x = …`, `x.p = …`, `[x] = …`, `({ x } = …)`, `for (x of …)`.
  const assigns = (t: ts.Expression): void => {
    t = unwrap(t);
    while (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) t = unwrap(t.expression);
    if (ts.isIdentifier(t)) {
      if (within(localBinding(t))) written = true;
    } else if (ts.isArrayLiteralExpression(t)) {
      t.elements.forEach((e) => assigns(ts.isSpreadElement(e) ? e.expression : e));
    } else if (ts.isObjectLiteralExpression(t)) {
      for (const p of t.properties) {
        if (ts.isShorthandPropertyAssignment(p)) assigns(p.name);
        else if (ts.isPropertyAssignment(p)) assigns(p.initializer);
        else if (ts.isSpreadAssignment(p)) assigns(p.expression);
      }
    } else if (ts.isBinaryExpression(t) && t.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      assigns(t.left); // a default in a destructuring assignment
    }
  };
  const visit = (n: ts.Node) => {
    if (written) return;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      assigns(n.left);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      assigns(n.operand);
    } else if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && !ts.isVariableDeclarationList(n.initializer)) {
      assigns(n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  const body = isFn(scope) ? scope.body : scope;
  if (body) visit(body);
  return written;
}

/**
 * A `const` in a function whose name is one identifier or a flat `{ a, b: c }`
 * (no nesting, no rest): what the walk follows a namespace through by name.
 * `anyKind` also takes `let`/`var` (a destructuring's names are followed where used).
 */
function flatConst(d: ts.VariableDeclaration, anyKind = false): boolean {
  if (!anyKind && (!isConst(d) || ts.isSourceFile(d.parent.parent.parent))) return false;
  if (ts.isIdentifier(d.name)) return true;
  return (
    ts.isObjectBindingPattern(d.name) &&
    d.name.elements.every((el) => ts.isIdentifier(el.name) && !el.dotDotDotToken && propertyOf(el) !== null)
  );
}

/** The binding a `const` declaration makes, or null for `let`/`var` (which can be reassigned). */
const isConst = (d: ts.VariableDeclaration) =>
  ts.isVariableDeclarationList(d.parent) && (d.parent.flags & ts.NodeFlags.Const) !== 0;

/** A literal (or same-file constant) that names an rbac.ts permission. */
function isRbacAction(arg: ts.Expression | undefined, mod: Module): boolean {
  if (!arg) return false;
  const e = strip(arg);
  const value = ts.isStringLiteralLike(e) ? e.text : ts.isIdentifier(e) ? mod.consts.get(e.text) : undefined;
  return value !== undefined && RBAC_ACTIONS.has(value);
}

/** The object literal `requireTenantAction({ … })` was given, if any. */
function requireTenantActionOpts(call: ts.CallExpression): ts.ObjectLiteralExpression | null {
  if (calleeName(call) !== 'requireTenantAction') return null;
  const arg = call.arguments[0];
  return arg && ts.isObjectLiteralExpression(strip(arg)) ? (strip(arg) as ts.ObjectLiteralExpression) : null;
}

function optionOf(opts: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  for (const p of opts.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key) return p.initializer;
  }
  return undefined;
}

const isReadOnlyCall = (call: ts.CallExpression) => {
  const opts = requireTenantActionOpts(call);
  const value = opts && optionOf(opts, 'readOnly');
  return !!value && value.kind === ts.SyntaxKind.TrueKeyword;
};

/**
 * Where a role argument may come from (İNCELEME-74 Y-2): the session of this
 * very call, not the action's arguments nor a role written in the code.
 */
interface Origin {
  /** `role`, `scope.role`, `asRole(…)` of one, bound from the session. */
  role(arg: ts.Expression | undefined): boolean;
  /** The session or a scope read from it: `await requireTenantAction()`, `await auth()`. */
  session(arg: ts.Expression | undefined): boolean;
}

/** A call that throws unless the caller's role carries the permission. */
function isThrowingCheck(call: ts.CallExpression, mod: Module, origin: Origin): boolean {
  const name = checkName(call, mod);
  if (name === 'requirePlatformAdmin') return true;
  if (name === 'assertTenantActionRole') return origin.session(call.arguments[0]) && isRbacAction(call.arguments[1], mod);
  if (name !== 'requireTenantAction') return false;
  const opts = requireTenantActionOpts(call);
  return !!opts && isRbacAction(optionOf(opts, 'can'), mod);
}

/** A yes/no check the caller's role must pass, asked about the caller's own role (se-fb N4, İNCELEME-74 S3–S8). */
function isBooleanCheck(e: ts.Expression, mod: Module, origin: Origin): boolean {
  const call = strip(e);
  if (!ts.isCallExpression(call) || call.questionDotToken) return false;
  const name = checkName(call, mod);
  if (!name || !BOOLEAN_CHECKS.has(name)) return false;
  if (name === 'can') return origin.role(call.arguments[0]) && isRbacAction(call.arguments[1], mod);
  if (name === 'isPlatformAdminSession') return origin.session(call.arguments[0]);
  return origin.role(call.arguments[0]);
}

/** After `if (<cond>) exit`, the check holds. */
function isGuardCondition(e: ts.Expression, mod: Module, origin: Origin): boolean {
  e = strip(e);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    return isBooleanCheck(e.operand, mod, origin);
  }
  if (ts.isBinaryExpression(e)) {
    if (e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return isGuardCondition(e.left, mod, origin) || isGuardCondition(e.right, mod, origin);
    }
    if (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return isGuardCondition(e.left, mod, origin) && isGuardCondition(e.right, mod, origin);
    }
  }
  return false;
}

/** The statement always leaves: `throw`, or also `return` when a return stops what follows. */
function exits(stmt: ts.Statement, returnStops: boolean): boolean {
  if (ts.isThrowStatement(stmt)) return true;
  if (ts.isReturnStatement(stmt)) return returnStops;
  const last = ts.isBlock(stmt) ? stmt.statements[stmt.statements.length - 1] : undefined;
  if (last) return exits(last, returnStops);
  return false;
}

/** A `return` of this function (not of a nested one) inside `node`. */
function returnsIn(node: ts.Node): boolean {
  if (ts.isReturnStatement(node)) return true;
  if (isFn(node)) return false;
  return !!ts.forEachChild(node, (c) => returnsIn(c) || undefined);
}

/** Every `return` of this function (not of a nested one) gives `ok` or nothing, and at least one gives `ok`. */
function returnsOnly(fn: Fn, ok: (e: ts.Expression) => boolean): boolean {
  if (!fn.body) return false;
  if (!ts.isBlock(fn.body)) return ok(fn.body);
  let some = false;
  let all = true;
  const visit = (n: ts.Node) => {
    if (isFn(n)) return;
    if (ts.isReturnStatement(n) && n.expression) {
      const e = strip(n.expression);
      if (e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return;
      if (ok(n.expression)) some = true;
      else all = false;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return some && all;
}

/** The property a destructured name reads: `{ role }`, `{ role: r }`. */
function propertyOf(b: ts.BindingElement): string | null {
  const prop = b.propertyName ?? b.name;
  return ts.isIdentifier(prop) || ts.isStringLiteral(prop) ? prop.text : null;
}

/**
 * The call a statement is: `check(…)`, `await check(…)`, `const x = await
 * check(…)`. Anything around it — `void`, `.catch`, `?.`, `&&`, another call —
 * can let the action go on after a refusal (se-fb N2, N13).
 */
function statementCalls(stmt: ts.Statement): { call: ts.CallExpression; awaited: boolean }[] {
  const exprs = ts.isExpressionStatement(stmt)
    ? [stmt.expression]
    : ts.isVariableStatement(stmt)
      ? stmt.declarationList.declarations.flatMap((d) => (d.initializer ? [d.initializer] : []))
      : [];
  const found: { call: ts.CallExpression; awaited: boolean }[] = [];
  for (let e of exprs) {
    e = unwrap(e);
    const awaited = ts.isAwaitExpression(e);
    if (awaited) e = strip(e);
    if (ts.isCallExpression(e) && !e.questionDotToken && !ts.isOptionalChain(e)) found.push({ call: e, awaited });
  }
  return found;
}

/** A node that a call or tagged template runs, through `( )`, `as`, `!`, `satisfies`. */
function isCallee(node: ts.Node): boolean {
  let n = node;
  while (
    ts.isParenthesizedExpression(n.parent) ||
    ts.isAsExpression(n.parent) ||
    ts.isNonNullExpression(n.parent) ||
    ts.isSatisfiesExpression(n.parent)
  ) {
    n = n.parent;
  }
  const p = n.parent;
  return (ts.isCallExpression(p) && p.expression === n) || (ts.isTaggedTemplateExpression(p) && p.tag === n);
}

/** The string an expression is: a literal, or a `const` bound to one in the function or at the top level. */
function stringOf(arg: ts.Expression, mod: Module, depth = 0): string | null {
  const e = strip(arg);
  if (ts.isStringLiteralLike(e)) return e.text;
  if (!ts.isIdentifier(e) || depth > 8) return null;
  const b = localBinding(e);
  if (!b) return mod.consts.get(e.text) ?? null;
  return ts.isVariableDeclaration(b) && isConst(b) && b.initializer ? stringOf(b.initializer, mod, depth + 1) : null;
}

/**
 * The SQL a raw query runs, as text: the argument, or the `const` it names
 * (İNCELEME-74 W5). Null when the guard cannot read it — a parameter, a call's
 * result — and such a query counts as a write.
 */
function sqlOf(arg: ts.Node | undefined, mod: Module, depth = 0): string | null {
  if (!arg || depth > 8) return null;
  const e = ts.isExpression(arg) ? strip(arg) : arg;
  if (
    ts.isStringLiteralLike(e) ||
    ts.isTemplateExpression(e) ||
    ts.isTaggedTemplateExpression(e) ||
    (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken)
  ) {
    return e.getText(mod.sf);
  }
  if (!ts.isIdentifier(e)) return null;
  const b = localBinding(e);
  const init = !b ? mod.values.get(e.text) : ts.isVariableDeclaration(b) && isConst(b) ? b.initializer : undefined;
  if (!b && mod.consts.has(e.text)) return mod.consts.get(e.text)!;
  return init ? sqlOf(init, mod, depth + 1) : null;
}

/** The method a member access names: `x.m`, `x['m']`, `x[M]` for a string `const M`; null when it cannot be read. */
function memberName(target: ts.PropertyAccessExpression | ts.ElementAccessExpression, mod: Module): string | null {
  return ts.isPropertyAccessExpression(target) ? target.name.text : stringOf(target.argumentExpression, mod);
}

/** The Prisma write this node makes, as source text, or null. */
function writeOf(node: ts.Node, mod: Module): string | null {
  // A model accessor handed to a function (İNCELEME-74 W8): the guard does not
  // follow it into the parameter, so it counts as the write the callee may make.
  if (node.parent && ts.isCallExpression(node.parent) && node.parent.arguments.includes(node as ts.Expression)) {
    const arg = node as ts.Expression;
    const accessor =
      ts.isPropertyAccessExpression(arg) || ts.isElementAccessExpression(arg)
        ? modelOf(arg)
        : ts.isIdentifier(arg) && mod.aliases.has(arg.text);
    if (accessor) return `${arg.getText(mod.sf)} (model handed to ${node.parent.expression.getText(mod.sf)})`;
  }
  // A write method taken as a value, not called here: `const del = tx.evidence.deleteMany`,
  // `.call`, `Reflect.apply(…)` (İNCELEME-74 W1, W3, W9). Whoever holds it can write.
  if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && !isCallee(node)) {
    const method = memberName(node, mod);
    if (method && (RAW_WRITES.has(method) || RAW_QUERIES.has(method))) return `${node.getText(mod.sf)} (taken as a value)`;
    if (method && WRITE_METHODS.has(method) && modelOf(node.expression, mod.aliases)) return `${node.getText(mod.sf)} (taken as a value)`;
    return null;
  }
  // `const { deleteMany } = tx.evidence` (İNCELEME-74 W2).
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const prop = node.propertyName ?? node.name;
    const holder = node.parent.parent;
    const name = ts.isIdentifier(prop) || ts.isStringLiteral(prop) ? prop.text : null;
    if (name && WRITE_METHODS.has(name) && ts.isVariableDeclaration(holder) && holder.initializer && modelOf(strip(holder.initializer), mod.aliases)) {
      return `${node.getText(mod.sf)} = ${holder.initializer.getText(mod.sf)} (taken as a value)`;
    }
    return null;
  }
  let target: ts.Expression;
  let sql: string | null;
  if (ts.isCallExpression(node)) {
    target = unwrap(node.expression);
    sql = sqlOf(node.arguments[0], mod);
  } else if (ts.isTaggedTemplateExpression(node)) {
    target = unwrap(node.tag);
    sql = node.template.getText(mod.sf);
  } else return null;
  if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return null;
  const method = memberName(target, mod);
  const text = () => target.getText(mod.sf);
  // `tx.evidence[m](…)` with an `m` the guard cannot read (İNCELEME-74 W4): fail-closed.
  if (method === null) return modelOf(target.expression, mod.aliases) ? `${text()} (method the guard cannot read)` : null;
  if (RAW_WRITES.has(method)) return text();
  if (RAW_QUERIES.has(method)) {
    if (sql === null) return `${text()} (SQL the guard cannot read)`;
    return SQL_WRITE.test(sql) ? `${text()} (writing SQL)` : null;
  }
  if (!WRITE_METHODS.has(method)) return null;
  return modelOf(target.expression, mod.aliases) ? text() : null;
}

/** An identifier that reads a binding, not one that names a property or declares something. */
function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isExportSpecifier(p)) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p) || ts.isJsxAttribute(p)) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  const declares =
    ts.isVariableDeclaration(p) ||
    ts.isFunctionDeclaration(p) ||
    ts.isFunctionExpression(p) ||
    ts.isParameter(p) ||
    ts.isBindingElement(p) ||
    ts.isClassDeclaration(p) ||
    ts.isMethodDeclaration(p) ||
    ts.isPropertyAssignment(p) ||
    ts.isPropertyDeclaration(p) ||
    ts.isPropertySignature(p) ||
    ts.isEnumMember(p) ||
    ts.isLabeledStatement(p);
  return !(declares && (p as { name?: ts.Node }).name === id);
}

interface Facts {
  readOnly: boolean;
  /** Role checks in a shape that stops the action, anywhere on its paths. */
  checks: number;
  writes: string[];
  /** Writes no earlier check covers. */
  unchecked: string[];
  /** Calls past MAX_DEPTH, where the guard stops seeing (İNCELEME-74 L7+): fail-closed like a write. */
  deep: { label: string; checked: boolean }[];
}

interface Frame {
  /** `module#function` for every function entered, to stop at recursion. */
  stack: string[];
  /** How many modules away from the action. */
  depth: number;
  overlay: Overlay;
  /**
   * The lowest stack index a recursion stop pointed at in this walk. A walk
   * stopped by something outside it depends on who called it, so its summary
   * is not reused.
   */
  cut: { min: number };
}

/**
 * What walking a function or value reached from an action found, walked with
 * no check yet (TASK-MUO4GP1P89HS7 Ö-1). A check before the call only moves
 * its writes out of `unchecked`, so one walk serves every caller at that
 * depth: the same helper is no longer walked again for each action and each
 * call site.
 */
const summaries = new WeakMap<Overlay, WeakMap<Module, Map<string, Facts>>>();

function summaryCache(overlay: Overlay, mod: Module): Map<string, Facts> {
  let byMod = summaries.get(overlay);
  if (!byMod) summaries.set(overlay, (byMod = new WeakMap()));
  let map = byMod.get(mod);
  if (!map) byMod.set(mod, (map = new Map()));
  return map;
}

class Walker {
  readonly facts: Facts;
  /** The function being walked right now; a `return` leaves a helper only from its own body. */
  private current: Fn | null = null;
  /** A helper that may return before its check checks nothing for its caller (se-fb N5). */
  private leaks = false;
  /** Nested function declarations being walked from a call, against recursion (İNCELEME-74 E4). */
  private readonly active = new Set<ts.Node>();
  readonly origin: Origin = {
    role: (arg) => this.sessionRole(arg, new Set()),
    session: (arg) => this.sessionValue(arg, new Set()),
  };

  constructor(
    private readonly mod: Module,
    /** The function walked; null for a whole module (an import the guard could not resolve). */
    private readonly root: Fn | null,
    private readonly frame: Frame,
    /** Judged as a same-file helper: does it stop its caller? */
    private readonly helper = false,
    facts?: Facts,
    /** Parameters of a helper the caller passed its session or role to. */
    private readonly trusted: ReadonlySet<ts.Node> = new Set(),
  ) {
    this.facts = facts ?? { readOnly: false, checks: 0, writes: [], unchecked: [], deep: [] };
  }

  run(): Facts {
    if (this.root) this.fn(this.root, false);
    return this.facts;
  }

  /** Walks a function; true when its own top level establishes a check. */
  fn(fn: Fn, checked: boolean): boolean {
    const outer = this.current;
    this.current = fn;
    try {
      // Defaults run before the body (se-fb N6).
      for (const p of fn.parameters) if (p.initializer) this.node(p.initializer, checked);
      if (!fn.body) return false;
      if (ts.isBlock(fn.body)) {
        const established = this.statements(fn.body.statements, checked);
        return established && !(fn === this.root && this.leaks);
      }
      this.node(fn.body, checked);
      return false;
    } finally {
      this.current = outer;
    }
  }

  private get atHelperTop(): boolean {
    return this.helper && this.current === this.root;
  }

  /** A statement list in order. True when it establishes a check for what follows it. */
  private statements(list: readonly ts.Statement[], checked: boolean): boolean {
    let established = false;
    // A helper's `return` gives control back to the caller, so only `throw` stops it.
    const returnStops = !this.atHelperTop;
    for (const stmt of list) {
      if (this.atHelperTop && !checked && returnsIn(stmt)) this.leaks = true;
      if (
        ts.isIfStatement(stmt) &&
        !stmt.elseStatement &&
        exits(stmt.thenStatement, returnStops) &&
        isGuardCondition(stmt.expression, this.mod, this.origin)
      ) {
        this.node(stmt, checked);
        this.facts.checks++;
        checked = established = true;
        continue;
      }
      if (ts.isTryStatement(stmt)) {
        const inTry = this.statements(stmt.tryBlock.statements, checked);
        if (stmt.catchClause) this.node(stmt.catchClause, checked);
        if (stmt.finallyBlock) this.node(stmt.finallyBlock, checked);
        // A refusal caught and not passed on lets the action go on (se-fb N1).
        const catchLeaves = !stmt.catchClause || exits(stmt.catchClause.block, returnStops);
        if (inTry && catchLeaves) checked = established = true;
        continue;
      }
      if (ts.isBlock(stmt)) {
        if (this.statements(stmt.statements, checked)) checked = established = true;
        continue;
      }
      // Writes in this statement are judged against the checks before it.
      this.node(stmt, checked);
      if (this.establishes(stmt)) {
        this.facts.checks++;
        checked = established = true;
      }
    }
    return established;
  }

  private establishes(stmt: ts.Statement): boolean {
    return statementCalls(stmt).some(({ call, awaited }) => {
      if (isThrowingCheck(call, this.mod, this.origin)) return awaited || !ASYNC_CHECKS.has(checkName(call, this.mod)!);
      const name = calleeName(call);
      const callee = strip(call.expression);
      // A parameter or local named like a helper is not that helper (İNCELEME-74 D-1).
      const shadowed = ts.isIdentifier(callee) && !!localBinding(callee);
      const helper = name && !shadowed && !this.mod.imports.has(name) ? this.mod.all.get(name) : undefined;
      const key = `${this.mod.id}#${name}`;
      if (!helper || this.frame.stack.includes(key)) return false;
      if (hasModifier(helper, ts.SyntaxKind.AsyncKeyword) && !awaited) return false;
      // The parameters the caller hands its own session or role to (İNCELEME-74 Y-2).
      const trusted = new Set<ts.Node>();
      helper.parameters.forEach((p, i) => {
        const arg = call.arguments[i];
        if (arg && !ts.isSpreadElement(arg) && (this.origin.role(arg) || this.origin.session(arg))) trusted.add(p);
      });
      // Judged on its own: does its body check before it can return?
      const sub = new Walker(this.mod, helper, { ...this.frame, stack: [...this.frame.stack, key] }, true, undefined, trusted);
      return sub.fn(helper, false);
    });
  }

  /**
   * The role a check is asked about: `role`, `scope.role`, `sessionObj?.role`,
   * `asRole(…)` of one, bound by a `const` from the session (`await
   * requireTenantAction()`, `await auth()`, a same-file helper that returns
   * one) or a helper parameter its caller filled so. Not an argument of the
   * action, not a role the code wrote down, not a `let` (İNCELEME-74 Y-2 S3–S8).
   */
  private sessionRole(arg: ts.Expression | undefined, seen: Set<ts.Node>): boolean {
    if (!arg) return false;
    const e = strip(arg);
    if (seen.has(e)) return false;
    seen.add(e);
    if (ts.isCallExpression(e)) return e.arguments.length === 1 && !!importedCall(e, this.mod, AS_ROLE) && this.sessionRole(e.arguments[0], seen);
    if (ts.isPropertyAccessExpression(e)) return e.name.text === 'role' && this.sessionValue(e.expression, seen);
    if (!ts.isIdentifier(e)) return false;
    const b = localBinding(e);
    if (!b) return false;
    if (ts.isParameter(b)) return this.isTrusted(b);
    if (writtenTo(b)) return false;
    if (ts.isVariableDeclaration(b)) return isConst(b) && !!b.initializer && this.sessionRole(b.initializer, seen);
    return ts.isBindingElement(b) && propertyOf(b) === 'role' && this.destructuredFromSession(b, seen);
  }

  /** The session, or a scope or object read from it. */
  private sessionValue(arg: ts.Expression | undefined, seen: Set<ts.Node>): boolean {
    if (!arg) return false;
    const e = strip(arg);
    if (seen.has(e)) return false;
    seen.add(e);
    if (ts.isCallExpression(e)) {
      const source = importedCall(e, this.mod, SESSION_SOURCES);
      if (source) return !SESSION_OF_ARGUMENT.has(source) || this.sessionValue(e.arguments[0], seen);
      // A same-file helper whose every return is the session or nothing (pipeline `sessionScope()`).
      const callee = strip(e.expression);
      if (!ts.isIdentifier(callee) || localBinding(callee) || this.mod.imports.has(callee.text)) return false;
      const helper = this.mod.all.get(callee.text);
      return !!helper && returnsOnly(helper, (x) => this.sessionValue(x, seen));
    }
    if (ts.isPropertyAccessExpression(e)) return this.sessionValue(e.expression, seen);
    if (!ts.isIdentifier(e)) return false;
    const b = localBinding(e);
    if (!b) return false;
    if (ts.isParameter(b)) return this.isTrusted(b);
    if (writtenTo(b)) return false;
    if (ts.isVariableDeclaration(b)) return isConst(b) && !!b.initializer && this.sessionValue(b.initializer, seen);
    return ts.isBindingElement(b) && this.destructuredFromSession(b, seen);
  }

  /** A parameter the caller filled from its session, and the helper never writes to. */
  private isTrusted(p: ts.ParameterDeclaration): boolean {
    return this.trusted.has(p) && !writtenTo(p);
  }

  /** `const { x } = <session>`, or `({ x })` of a trusted parameter; no default value. */
  private destructuredFromSession(b: ts.BindingElement, seen: Set<ts.Node>): boolean {
    if (b.initializer || !ts.isObjectBindingPattern(b.parent)) return false;
    const holder = b.parent.parent;
    if (ts.isParameter(holder)) return this.isTrusted(holder);
    return ts.isVariableDeclaration(holder) && !writtenTo(holder) && isConst(holder) && !!holder.initializer && this.sessionValue(holder.initializer, seen);
  }

  /**
   * A constant `import('<spec>')` whose module the walk follows by name: a
   * member of it (`(await import(x)).f`), or a `const` in a function that
   * holds it or destructures it flat. Anything else — `?:`, `Promise.all`, a
   * top-level `const`, nested destructuring, `let` — stands for the whole
   * module (İNCELEME-80 Y-2).
   */
  private tracked(call: ts.CallExpression): boolean {
    let p: ts.Node = call;
    while (
      ts.isParenthesizedExpression(p.parent) ||
      ts.isAsExpression(p.parent) ||
      ts.isNonNullExpression(p.parent) ||
      ts.isSatisfiesExpression(p.parent) ||
      ts.isTypeAssertionExpression(p.parent) ||
      ts.isAwaitExpression(p.parent)
    ) {
      p = p.parent;
    }
    const parent = p.parent;
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === p) {
      return memberName(parent, this.mod) !== null;
    }
    return ts.isVariableDeclaration(parent) && parent.initializer === p && flatConst(parent);
  }

  /** A write the guard cannot see past: an import into src/ that names no file (İNCELEME-80 Y-1), or no one file (Y-4). */
  private unresolved(target: string, checked: boolean): void {
    const what = target.slice(UNRESOLVED.length);
    const label = what.startsWith(ALIAS_BLIND)
      ? `${BLIND}${what.slice(ALIAS_BLIND.length)}, an alias into src/ with more than one target, which the guard cannot find (fail-closed): give it one target`
      : `${BLIND}src/${what}, which the guard cannot find (fail-closed): fix the specifier or add the file`;
    this.facts.writes.push(label);
    if (!checked) this.facts.unchecked.push(label);
  }

  private cutAt(index: number): void {
    this.frame.cut.min = Math.min(this.frame.cut.min, index);
  }

  /** The module a namespace expression stands for: `import * as ns`, a re-exported namespace, `await import('…')`, a `const` of one. */
  private namespaceOf(expr: ts.Expression, depth = 0): string | null {
    const e = strip(expr);
    if (ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const spec = e.arguments[0];
      return spec && ts.isStringLiteralLike(spec) ? resolveSpec(this.mod.id, spec.text, this.frame.overlay) : null;
    }
    if (!ts.isIdentifier(e) || depth > 8) return null;
    const b = localBinding(e);
    if (b) return ts.isVariableDeclaration(b) && isConst(b) && b.initializer ? this.namespaceOf(b.initializer, depth + 1) : null;
    const imp = this.mod.imports.get(e.text);
    if (!imp?.target) return null;
    if (imp.name === '*') return imp.target;
    const r = resolveExport(imp.target, imp.name, this.frame.overlay);
    return r && 'ns' in r ? r.ns : null;
  }

  /** Walks a function, a value or a whole module reached from the action, in this module or another. */
  private enter(mod: Module, node: ts.Node, name: string, checked: boolean, depth: number): void {
    const key = `${mod.id}#${name}`;
    if (node === this.root) return this.cutAt(this.frame.stack.length - 1);
    const onStack = this.frame.stack.indexOf(key);
    if (onStack >= 0) return this.cutAt(onStack);
    if (depth > MAX_DEPTH) {
      this.facts.deep.push({ label: `${name} (${mod.id}, from ${this.mod.id})`, checked });
      return;
    }
    const cache = summaryCache(this.frame.overlay, mod);
    let sum = cache.get(`${key}@${depth}`);
    if (!sum) {
      sum = { readOnly: false, checks: 0, writes: [], unchecked: [], deep: [] };
      const stack = [...this.frame.stack, key];
      const cut = { min: Infinity };
      const walker = new Walker(mod, isFn(node) ? node : null, { ...this.frame, stack, depth, cut }, false, sum);
      if (isFn(node)) walker.fn(node, false);
      else walker.node(node, false);
      if (cut.min >= stack.length - 1) cache.set(`${key}@${depth}`, sum);
      this.cutAt(cut.min);
    }
    this.facts.writes.push(...sum.writes);
    if (!checked) this.facts.unchecked.push(...sum.unchecked);
    this.facts.checks += sum.checks;
    for (const d of sum.deep) this.facts.deep.push({ label: d.label, checked: d.checked || checked });
  }

  /**
   * A reference to something the action reaches (se-fb G5, N8, N14; İNCELEME-74
   * R1–R8, D1/D2, E4, W6/W7): a nested function declaration (hoisted, so walked
   * where it is used), a namespace bound in the function, an import of src/, or
   * a top-level function or value of this module.
   */
  private follow(id: ts.Identifier, member: string | null, checked: boolean): void {
    const b = localBinding(id);
    if (b) {
      if (ts.isFunctionDeclaration(b) && b.body && b !== this.root && !this.active.has(b)) {
        this.active.add(b);
        try {
          this.fn(b, checked);
        } finally {
          this.active.delete(b);
        }
      } else if (ts.isVariableDeclaration(b) && b.initializer) {
        const ns = this.namespaceOf(b.initializer);
        if (ns) this.followMember(ns, member, checked);
      } else if (ts.isBindingElement(b) && ts.isObjectBindingPattern(b.parent)) {
        const holder = b.parent.parent;
        const ns = ts.isVariableDeclaration(holder) && holder.initializer ? this.namespaceOf(holder.initializer) : null;
        const prop = propertyOf(b);
        if (ns && prop) this.followExport(ns, prop, member, checked);
      }
      return;
    }
    const imp = this.mod.imports.get(id.text);
    if (imp) {
      if (!imp.target) return;
      if (imp.name === '*') this.followMember(imp.target, member, checked);
      else this.followExport(imp.target, imp.name, member, checked);
      return;
    }
    const local = this.mod.all.get(id.text) ?? this.mod.values.get(id.text);
    if (local) this.enter(this.mod, local, id.text, checked, this.frame.depth);
  }

  /** `ns.member` of a namespace; the whole module when the member is not known. */
  private followMember(target: string, member: string | null, checked: boolean): void {
    if (isUnresolved(target)) return this.unresolved(target, checked);
    if (TRUSTED.has(target)) return;
    if (member === null) this.enterModule(target, '*', checked);
    else this.followExport(target, member, null, checked);
  }

  private followExport(target: string, name: string, member: string | null, checked: boolean): void {
    if (TRUSTED.has(target)) return;
    const r = resolveExport(target, name, this.frame.overlay);
    // Fail-closed (İNCELEME-74 Y-1): a name the guard cannot find is the whole module.
    if (r === null) return this.enterModule(target, name, checked);
    if ('unresolved' in r) return this.unresolved(r.unresolved, checked);
    if ('external' in r) return;
    if ('ns' in r) return this.followMember(r.ns, member, checked);
    // Another server action is an endpoint of its own: the guard judges its
    // check where it is declared, and a caller cannot skip that check.
    if (TRUSTED.has(r.mod.id) || r.mod.useServer) return;
    this.enter(r.mod, r.node, r.name, checked, this.frame.depth + 1);
  }

  /** Every function and value of a module, as if the action reached each one (fail-closed). */
  private enterModule(target: string, name: string, checked: boolean): void {
    if (isUnresolved(target)) return this.unresolved(target, checked);
    const mod = loadModule(target, this.frame.overlay);
    if (!mod || TRUSTED.has(target) || mod.useServer) return;
    const walking = this.frame.stack.findIndex((k) => k.startsWith(`${target}#?`));
    if (walking >= 0) return this.cutAt(walking);
    this.enter(mod, mod.sf, `?${name}`, checked, this.frame.depth + 1);
  }

  node(node: ts.Node, checked: boolean): void {
    if (ts.isTypeNode(node)) return;
    if (isFn(node)) {
      this.fn(node, checked);
      return;
    }
    if (ts.isBlock(node)) {
      this.statements(node.statements, checked);
      return;
    }
    if (ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      this.statements(node.statements, checked);
      return;
    }
    const write = writeOf(node, this.mod);
    if (write) {
      const line = this.mod.sf.getLineAndCharacterOfPosition(node.getStart(this.mod.sf)).line + 1;
      const top = this.frame.stack[this.frame.stack.length - 1];
      const where = this.frame.depth > 0 ? `${this.mod.sf.fileName}:${line}` : `line ${line}`;
      const via = top ? `, via ${top.split('#')[1]}${this.frame.depth > 0 ? ` (${top.split('#')[0]})` : ''}` : '';
      const label = `${write} (${where}${via})`;
      this.facts.writes.push(label);
      if (!checked) this.facts.unchecked.push(label);
    }
    if (ts.isCallExpression(node) && this.frame.stack.length === 0 && isReadOnlyCall(node)) this.facts.readOnly = true;
    // A constant `import()` or `require()` into src/ in a shape the walk does not follow by name is the whole module (İNCELEME-80 Y-2).
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0]!)) {
      const callee = strip(node.expression);
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(callee) && callee.text === 'require' && !localBinding(callee);
      if (dynamic || required) {
        const target = resolveSpec(this.mod.id, (node.arguments[0] as ts.StringLiteralLike).text, this.frame.overlay);
        if (target && (required || !this.tracked(node))) this.enterModule(target, '*', checked);
      }
    }
    // `const { wipe } = ns`: the namespace is followed where its names are used (İNCELEME-74 R6, D2).
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && this.namespaceOf(node.initializer) && flatConst(node, true)) {
      this.node(node.name, checked);
      return;
    }
    if (ts.isIdentifier(node) && isReference(node)) this.follow(node, null, checked);
    // `ns.wipe`, `ns['wipe']`, `m.wipe` of `const m = await import('…')`, `(await import('…')).wipe` (R4, R5, D1).
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const member = memberName(node, this.mod);
      const ns = member === null ? null : this.namespaceOf(node.expression);
      if (ns) {
        this.followMember(ns, member, checked);
        return;
      }
    }
    ts.forEachChild(node, (c) => this.node(c, checked));
  }
}

export interface Finding {
  key: string;
  problem: string;
}

/** The functions of a file that carry their own 'use server' (se-fb G10). */
function inlineActions(sf: ts.SourceFile, relPath: string): { key: string; fn: Fn }[] {
  const found: { key: string; fn: Fn }[] = [];
  const counts = new Map<string, number>();
  const visit = (node: ts.Node, owner: string) => {
    let next = owner;
    if (isFn(node)) {
      const own =
        (node.name && ts.isIdentifier(node.name) && node.name.text) ||
        (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) && node.parent.name.text) ||
        null;
      if (node.body && ts.isBlock(node.body) && hasDirective(node.body.statements, 'use server')) {
        const n = (counts.get(owner) ?? 0) + 1;
        counts.set(owner, n);
        found.push({ key: `${relPath}#${own ?? `inline:${owner}:${n}`}`, fn: node });
      }
      if (own) next = own;
    }
    ts.forEachChild(node, (c) => visit(c, next));
  };
  visit(sf, 'module');
  return found;
}

/**
 * Every violation in one source file. Exported for the mutant tests below;
 * `overlay` stands in for other modules of src/ by id (`lib/x`), so a mutant
 * can reach a write several modules away without touching the tree.
 */
export function findingsFor(relPath: string, text: string, overlay: Overlay = NO_OVERLAY): { findings: Finding[]; keys: string[] } {
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, scriptKindOf(relPath));
  const { mod, exported, badExports } = moduleOf(relPath.replace(SOURCE_FILE, ''), sf, overlay);
  const moduleLevel = hasDirective(sf.statements, 'use server');
  const findings: Finding[] = moduleLevel ? [...badExports] : [];
  const keys: string[] = [];

  const judge = (key: string, fn: Fn, inline: boolean) => {
    keys.push(key);
    const facts = new Walker(mod, fn, { stack: [], depth: 0, overlay, cut: { min: Infinity } }).run();
    const deep = (all: boolean) =>
      facts.deep
        .filter((d) => all || !d.checked)
        .map((d) => d.label)
        .join('; ');
    const tooDeep = `calls go deeper than ${MAX_DEPTH} modules, where the guard stops seeing writes`;
    // A write is said as one; an import the guard cannot find as what it is (İNCELEME-89 D-4).
    const said = (labels: string[], lead: string, writesLead: string) => {
      const writes = labels.filter((l) => !l.startsWith(BLIND));
      const blind = labels.filter((l) => l.startsWith(BLIND));
      return [...(writes.length > 0 ? [`${writesLead}${writes.join('; ')}`] : []), ...blind.map((b) => lead + b)].join('; ');
    };
    if (facts.readOnly) {
      if (facts.writes.length > 0) {
        findings.push({ key, problem: said(facts.writes, 'readOnly: true but ', 'readOnly: true but writes: ') });
      }
      if (facts.deep.length > 0) findings.push({ key, problem: `readOnly: true but ${tooDeep}: ${deep(true)}` });
      return;
    }
    if (inline && facts.writes.length > 0) {
      findings.push({
        key,
        problem: `inline 'use server' action writes directly (${facts.writes.join('; ')}); move the write into a module action the guard checks`,
      });
    }
    if (key in ALLOWED) return;
    if (facts.checks === 0) {
      findings.push({
        key,
        problem:
          'write action without a role check (requireTenantAction({ can: <Action> }) / if (!can(…, <Action>)) return)',
      });
    } else if (facts.unchecked.length > 0) {
      findings.push({ key, problem: said(facts.unchecked, 'before any role check, ', 'writes before any role check covers them: ') });
    }
    if (facts.checks > 0 && deep(false)) findings.push({ key, problem: `before any role check, ${tooDeep}: ${deep(false)}` });
  };

  if (moduleLevel) for (const [name, local] of exported) judge(`${relPath}#${name}`, mod.all.get(local)!, false);
  for (const { key, fn } of inlineActions(sf, relPath)) judge(key, fn, true);
  return { findings, keys };
}

function scanSrc(): { findings: Finding[]; keys: Set<string>; files: number } {
  const findings: Finding[] = [];
  const keys = new Set<string>();
  let files = 0;
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/['"]use server['"]/.test(text)) continue;
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const result = findingsFor(rel, text);
    if (result.keys.length > 0) files++;
    findings.push(...result.findings);
    result.keys.forEach((k) => keys.add(k));
  }
  return { findings, keys, files };
}

describe('server action RBAC guard (TASK-MUN80UOUPB2A4 / TASK-MUN4H2RL79D8B)', () => {
  const scan = scanSrc();

  it('scans the real server action modules', () => {
    expect(scan.files).toBeGreaterThan(25);
    expect(scan.keys.size).toBeGreaterThan(100);
  });

  it('every write action checks the caller role, and no readOnly action writes', () => {
    expect(scan.findings.map((f) => `${f.key}: ${f.problem}`)).toEqual([]);
  });

  it('every ALLOWED entry still names an exported server action', () => {
    expect(Object.keys(ALLOWED).filter((k) => !scan.keys.has(k))).toEqual([]);
  });

  describe('the guard itself turns red', () => {
    const evidence = 'app/[locale]/(app)/[workspace]/evidence/actions.ts';
    const source = fs.readFileSync(path.join(SRC, evidence), 'utf8');

    it('when a write action loses its `can`', () => {
      const mutant = source.replace(
        "export async function deleteEvidence(evidenceId: string) {\n  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });",
        'export async function deleteEvidence(evidenceId: string) {\n  const { tenantId } = await requireTenantAction();',
      );
      expect(mutant).not.toBe(source);
      expect(findingsFor(evidence, mutant).findings).toEqual([
        { key: `${evidence}#deleteEvidence`, problem: expect.stringContaining('without a role check') },
      ]);
    });

    it('when a readOnly action starts writing', () => {
      const mutant = source.replace(
        'const items = await withTenant(tenantId, (tx) =>\n      tx.evidence.findMany({',
        'await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { tenantId } }));\n    const items = await withTenant(tenantId, (tx) =>\n      tx.evidence.findMany({',
      );
      expect(mutant).not.toBe(source);
      expect(findingsFor(evidence, mutant).findings).toEqual([
        { key: `${evidence}#getEvidenceItemsAction`, problem: expect.stringContaining('tx.evidence.deleteMany') },
      ]);
    });

    it('when a readOnly action writes through a same-file helper', () => {
      const m11 = 'modules/m11/server/actions.ts';
      const m11Source = fs.readFileSync(path.join(SRC, m11), 'utf8');
      const mutant = m11Source.replace(
        "refused too, and the editor stops on that as well.\n  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });",
        'refused too, and the editor stops on that as well.\n  const { tenantId } = await requireTenantAction({ readOnly: true });',
      );
      expect(mutant).not.toBe(m11Source);
      expect(findingsFor(m11, mutant).findings).toEqual([
        {
          key: `${m11}#updatePresenceHeartbeat`,
          problem: expect.stringContaining('via savePartContent'),
        },
      ]);
    });

    // İNCELEME-59 (TASK-MUNOE0Q4FR2J) mutants that survived the first guard,
    // TASK-MUNQAXELV83HO. Each one appends or edits an action in a real module.
    const only = (file: string, text: string, key: string, problem: string) =>
      expect(findingsFor(file, text).findings).toEqual([{ key: `${file}#${key}`, problem: expect.stringContaining(problem) }]);
    const withAction = (extra: string) => source + extra;

    it('G1: a `can` whose answer decides nothing', () => {
      const mutant = withAction(
        "\nexport async function wipeEvidenceG1(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  console.debug(can(role as never, 'edit_proposal'));\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n",
      );
      only(evidence, mutant, 'wipeEvidenceG1', 'without a role check');
    });

    it('G1/B-1: a `can` that only runs for one field', () => {
      const rel = 'app/[locale]/(app)/[workspace]/relationships/actions.ts';
      const relSource = fs.readFileSync(path.join(SRC, rel), 'utf8');
      const mutant = relSource.replace(
        "const { tenantId, role } = await requireTenantAction({ can: 'view_proposal' });",
        'const { tenantId, role } = await requireTenantAction();',
      );
      expect(mutant).not.toBe(relSource);
      only(rel, mutant, 'updateRelationship', 'without a role check');
    });

    it('G2: `can: undefined`, or a permission rbac.ts does not declare', () => {
      only(
        evidence,
        withAction(
          "\nexport async function wipeEvidenceG2(id: string) {\n  const { tenantId } = await requireTenantAction({ can: undefined as never });\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n",
        ),
        'wipeEvidenceG2',
        'without a role check',
      );
      only(
        evidence,
        withAction(
          "\nexport async function wipeEvidenceG2b(id: string) {\n  const { tenantId } = await requireTenantAction({ can: 'edit_everything' as never });\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n",
        ),
        'wipeEvidenceG2b',
        'without a role check',
      );
    });

    it('G3: readOnly writes through a client named `t`', () => {
      only(
        evidence,
        withAction(
          '\nexport async function peekEvidenceG3(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, (t) => t.evidence.deleteMany({ where: { id, tenantId } }));\n}\n',
        ),
        'peekEvidenceG3',
        't.evidence.deleteMany',
      );
    });

    it('G4: readOnly writes through a destructured model', () => {
      only(
        evidence,
        withAction(
          '\nexport async function peekEvidenceG4(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, ({ evidence }) => evidence.deleteMany({ where: { id, tenantId } }));\n}\n',
        ),
        'peekEvidenceG4',
        'evidence.deleteMany',
      );
    });

    it('G8: readOnly writes through `prisma as client`', () => {
      const mutant = withAction(
        '\nexport async function peekEvidenceG8(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await client.evidence.deleteMany({ where: { id } });\n}\n',
      ).replace("import { withTenant } from '@/lib/db';", "import { withTenant, prisma as client } from '@/lib/db';");
      only(evidence, mutant, 'peekEvidenceG8', 'client.evidence.deleteMany');
    });

    it('G6: the role check moved after the write', () => {
      const profile = 'app/[locale]/(app)/[workspace]/settings/profile/actions.ts';
      const profileSource = fs.readFileSync(path.join(SRC, profile), 'utf8');
      const check = "    if (!can(asRole(scope.role), 'manage_users')) return { ok: false, error: 'forbidden' };\n";
      const after = "      revalidatePath('/[locale]/(app)/[workspace]/settings/profile', 'layout');";
      expect(profileSource).toContain(check);
      expect(profileSource).toContain(after);
      const mutant = profileSource
        .replace(check, '')
        .replace(
          after,
          "      if (!can(asRole(scope.role), 'manage_users')) return { ok: false as const, error: 'forbidden' as const };\n" +
            after,
        );
      only(profile, mutant, 'updateTenantProfile', 'writes before any role check covers them: prisma.$queryRaw (writing SQL) (lib/pic-budget.ts:38, via spendUnsolicitedPicLookup (lib/pic-budget)); tx.$executeRaw (line 145, via planPicChange); tx.auditEvent.create (line 185, via recordPicRefusal); tx.auditEvent.create (line 185, via recordPicRefusal); tx.tenantProfile.update (line 247); tx.tenantProfile.create (line 256); tx.auditEvent.create (line 269); tx.tenant.update (line 283); tx.auditEvent.create (line 284)');
    });

    it('G7: an action exported through `export { … }`', () => {
      only(
        evidence,
        withAction(
          '\nasync function wipeEvidenceG7(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\nexport { wipeEvidenceG7 as purgeEvidence };\n',
        ),
        'purgeEvidence',
        'without a role check',
      );
    });

    it('G10: an inline `use server` action that writes', () => {
      const portal = 'app/[locale]/(public)/portal/partner/[token]/page.tsx';
      const portalSource = fs.readFileSync(path.join(SRC, portal), 'utf8');
      const anchor = "            'use server';";
      expect(portalSource.split(anchor)).toHaveLength(2);
      const mutant = portalSource.replace(
        anchor,
        anchor +
          "\n            await (await import('@/lib/db')).prisma.evidence.deleteMany({ where: { id: String(fd.get('x')) } });",
      );
      only(portal, mutant, 'inline:PartnerPortalPage:1', "inline 'use server' action writes directly");
    });

    it('G10: an inline `use server` action with no role check', () => {
      const page = 'app/[locale]/(app)/[workspace]/evidence/g10-page.tsx';
      const mutant =
        "import { withTenant } from '@/lib/db';\nimport { requireTenantAction } from '@/lib/tenant';\nexport default function Page() {\n  async function wipe(fd: FormData) {\n    'use server';\n    const { tenantId } = await requireTenantAction();\n    await helperG10(tenantId, String(fd.get('id')));\n  }\n  return <form action={wipe} />;\n}\nasync function helperG10(tenantId: string, id: string) {\n  await withTenant(tenantId, (tx) => tx.evidence.delete({ where: { id } }));\n}\n";
      expect(findingsFor(page, mutant).findings).toEqual([
        { key: `${page}#wipe`, problem: expect.stringContaining("inline 'use server' action writes directly") },
        { key: `${page}#wipe`, problem: expect.stringContaining('without a role check') },
      ]);
    });

    it('G9 (fail-closed): a `can` spread from a constant is not read, and stays red', () => {
      only(
        evidence,
        withAction(
          "\nconst WRITE = { can: 'edit_proposal' } as const;\nexport async function wipeEvidenceG9(id: string) {\n  const { tenantId } = await requireTenantAction({ ...WRITE, readOnly: false });\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n",
        ),
        'wipeEvidenceG9',
        'without a role check',
      );
    });

    // İNCELEME-63 (TASK-MUNRAS3B9WBY3) mutants that survived the second guard,
    // TASK-MUNSRKW0HJYBV. Each is a new 'use server' module of its own.
    describe('İNCELEME-63 N1–N14', () => {
      const file = 'app/[locale]/(app)/[workspace]/evidence/i63-mutant.ts';
      const header = [
        "'use server';",
        "import { withTenant, prisma } from '@/lib/db';",
        "import { requireTenantAction } from '@/lib/tenant';",
        "import { can } from '@/lib/rbac';",
        '',
      ].join('\n');
      const wipe = '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n';
      const red = (body: string, key: string, problem: string) => only(file, header + body, key, problem);

      it('N1: a check whose refusal a `catch` swallows', () => {
        red(
          "export async function n1(id: string) {\n  const { tenantId } = await requireTenantAction();\n  try {\n    await requireTenantAction({ can: 'edit_proposal' });\n  } catch {\n    /* swallowed */\n  }\n" +
            wipe +
            '}\n',
          'n1',
          'writes before any role check covers them: tx.evidence.deleteMany',
        );
      });

      it('N2: a check that is not awaited, or whose rejection is caught', () => {
        red(
          "export async function n2(id: string) {\n  const { tenantId } = await requireTenantAction();\n  void requireTenantAction({ can: 'edit_proposal' });\n" + wipe + '}\n',
          'n2',
          'without a role check',
        );
        red(
          "export async function n2b(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await requireTenantAction({ can: 'edit_proposal' }).catch(() => null);\n" + wipe + '}\n',
          'n2b',
          'without a role check',
        );
        red(
          "export async function n2c(id: string) {\n  const { tenantId } = await requireTenantAction();\n  const pending = requireTenantAction({ can: 'edit_proposal' });\n  void pending;\n" + wipe + '}\n',
          'n2c',
          'without a role check',
        );
      });

      it('N3: a same-file stand-in for `can` or `requirePlatformAdmin`', () => {
        only(
          file,
          header.replace("import { can } from '@/lib/rbac';\n", '') +
            "const can = (..._a: unknown[]) => true;\nexport async function n3(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  if (!can(role, 'edit_proposal')) return;\n" +
            wipe +
            '}\n',
          'n3',
          'without a role check',
        );
        red(
          "function requirePlatformAdmin() {}\nexport async function n3b(id: string) {\n  const { tenantId } = await requireTenantAction();\n  requirePlatformAdmin();\n" + wipe + '}\n',
          'n3b',
          'without a role check',
        );
        // Imported, but from somewhere else than rbac.ts.
        only(
          file,
          header.replace("import { can } from '@/lib/rbac';", "import { can } from '@/lib/utils';") +
            "export async function n3c(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  if (!can(role, 'edit_proposal')) return;\n" +
            wipe +
            '}\n',
          'n3c',
          'without a role check',
        );
      });

      it("N4: `can` asked about a role written in the code, not the caller's", () => {
        red(
          "export async function n4(id: string) {\n  const { tenantId } = await requireTenantAction();\n  if (!can('TENANT_OWNER', 'edit_proposal')) return;\n" + wipe + '}\n',
          'n4',
          'without a role check',
        );
        red(
          "export async function n4b(id: string) {\n  const { tenantId } = await requireTenantAction();\n  if (!can(Role.TENANT_OWNER, 'edit_proposal')) return;\n" + wipe + '}\n',
          'n4b',
          'without a role check',
        );
      });

      it('N5: a helper that may return before its check, or refuses by returning', () => {
        red(
          "async function gate(skip: boolean) {\n  if (skip) return;\n  await requireTenantAction({ can: 'edit_proposal' });\n}\nexport async function n5(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await gate(true);\n" +
            wipe +
            '}\n',
          'n5',
          'writes before any role check covers them',
        );
        red(
          "async function gate(role: string) {\n  if (!can(role as never, 'edit_proposal')) return { ok: false };\n  return { ok: true };\n}\nexport async function n5b(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  await gate(role);\n" +
            wipe +
            '}\n',
          'n5b',
          // İNCELEME-74 Y-2: walked by reference, `gate`'s `role` is only a parameter, so its `can` is no check at all.
          'without a role check',
        );
        red(
          "async function gate() {\n  try {\n    await requireTenantAction({ can: 'edit_proposal' });\n  } catch {\n    return null;\n  }\n}\nexport async function n5c(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await gate();\n" +
            wipe +
            '}\n',
          'n5c',
          'writes before any role check covers them',
        );
      });

      it('N6: a write in a parameter default, which runs before the body', () => {
        red(
          "export async function n6(id: string, _w = prisma.evidence.deleteMany({ where: { id } })) {\n  await requireTenantAction({ can: 'edit_proposal' });\n  return _w;\n}\n",
          'n6',
          'writes before any role check covers them: prisma.evidence.deleteMany',
        );
      });

      it("N7: readOnly writes through `tx['evidence']`", () => {
        red(
          "export async function n7(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, (tx) => tx['evidence'].deleteMany({ where: { id, tenantId } }));\n}\n",
          'n7',
          "tx['evidence'].deleteMany",
        );
      });

      it('N8: readOnly hands a same-file writer over by reference', () => {
        red(
          'const wipeTx = (tx: typeof prisma) => tx.evidence.deleteMany({});\nexport async function n8(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  void id;\n  await withTenant(tenantId, wipeTx as never);\n}\n',
          'n8',
          'via wipeTx',
        );
      });

      it('N9: readOnly writes through `$queryRaw` SQL', () => {
        red(
          'export async function n9(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await prisma.$queryRaw`DELETE FROM "Evidence" WHERE id = ${id} RETURNING id`;\n}\n',
          'n9',
          'prisma.$queryRaw (writing SQL)',
        );
        red(
          "export async function n9b(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await prisma.$queryRawUnsafe('UPDATE \"Evidence\" SET title = $1 RETURNING id', id);\n}\n",
          'n9b',
          'prisma.$queryRawUnsafe (writing SQL)',
        );
      });

      it('N10: an exported value the guard cannot read', () => {
        red(
          "const wrap = <T,>(f: T): T => f;\nexport const n10 = wrap(async (id: string) => {\n  const { tenantId } = await requireTenantAction();\n" + wipe + '});\n',
          'n10',
          'exported value is not a function the guard can read',
        );
      });

      it('N11: the anonymous `export default`', () => {
        red(
          'export default async function (id: string) {\n  const { tenantId } = await requireTenantAction();\n' + wipe + '}\n',
          'default',
          'without a role check',
        );
        red(
          'export default async (id: string) => {\n  const { tenantId } = await requireTenantAction();\n' + wipe + '};\n',
          'default',
          'without a role check',
        );
      });

      it('N12: a model accessor kept in another variable', () => {
        red(
          'export async function n12(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, (tx) => {\n    const ev = tx.evidence;\n    return ev.deleteMany({ where: { id, tenantId } });\n  });\n}\n',
          'n12',
          'ev.deleteMany',
        );
        red(
          'export async function n12b(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, ({ evidence: ev }) => ev.deleteMany({ where: { id, tenantId } }));\n}\n',
          'n12b',
          'ev.deleteMany',
        );
      });

      it('N13: a check inside an optional call that never runs', () => {
        red(
          "const skip = undefined as undefined | ((x: unknown) => void);\nexport async function n13(id: string) {\n  const { tenantId } = await requireTenantAction();\n  skip?.(await requireTenantAction({ can: 'edit_proposal' }));\n" +
            wipe +
            '}\n',
          'n13',
          'without a role check',
        );
      });

      it('N14 / G5: a write in another module, before the check or under readOnly', () => {
        const scoring = "import { scoreCandidatesForSeat } from '@/lib/scoring/consortium';\n";
        red(
          scoring +
            "export async function n14(opportunityId: string) {\n  const { tenantId, role } = await requireTenantAction();\n  await scoreCandidatesForSeat(opportunityId, tenantId as never);\n  if (!can(role as never, 'manage_workspaces')) return;\n}\n",
          'n14',
          'writes before any role check covers them: tx.seatCandidate.deleteMany (lib/scoring/consortium.ts:',
        );
        red(
          scoring +
            'export async function g5(opportunityId: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await scoreCandidatesForSeat(opportunityId, tenantId as never);\n}\n',
          'g5',
          'readOnly: true but writes: tx.seatCandidate.deleteMany (lib/scoring/consortium.ts:',
        );
        // After the check, the same call is fine.
        expect(
          findingsFor(
            file,
            header +
              scoring +
              "export async function g5ok(opportunityId: string) {\n  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });\n  await scoreCandidatesForSeat(opportunityId, tenantId as never);\n}\n",
          ).findings,
        ).toEqual([]);
      });

      it(`G5: follows imports ${MAX_DEPTH} modules deep, through a barrel and a namespace import`, () => {
        // lib/i63/l1 → … → l6, the write in l6; l3 is reached through a barrel, l5 through `import * as`.
        const overlay: Record<string, string> = {
          'lib/i63/l1': "import { l2 } from './barrel';\nexport async function l1(id: string) { return l2(id); }\n",
          'lib/i63/barrel': "export { l2 } from './l2';\n",
          'lib/i63/l2': "import { l3 } from '@/lib/i63/l3';\nexport const l2 = async (id: string) => l3(id);\n",
          'lib/i63/l3': "import { l4 } from './l4';\nexport async function l3(id: string) { await l4(id); }\n",
          'lib/i63/l4': "import * as five from './l5';\nexport async function l4(id: string) { await five.l5(id); }\n",
          'lib/i63/l5': "import l6 from './l6';\nexport async function l5(id: string) { await l6(id); }\n",
          'lib/i63/l6':
            "import { prisma } from '@/lib/db';\nexport default async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n",
        };
        const action =
          header +
          "import { l1 } from '@/lib/i63/l1';\nexport async function deep(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await l1(id);\n}\n";
        expect(findingsFor(file, action, overlay).findings).toEqual([
          { key: `${file}#deep`, problem: expect.stringContaining('prisma.evidence.delete (lib/i63/l6.ts:2, via wipe (lib/i63/l6))') },
        ]);
        // One module more and the walk stops — and says so (İNCELEME-74 L7+: fail-closed, not silent).
        const deeper = { ...overlay, 'lib/i63/l0': "import { l1 } from './l1';\nexport async function l0(id: string) { await l1(id); }\n" };
        expect(findingsFor(file, action.replace("import { l1 } from '@/lib/i63/l1'", "import { l0 as l1 } from '@/lib/i63/l0'"), deeper).findings).toEqual([
          { key: `${file}#deep`, problem: expect.stringContaining(`calls go deeper than ${MAX_DEPTH} modules`) },
        ]);
      });
    });

    // İNCELEME-74 (TASK-MUNWYYJY6UH64, crw-fb) mutants that survived the third
    // guard, TASK-MUNY0V7B590EI. Other modules are given through the overlay.
    describe('İNCELEME-74 R/S/W/E/D/L', () => {
      const file = 'app/[locale]/(app)/[workspace]/evidence/i74-mutant.ts';
      const header = [
        "'use server';",
        "import { withTenant, prisma } from '@/lib/db';",
        "import { requireTenantAction } from '@/lib/tenant';",
        "import { can } from '@/lib/rbac';",
        "import { Prisma, Role as R, $Enums } from '@prisma/client';",
        '',
      ].join('\n');
      const wipe = '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n';
      const ro = '  const { tenantId } = await requireTenantAction({ readOnly: true });\n';
      const ctl = '  const { tenantId, role } = await requireTenantAction();\n';
      const fn = (name: string, body: string) => `export async function ${name}(id: string) {\n${body}}\n`;
      const impl = (name: string) =>
        `import { prisma } from '@/lib/db';\nexport async function ${name}(id: string) { await prisma.evidence.delete({ where: { id } }); }\n`;
      const red = (text: string, key: string, problem: string, overlay: Overlay = {}) =>
        expect(findingsFor(file, header + text, overlay).findings).toEqual([
          { key: `${file}#${key}`, problem: expect.stringContaining(problem) },
        ]);
      const green = (text: string, overlay: Overlay = {}) => expect(findingsFor(file, header + text, overlay).findings).toEqual([]);
      const imp = (spec: string) => `${spec}\n`;
      const readOnlyWrite = 'readOnly: true but writes: prisma.evidence.delete (lib/i74/';

      it('R1–R3: a barrel that exports an import again, as default, or as a `const`', () => {
        red(imp("import { w } from '@/lib/i74/r1';") + fn('r1', ro + '  await w(id);\n'), 'r1', readOnlyWrite, {
          'lib/i74/r1': "import { w } from './r1impl';\nexport { w };\n",
          'lib/i74/r1impl': impl('w'),
        });
        red(imp("import w from '@/lib/i74/r2';") + fn('r2', ro + '  await w(id);\n'), 'r2', readOnlyWrite, {
          'lib/i74/r2': "import { wipe } from './r2impl';\nexport default wipe;\n",
          'lib/i74/r2impl': impl('wipe'),
        });
        red(imp("import { w } from '@/lib/i74/r3';") + fn('r3', ro + '  await w(id);\n'), 'r3', readOnlyWrite, {
          'lib/i74/r3': "import { wipe } from './r3impl';\nexport const w = wipe;\n",
          'lib/i74/r3impl': impl('wipe'),
        });
      });

      it('R4–R6: namespaces — `export * as ns`, `ns[\'x\']`, `const { x } = ns`', () => {
        red(imp("import { ns } from '@/lib/i74/r4';") + fn('r4', ro + '  await ns.wipe(id);\n'), 'r4', readOnlyWrite, {
          'lib/i74/r4': "export * as ns from './r4impl';\n",
          'lib/i74/r4impl': impl('wipe'),
        });
        red(imp("import * as ns from '@/lib/i74/r5';") + fn('r5', ro + "  await ns['wipe'](id);\n"), 'r5', readOnlyWrite, {
          'lib/i74/r5': impl('wipe'),
        });
        red(imp("import * as ns from '@/lib/i74/r6';") + fn('r6', ro + '  const { wipe } = ns;\n  await wipe(id);\n'), 'r6', readOnlyWrite, {
          'lib/i74/r6': impl('wipe'),
        });
      });

      it('R7/R8: a wrapped function or an object of methods in another module', () => {
        red(imp("import { w } from '@/lib/i74/r7';") + fn('r7', ro + '  await w(id);\n'), 'r7', readOnlyWrite, {
          'lib/i74/r7':
            "import { prisma } from '@/lib/db';\nconst logged = <T,>(f: T) => f;\nexport const w = logged(async (id: string) => { await prisma.evidence.delete({ where: { id } }); });\n",
        });
        red(imp("import { repo } from '@/lib/i74/r8';") + fn('r8', ro + '  await repo.wipe(id);\n'), 'r8', readOnlyWrite, {
          'lib/i74/r8':
            "import { prisma } from '@/lib/db';\nexport const repo = { async wipe(id: string) { await prisma.evidence.delete({ where: { id } }); } };\n",
        });
      });

      it('Y-1 fail-closed: a name the guard cannot resolve is the whole module', () => {
        // A destructured export: no function or value the guard reads by name.
        const overlay = {
          'lib/i74/u1':
            "import { prisma } from '@/lib/db';\nconst r = { async wipe(id: string) { await prisma.evidence.delete({ where: { id } }); } };\nexport const { wipe } = r;\n",
        };
        red(imp("import { wipe } from '@/lib/i74/u1';") + fn('u1', ro + '  await wipe(id);\n'), 'u1', 'via ?wipe (lib/i74/u1)', overlay);
        // The same shape in a module that does not write stays green.
        green(imp("import { pick } from '@/lib/i74/u2';") + fn('u2', ro + '  return pick(id);\n'), {
          'lib/i74/u2': 'const r = { pick: (id: string) => id.trim() };\nexport const { pick } = r;\n',
        });
      });

      it('D1/D2: a dynamic `import()` of a module of src/', () => {
        red(
          fn('d1', ro + "  const m = await import('@/lib/scoring/consortium');\n  await m.scoreCandidatesForSeat(id, tenantId as never);\n"),
          'd1',
          'readOnly: true but writes: tx.seatCandidate.deleteMany (lib/scoring/consortium.ts:',
        );
        red(
          fn(
            'd2',
            ctl +
              "  const { scoreCandidatesForSeat } = await import('@/lib/scoring/consortium');\n  await scoreCandidatesForSeat(id, tenantId as never);\n  if (!can(role, 'manage_workspaces')) return;\n",
          ),
          'd2',
          'writes before any role check covers them: tx.seatCandidate.deleteMany (lib/scoring/consortium.ts:',
        );
      });

      it('E4: a nested function declaration called before the check (hoisting)', () => {
        red(
          fn(
            'e4',
            "  const { tenantId, role } = await requireTenantAction();\n  wipeInner();\n  if (!can(role, 'edit_proposal')) return;\n  function wipeInner() {\n    void withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { tenantId } }));\n  }\n",
          ),
          'e4',
          'writes before any role check covers them: tx.evidence.deleteMany',
        );
      });

      it('S1/S2: a check shadowed by a local or a parameter', () => {
        const none = 'without a role check';
        red(fn('s1', ctl + "  const can = (_r: unknown, _a: string) => true;\n  if (!can(role, 'edit_proposal')) return;\n" + wipe), 's1', none);
        red(
          "export async function s2(id: string, requireTenantAction = async (_o?: unknown) => ({ tenantId: id })) {\n  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });\n" +
            wipe +
            '}\n',
          's2',
          none,
        );
        // A parameter named like a same-file helper that checks is not that helper.
        red(
          "async function gate() {\n  await requireTenantAction({ can: 'edit_proposal' });\n}\nexport async function s2b(id: string, gate = async () => {}) {\n  const { tenantId } = await requireTenantAction();\n  await gate();\n" +
            wipe +
            '}\n',
          's2b',
          none,
        );
      });

      it("S3–S8: `can` asked about a role that is not the caller's session role", () => {
        const none = 'without a role check';
        red(
          "export async function s3(id: string, input: { role: string }) {\n  const { tenantId } = await requireTenantAction();\n  if (!can(input.role as never, 'edit_proposal')) return;\n" +
            wipe +
            '}\n',
          's3',
          none,
        );
        const fixed = (key: string, role: string, pre = '') =>
          red(fn(key, `  const { tenantId } = await requireTenantAction();\n${pre}  if (!can(${role}, 'edit_proposal')) return;\n` + wipe), key, none);
        fixed('s4', 'r', "  const r = 'TENANT_OWNER';\n");
        fixed('s5', 'R.TENANT_OWNER');
        fixed('s6', '$Enums.Role.TENANT_OWNER');
        fixed('s7', "`TENANT_${'OWNER'}` as never");
        red(fn('s8', ctl + "  if (!can(('TENANT_OWNER' || role) as never, 'edit_proposal')) return;\n" + wipe), 's8', none);
        // A session role overwritten before the check: `let`, a default, a reassigned helper parameter.
        red(fn('s9', "  const s = await requireTenantAction();\n  let role = s.role;\n  role = 'TENANT_OWNER';\n  const { tenantId } = s;\n  if (!can(role, 'edit_proposal')) return;\n" + wipe), 's9', none);
        red(fn('s10', "  const { tenantId, role = 'TENANT_OWNER' } = await requireTenantAction();\n  if (!can(role, 'edit_proposal')) return;\n" + wipe), 's10', none);
        red(
          "async function gate(role: string) {\n  role = 'TENANT_OWNER';\n  if (!can(role as never, 'edit_proposal')) throw new Error('no');\n}\n" +
            fn('s11', ctl + '  await gate(role);\n' + wipe),
          's11',
          none,
        );
        // A helper parameter overwritten by destructuring or a loop.
        for (const [key, write] of [
          ['s11b', "  [role] = ['TENANT_OWNER'];\n"],
          ['s11c', "  ({ role } = { role: 'TENANT_OWNER' });\n"],
          ['s11d', "  for (role of ['TENANT_OWNER']) break;\n"],
        ]) {
          red(
            `async function gate(role: string) {\n${write}  if (!can(role as never, 'edit_proposal')) throw new Error('no');\n}\n` +
              fn(key!, ctl + '  await gate(role);\n' + wipe),
            key!,
            none,
          );
        }
        // A `const` session object whose role is overwritten.
        red(fn('s13', "  const scope = await requireTenantAction();\n  (scope as { role: string }).role = 'TENANT_OWNER';\n  const { tenantId } = scope;\n  if (!can(asRole(scope.role), 'edit_proposal')) return;\n" + wipe).replace('export async', "import { asRole } from '@/lib/rbac';\nexport async"), 's13', none);
        // `assertTenantActionRole` and `canConfirmSeat` read the session too.
        red(
          "import { assertTenantActionRole } from '@/lib/tenant';\n" +
            fn('s12', "  const { tenantId } = await requireTenantAction();\n  assertTenantActionRole({ role: 'TENANT_OWNER' }, 'edit_proposal');\n" + wipe),
          's12',
          none,
        );
      });

      it('W1–W9: a write the guard does not see as a call on a model', () => {
        const w = (key: string, body: string, problem: string, pre = '') => red(pre + fn(key, ro + body), key, `readOnly: true but writes: ${problem}`);
        w('w1', '  await withTenant(tenantId, (tx) => { const del = tx.evidence.deleteMany; return del({ where: { id, tenantId } }); });\n', 'tx.evidence.deleteMany (taken as a value)');
        w('w2', '  await withTenant(tenantId, (tx) => { const { deleteMany } = tx.evidence; return deleteMany({ where: { id, tenantId } }); });\n', 'deleteMany = tx.evidence (taken as a value)');
        w('w3', '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany.call(tx.evidence, { where: { id, tenantId } }));\n', 'tx.evidence.deleteMany (taken as a value)');
        w('w4', "  const m = 'deleteMany' as const;\n  await withTenant(tenantId, (tx) => tx.evidence[m]({ where: { id, tenantId } }));\n", 'tx.evidence[m]');
        w('w4b', '  const m = String(id) as never;\n  await withTenant(tenantId, (tx) => tx.evidence[m]({ where: { id, tenantId } }));\n', 'tx.evidence[m] (method the guard cannot read)');
        w('w5', '  const q = Prisma.sql`DELETE FROM "Evidence" WHERE id = ${id} RETURNING id`;\n  await withTenant(tenantId, (tx) => tx.$queryRaw(q));\n', 'tx.$queryRaw (writing SQL)');
        w('w5b', '  await withTenant(tenantId, (tx) => tx.$queryRaw(Prisma.raw(id)));\n', 'tx.$queryRaw (SQL the guard cannot read)');
        w('w6', '  await withTenant(tenantId, (tx) => helpers.wipe(tx, id));\n', 'tx.evidence.deleteMany (line 6, via helpers)', 'const helpers = { wipe: (tx: any, id: string) => tx.evidence.deleteMany({ where: { id } }) };\n');
        w('w7', '  await withTenant(tenantId, (tx) => Wiper.run(tx, id));\n', 'tx.evidence.deleteMany (line 6, via Wiper)', 'class Wiper { static run(tx: any, id: string) { return tx.evidence.deleteMany({ where: { id } }); } }\n');
        w('w8', '  await withTenant(tenantId, (tx) => wipeVia(tx.evidence, id));\n', 'tx.evidence (model handed to wipeVia)', 'async function wipeVia(repo: { deleteMany: (a: unknown) => Promise<unknown> }, id: string) { await repo.deleteMany({ where: { id } }); }\n');
        w('w9', '  await withTenant(tenantId, (tx) => Reflect.apply(tx.evidence.deleteMany, tx.evidence, [{ where: { id } }]));\n', 'tx.evidence.deleteMany (taken as a value)');
      });

      it(`L7+: calls deeper than ${MAX_DEPTH} modules are red, not silent`, () => {
        const chain: Overlay = {};
        for (let i = 1; i < 12; i++) chain[`lib/i74/c${i}`] = `import { c${i + 1} } from './c${i + 1}';\nexport async function c${i}(id: string) { await c${i + 1}(id); }\n`;
        chain['lib/i74/c12'] = impl('c12');
        red(imp("import { c1 } from '@/lib/i74/c1';") + fn('l12', ro + '  await c1(id);\n'), 'l12', `calls go deeper than ${MAX_DEPTH} modules`, chain);
        // After the check, a deep write action is fine.
        green(imp("import { c1 } from '@/lib/i74/c1';") + fn('l12ok', "  await requireTenantAction({ can: 'edit_proposal' });\n  await c1(id);\n"), chain);
      });

      it('stays green for the shapes the new rules accept', () => {
        const reader = "import { prisma } from '@/lib/db';\nexport async function peek(id: string) { return prisma.evidence.findMany({ where: { id } }); }\n";
        // Barrels, namespaces and values that only read.
        green(imp("import { peek } from '@/lib/i74/g1';") + fn('g1', ro + '  await peek(id);\n'), {
          'lib/i74/g1': "import { peek } from './g1impl';\nexport { peek };\n",
          'lib/i74/g1impl': reader,
        });
        green(imp("import * as ns from '@/lib/i74/g2';") + fn('g2', ro + "  await ns['peek'](id);\n  const { peek } = ns;\n  await peek(id);\n"), {
          'lib/i74/g2': reader,
        });
        green(imp("import { WEIGHTS, Kind } from '@/lib/i74/g3';") + fn('g3', ro + '  return [WEIGHTS.a, Kind.A, id];\n'), {
          'lib/i74/g3': "export const WEIGHTS = { a: 1 };\nexport enum Kind { A = 'a' }\n",
        });
        // The role from the session, however it is reached.
        green(
          "import { auth } from '@/lib/auth';\nimport { asRole } from '@/lib/rbac';\nimport { assertTenantActionRole, tenantScopeOf } from '@/lib/tenant';\n" +
            'async function sessionScope() {\n  try {\n    return tenantScopeOf(await auth());\n  } catch {\n    return null;\n  }\n}\n' +
            "export async function g4(id: string) {\n  const scope = await sessionScope();\n  if (!scope) return;\n  assertTenantActionRole(scope, 'edit_proposal');\n  const { tenantId } = scope;\n" +
            wipe +
            '}\n' +
            "export async function g5(id: string) {\n  const session = (await auth()) as unknown;\n  const s = session as { tenantId: string; role?: string } | null;\n  const tenantId = s?.tenantId ?? '';\n  if (!can(s?.role as never, 'edit_proposal')) return;\n" +
            wipe +
            '}\n' +
            "export async function g6(id: string) {\n  const scope = await requireTenantAction();\n  const { tenantId } = scope;\n  if (!can(asRole(scope.role), 'edit_proposal')) return;\n" +
            wipe +
            '}\n' +
            "async function gate({ role }: { role: string }) {\n  if (!can(role as never, 'edit_proposal')) throw new Error('no');\n}\n" +
            fn('g7', "  const scope = await requireTenantAction();\n  const { tenantId } = scope;\n  await gate(scope);\n" + wipe),
        );
      });
    });

    // İNCELEME-80 (TASK-MUO12FXI8LDXJ, devop-fb) Y-1/Y-2 and se-fb Y-3, TASK-MUO4GP1P89HS7.
    describe('İNCELEME-80 Y-1/Y-2/Y-3', () => {
      const file = 'app/[locale]/(app)/[workspace]/evidence/i80-mutant.ts';
      const header = [
        "'use server';",
        "import { withTenant, prisma } from '@/lib/db';",
        "import { requireTenantAction } from '@/lib/tenant';",
        "import { can } from '@/lib/rbac';",
        '',
      ].join('\n');
      const ro = '  const { tenantId } = await requireTenantAction({ readOnly: true });\n';
      const fn = (name: string, body: string) => `export async function ${name}(id: string, flag = false) {\n${body}}\n`;
      const impl = "import { prisma } from '@/lib/db';\nexport async function wipe(id) { await prisma.evidence.delete({ where: { id } }); }\n";
      const reader = "import { prisma } from '@/lib/db';\nexport async function read(id: string) { return prisma.evidence.findUnique({ where: { id } }); }\n";
      const red = (text: string, key: string, problem: string, overlay: Overlay = {}, at = file) =>
        expect(findingsFor(at, text, overlay).findings).toEqual([{ key: `${at}#${key}`, problem: expect.stringContaining(problem) }]);
      const green = (text: string, overlay: Overlay = {}) => expect(findingsFor(file, header + text, overlay).findings).toEqual([]);
      const readOnlyWrite = 'readOnly: true but writes: prisma.evidence.delete (lib/i80/';

      it('Y-1: a writer in a .js/.jsx/.mjs/.mts/.cjs/.cts module, by any specifier', () => {
        for (const [key, spec, where] of [
          ['x1', '@/lib/i80/legacy', 'legacy.js'],
          ['x1b', '@/lib/i80/legacy.js', 'legacy.js'],
          ['x2', '@/lib/i80/view', 'view.jsx'],
          ['x3', '@/lib/i80/modern.mjs', 'modern.mts'],
          ['x4', '@/lib/i80/plain.mjs', 'plain.mjs'],
          ['x5', '@/lib/i80/old.cjs', 'old.cts'],
          ['x6', '@/lib/i80/older', 'older.cjs'],
          ['x7', '@/lib/i80/dir', 'dir/index.js'],
        ] as const) {
          red(header + `import { wipe } from '${spec}';\n` + fn(key, ro + '  await wipe(id);\n'), key, `${readOnlyWrite}${where}:2`, {
            'lib/i80/legacy.js': impl,
            'lib/i80/view.jsx': impl,
            'lib/i80/modern.mts': impl.replace('(id)', '(id: string)'),
            'lib/i80/plain.mjs': impl,
            'lib/i80/old.cts': impl.replace('(id)', '(id: string)'),
            'lib/i80/older.cjs': impl,
            'lib/i80/dir/index.js': impl,
          });
        }
      });

      it("Y-1: a 'use server' module in .js is an endpoint like a .ts one", () => {
        const js = 'app/[locale]/(app)/[workspace]/evidence/i80-actions.js';
        red(
          "'use server';\nimport { prisma } from '@/lib/db';\nimport { requireTenantAction } from '@/lib/tenant';\nexport async function jsAction(id) {\n  await requireTenantAction({ readOnly: true });\n  await prisma.evidence.delete({ where: { id } });\n}\n",
          'jsAction',
          'readOnly: true but writes: prisma.evidence.delete (line 6)',
          {},
          js,
        );
        // And the scan picks such files up, but not declarations or tests.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbac-guard-'));
        try {
          const names = ['a.ts', 'b.tsx', 'c.js', 'd.jsx', 'e.mjs', 'f.cjs', 'g.mts', 'h.cts', 'i.d.ts', 'j.d.mts', 'k.test.js', 'l.json', 'm.css'];
          for (const n of names) fs.writeFileSync(path.join(dir, n), '');
          expect(sourceFiles(dir).map((f) => path.basename(f)).sort()).toEqual(['a.ts', 'b.tsx', 'c.js', 'd.jsx', 'e.mjs', 'f.cjs', 'g.mts', 'h.cts']);
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });

      it('Y-1: an import into src/ that names no file is fail-closed, not a package', () => {
        const none = 'readOnly: true but imports src/lib/i80/missing, which the guard cannot find (fail-closed): fix the specifier or add the file';
        red(header + "import { wipe } from '@/lib/i80/missing';\n" + fn('u1', ro + '  await wipe(id);\n'), 'u1', none);
        red(header + "import * as m from '../../../../../lib/i80/missing';\n" + fn('u2', ro + '  await m.wipe(id);\n'), 'u2', none);
        // Through a barrel that re-exports it.
        red(header + "import { wipe } from '@/lib/i80/barrel';\n" + fn('u3', ro + '  await wipe(id);\n'), 'u3', none, {
          'lib/i80/barrel': "export { wipe } from './missing';\n",
        });
        red(header + fn('u4', ro + "  const { wipe } = await import('@/lib/i80/missing');\n  await wipe(id);\n"), 'u4', none);
        // After the role check, the same import is covered like any write.
        green("import { wipe } from '@/lib/i80/missing';\n" + fn('u5', "  await requireTenantAction({ can: 'edit_proposal' });\n  await wipe(id);\n"));
        // Files that are not code, a package, and a path out of src/ stay green.
        green(
          "import data from '@/locales/en/settings.json';\nimport art from '@/contracts/artifacts/DualApproval.json';\nimport '@/app/globals.css';\nimport { z } from 'zod';\n" +
            fn('u6', ro + "  const m = await import('@/locales/en/dashboard.json');\n  return [data, art, m, z, id];\n"),
        );
      });

      it('Y-1/D-2: an `@/` specifier is normalized, so `@/lib/./rbac` is the check', () => {
        green(
          "import { can as c2 } from '@/lib/./rbac';\n" +
            fn('d2', "  const { tenantId, role } = await requireTenantAction();\n  if (!c2(role, 'edit_proposal')) return;\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n"),
        );
      });

      it('Y-2: a constant `import()` in a shape the walk does not follow by name is the whole module', () => {
        const ov: Overlay = { 'lib/i80/a': reader, 'lib/i80/b': impl };
        const via = (key: string, body: string, pre = '') => red(header + pre + fn(key, ro + body), key, readOnlyWrite, ov);
        via('c1', "  const m = flag ? await import('@/lib/i80/a') : await import('@/lib/i80/b');\n  await m.read(id);\n");
        via('c4', "  const { read } = await (flag ? import('@/lib/i80/a') : import('@/lib/i80/b'));\n  await read(id);\n");
        via('c5', "  await (await lazy).read(id);\n", "const lazy = import('@/lib/i80/b');\n");
        via('c6', "  const [m] = await Promise.all([import('@/lib/i80/b')]);\n  await m.read(id);\n");
        via('c9', "  const { default: { read } } = await import('@/lib/i80/b');\n  await read(id);\n");
        via('c10', "  const k = String(id) as 'read';\n  await (await import('@/lib/i80/b'))[k](id);\n");
        via('c11', "  const { ...all } = await import('@/lib/i80/b');\n  await all.read(id);\n");
        via('c12', "  var m = await import('@/lib/i80/b');\n  await m.read(id);\n");
        via('c13', "  const m = require('@/lib/i80/b');\n  await m.read(id);\n");
        via('c14', "  const load = () => import('@/lib/i80/b');\n  await (await load()).read(id);\n");
        // What the walk does follow by name stays precise: `read` of a module that also writes.
        const both: Overlay = { 'lib/i80/rw': reader + "export async function wipe(id: string) { await prisma.evidence.delete({ where: { id } }); }\n" };
        green(fn('c15', ro + "  const { read } = await import('@/lib/i80/rw');\n  const m = await import('@/lib/i80/rw');\n  return [await read(id), await m.read(id), await (await import('@/lib/i80/rw')).read(id)];\n"), both);
      });

      it('Y-3: a `.ts` module is parsed as TypeScript, so `<T>expr` does not hide a write', () => {
        red(header + fn('y3', ro + '  await withTenant(tenantId, (tx) => <any>tx.evidence.deleteMany({ where: { id } }));\n'), 'y3', 'readOnly: true but writes: tx.evidence.deleteMany');
        red(header + "import { w } from '@/lib/i80/cast';\n" + fn('y3b', ro + '  await w(id);\n'), 'y3b', 'readOnly: true but writes: prisma.evidence.deleteMany (lib/i80/cast.ts:2', {
          'lib/i80/cast': "import { prisma } from '@/lib/db';\nexport async function w(id: string) { return <Promise<unknown>>prisma.evidence.deleteMany({ where: { id } }); }\n",
        });
      });

      it('Ö-1: a walk cut short by recursion is not reused for another caller', () => {
        // q.g → p.f → q.g (cut). p.f's walk under g misses g's write; a readOnly
        // action that reaches p.f first must still see it.
        const ov: Overlay = {
          'lib/i80/p': "import { g } from './q';\nexport async function f(id: string) { await g(id); }\n",
          'lib/i80/q':
            "import { prisma } from '@/lib/db';\nimport { f } from './p';\nexport async function g(id: string) { if (id) await f(id.slice(1)); await prisma.evidence.delete({ where: { id } }); }\n",
        };
        // `second` reaches p.f through r.h, at the same depth `first` reached it.
        ov['lib/i80/r'] = "import { f } from './p';\nexport async function h(id: string) { await f(id); }\n";
        const text =
          header +
          "import { g } from '@/lib/i80/q';\nimport { h } from '@/lib/i80/r';\n" +
          fn('first', "  await requireTenantAction({ can: 'edit_proposal' });\n  await g(id);\n") +
          fn('second', ro + '  await h(id);\n');
        expect(findingsFor(file, text, ov).findings).toEqual([
          { key: `${file}#second`, problem: expect.stringContaining('prisma.evidence.delete (lib/i80/q.ts:3, via g (lib/i80/q))') },
        ]);
      });

      it('Ö-1: a function reached at another depth is walked again, so MAX_DEPTH still holds', () => {
        // x → c2 … c6 writes at depth 6 from the action; one wrapper more and it is past MAX_DEPTH.
        const ov: Overlay = { 'lib/i80/x': "import { c2 } from './c2';\nexport async function x(id: string) { await c2(id); }\n" };
        for (let i = 2; i < MAX_DEPTH; i++) ov[`lib/i80/c${i}`] = `import { c${i + 1} } from './c${i + 1}';\nexport async function c${i}(id: string) { await c${i + 1}(id); }\n`;
        ov[`lib/i80/c${MAX_DEPTH}`] = `import { prisma } from '@/lib/db';\nexport async function c${MAX_DEPTH}(id: string) { await prisma.evidence.delete({ where: { id } }); }\n`;
        ov['lib/i80/wrap'] = "import { x } from './x';\nexport async function wrap(id: string) { await x(id); }\n";
        const text =
          header +
          "import { x } from '@/lib/i80/x';\nimport { wrap } from '@/lib/i80/wrap';\n" +
          fn('shallow', "  await requireTenantAction({ can: 'edit_proposal' });\n  await x(id);\n") +
          fn('deeper', ro + '  await wrap(id);\n');
        const { findings } = findingsFor(file, text, ov);
        expect(findings).toEqual([{ key: `${file}#deeper`, problem: expect.stringContaining(`calls go deeper than ${MAX_DEPTH} modules`) }]);
        expect(findings[0]!.problem).not.toContain('but writes');
      });
    });

    // İNCELEME-89 (TASK-MUO6ZZVUPY4IT, devop-fb) Y-4, TASK-MUO827UIF3IHL.
    describe('İNCELEME-89 Y-4: import aliases', () => {
      const file = 'app/[locale]/(app)/[workspace]/evidence/i89-mutant.ts';
      const header = "'use server';\nimport { requireTenantAction } from '@/lib/tenant';\n";
      const ro = '  await requireTenantAction({ readOnly: true });\n';
      const fn = (name: string, body: string) => `export async function ${name}(id: string) {\n${body}}\n`;
      const impl = "import { prisma } from '@/lib/db';\nexport async function wipe(id) { await prisma.evidence.delete({ where: { id } }); }\n";
      const pkg = (imports: unknown) => JSON.stringify({ name: 'x', imports });
      const tsc = (paths: unknown, extra = '') => `{\n  // comment\n  "compilerOptions": { ${extra}"paths": ${JSON.stringify(paths)} }\n}\n`;
      const findings = (spec: string, key: string, overlay: Overlay) =>
        findingsFor(file, header + `import { wipe } from '${spec}';\n` + fn(key, ro + '  await wipe(id);\n'), overlay).findings;
      const red = (spec: string, key: string, problem: string, overlay: Overlay) =>
        expect(findings(spec, key, overlay)).toEqual([{ key: `${file}#${key}`, problem: expect.stringContaining(problem) }]);
      const writes = 'readOnly: true but writes: prisma.evidence.delete (lib/i89/legacy2.js:2';

      it('the real tree: every alias is read, and `@/` is into src/', () => {
        expect(aliasProblems(NO_OVERLAY)).toEqual([]);
        expect(resolveSpec('lib/x', '@/lib/./rbac', NO_OVERLAY)).toBe('lib/rbac');
        expect(resolveSpec('lib/x', 'zod', NO_OVERLAY)).toBeNull();
      });

      it('a package.json `imports` alias into src/ is walked (the probe: `#i89/*` → ./src/lib/i89/*.js)', () => {
        const ov: Overlay = { [PACKAGE_JSON]: pkg({ '#i89/*': './src/lib/i89/*.js' }), 'lib/i89/legacy2.js': impl };
        red('#i89/legacy2', 'p1', writes, ov);
        // Exact keys and conditions (`node`/`default`) too.
        red('#wipe', 'p2', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#wipe': { node: './src/lib/i89/legacy2.js', default: './src/lib/i89/legacy2.js' } }) });
      });

      it('a new tsconfig `paths` alias into src/ is walked', () => {
        const ov: Overlay = { [TSCONFIG_JSON]: tsc({ '@/*': ['./src/*'], '~lib/*': ['./src/lib/*'] }), 'lib/i89/legacy2.js': impl };
        red('~lib/i89/legacy2', 't1', writes, ov);
        red('@/lib/i89/legacy2', 't2', writes, ov);
        // Relative to `baseUrl` when there is one.
        red('~lib/i89/legacy2', 't3', writes, { ...ov, [TSCONFIG_JSON]: tsc({ '~lib/*': ['lib/*'] }, '"baseUrl": "./src", ') });
      });

      it('an alias into src/ the guard cannot pin to one file is fail-closed', () => {
        const blind = 'which the guard cannot find (fail-closed)';
        // Names no file.
        red('#i89/missing', 'f1', 'imports src/lib/i89/missing.js, ' + blind, { [PACKAGE_JSON]: pkg({ '#i89/*': './src/lib/i89/*.js' }) });
        // Two targets (fallbacks, or conditions that differ), one of them in src/.
        const two = 'imports #two, an alias into src/ with more than one target, ' + blind;
        red('~two', 'f2', two.replace('#two', '~two'), { [TSCONFIG_JSON]: tsc({ '~two': ['./src/lib/i89/a', './src/lib/i89/b'] }) });
        red('#two', 'f3', two, { [PACKAGE_JSON]: pkg({ '#two': { node: './src/lib/i89/a.js', default: 'some-package' } }) });
      });

      it('an alias out of src/ is a package, as before', () => {
        expect(findings('#ext', 'o1', { [PACKAGE_JSON]: pkg({ '#ext': 'some-package', '#out/*': './scripts/*.js' }) })).toEqual([]);
        expect(findings('#out/x', 'o2', { [PACKAGE_JSON]: pkg({ '#out/*': './scripts/*.js' }) })).toEqual([]);
      });

      it('a config the guard does not read is red, not ignored', () => {
        expect(aliasProblems({ [TSCONFIG_JSON]: '{ "extends": "./base.json", "compilerOptions": {} }' })).toEqual([
          expect.stringContaining('tsconfig.json `extends`'),
        ]);
        expect(aliasProblems({ [PACKAGE_JSON]: JSON.stringify({ name: 'x', exports: { './a': './src/a.ts' } }) })).toEqual([
          expect.stringContaining('package.json `exports`'),
        ]);
        expect(aliasProblems({ [TSCONFIG_JSON]: tsc({ '~a/*/b/*': ['./src/*/*'] }) })).toEqual([expect.stringContaining("'~a/*/b/*'")]);
        expect(aliasProblems({ [PACKAGE_JSON]: pkg({ '#a/*': './src/lib/a.js' }) })).toEqual([expect.stringContaining("'#a/*'")]);
      });

      // İNCELEME-97 (TASK-MUO9SMKSKFYRR, cs-fb) Y-1/Y-2/B-1, TASK-MUOACFUBMNOGQ.
      it('Y-1: a bare specifier under tsconfig `baseUrl` is walked', () => {
        const ov: Overlay = { [TSCONFIG_JSON]: tsc({ '@/*': ['./src/*'] }, '"baseUrl": ".", '), 'lib/i89/legacy2.js': impl };
        red('src/lib/i89/legacy2', 'u1', writes, ov);
        red('lib/i89/legacy2', 'u2', writes, { ...ov, [TSCONFIG_JSON]: tsc({ '@/*': ['./*'] }, '"baseUrl": "./src", ') });
        // After `paths`: a key whose one target names no file goes on to `baseUrl`. tsc stops at
        // node_modules there (TS2307, İNCELEME-101 B-2); the guard reading on is the stricter side.
        red('lib/i89/legacy2', 'u3', writes, { ...ov, [TSCONFIG_JSON]: tsc({ '@/*': ['./*'], 'lib/*': ['../scripts/*'] }, '"baseUrl": "./src", ') });
        red('src/lib/i89/nope', 'u4', 'imports src/lib/i89/nope, which the guard cannot find (fail-closed)', ov);
        // Not a file there: a package, as tsc finds it.
        expect(resolveSpec('lib/x', 'zod', ov)).toBeNull();
        expect(aliasProblems({ [TSCONFIG_JSON]: '{ "compilerOptions": { "baseUrl": 1 } }' })).toEqual([expect.stringContaining('`baseUrl`')]);
      });

      it('Y-2: the alias a file picks is the one its resolver picks', () => {
        const ov: Overlay = { 'lib/i89/legacy2.js': impl };
        // package.json: on an equal prefix the longer key wins (Node PATTERN_KEY_COMPARE), in either order.
        red('#q/legacy2.js', 'k1', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/*': './scripts/*', '#q/*.js': './src/lib/i89/*.js' }) });
        red('#q/legacy2.js', 'k2', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/*.js': './src/lib/i89/*.js', '#q/*': './scripts/*' }) });
        // The longest prefix, whatever the order.
        red('#q/i89/legacy2', 'k3', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/*': './scripts/*.js', '#q/i89/*': './src/lib/i89/*.js' }) });
        red('#q/i89/legacy2', 'k4', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/i89/*': './src/lib/i89/*.js', '#q/*': './scripts/*.js' }) });
        // An exact key before any wildcard.
        red('#q/legacy2', 'k5', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/legacy2': './src/lib/i89/legacy2.js', '#q/*': './scripts/*.js' }) });
        red('#q/legacy2', 'k6', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/*': './scripts/*.js', '#q/legacy2': './src/lib/i89/legacy2.js' }) });
        // A key's suffix must match too: `#q/*.mjs` is not `#q/legacy2`'s.
        red('#q/legacy2', 'k7', writes, { ...ov, [PACKAGE_JSON]: pkg({ '#q/*.mjs': './scripts/*.mjs', '#q/*': './src/lib/i89/*.js' }) });
        // Node's `*` is never empty: `#q/.js` is `#q/*` with `.js`, out of src/.
        expect(findings('#q/.js', 'k8', { ...ov, '.js': impl, [PACKAGE_JSON]: pkg({ '#q/*': './scripts/*', '#q/*.js': './src/*.js' }) })).toEqual([]);
        // tsconfig: tsc keeps the first of tied keys, a bundler may not — both are taken, so fail-closed.
        red('~q/legacy2.js', 'k9', 'imports ~q/legacy2.js, an alias into src/ with more than one target', {
          ...ov,
          [TSCONFIG_JSON]: tsc({ '~q/*': ['./scripts/*'], '~q/*.js': ['./src/lib/i89/*.js'] }),
        });
        // Each file on its own: tsconfig names no file, so the guard goes on to `imports`, which names
        // src/. tsc would stop at node_modules (İNCELEME-101 B-2); the bundler may not, so it is walked.
        red('#q/legacy2', 'k10', writes, { ...ov, [TSCONFIG_JSON]: tsc({ '#q/*': ['./scripts/*'] }), [PACKAGE_JSON]: pkg({ '#q/*': './src/lib/i89/*.js' }) });
        // Both name a file, and they differ: the guard cannot know which the build takes.
        red('#q/apply-rls', 'k11', 'imports #q/apply-rls, an alias into src/ with more than one target', {
          ...ov,
          [TSCONFIG_JSON]: tsc({ '#q/*': ['./scripts/*'] }),
          [PACKAGE_JSON]: pkg({ '#q/*': './src/lib/i89/*.js' }),
        });
        // Every fallback of a list counts, not only the first.
        red('#w', 'k12', 'imports #w, an alias into src/ with more than one target', { ...ov, [PACKAGE_JSON]: pkg({ '#w': ['some-package', './src/lib/i89/legacy2.js'] }) });
        expect(aliasProblems({ [TSCONFIG_JSON]: '{ "compilerOptions": { "paths": ' })).not.toEqual([]);
      });

      // İNCELEME-101 B-1 (TASK-MUOBO31H8EPR5): a real module's `@/` import that resolves to a
      // directory index is looked up again when an overlay puts a file in front of that index.
      // Without `probed` holding the base it tried first, the overlay's file went unseen.
      it('B-1 (İNCELEME-101): a file an overlay puts in front of a directory index is walked', () => {
        expect(resolveSpec('lib/rag', '@/lib/ai/prompts', NO_OVERLAY)).toBe('lib/ai/prompts/index');
        const shadow = "import { prisma } from '@/lib/db';\nexport function renderPrompt() { void prisma.evidence.delete({ where: { id: 'x' } }); return ''; }\n";
        const text = header + "import { formatRagPrompt } from '@/lib/rag';\n" + fn('n18', ro + "  return formatRagPrompt([], 'q', 'tr');\n");
        expect(findingsFor(file, text, NO_OVERLAY).findings).toEqual([]);
        expect(findingsFor(file, text, { 'lib/ai/prompts.ts': shadow }).findings).toEqual([
          { key: `${file}#n18`, problem: expect.stringContaining('readOnly: true but writes: prisma.evidence.delete (lib/ai/prompts.ts:2') },
        ]);
      });

      it('B-1 (İNCELEME-101): the same through a relative import of a directory index', () => {
        // lib/jobs/worker.ts: `import { taskList } from './tasks'` → lib/jobs/tasks/index.ts today.
        const shadow = "import { prisma } from '@/lib/db';\nexport const taskList = { zz: async () => { await prisma.evidence.delete({ where: { id: 'x' } }); } };\n";
        const text = header + "import { startJobsWorker } from '@/lib/jobs/worker';\n" + fn('n18r', ro + '  await startJobsWorker();\n');
        const problems = (ov: Overlay) => findingsFor(file, text, ov).findings.map((f) => f.problem).join('\n');
        expect(problems(NO_OVERLAY)).not.toContain('lib/jobs/tasks.ts:');
        expect(problems({ 'lib/jobs/tasks.ts': shadow })).toContain('prisma.evidence.delete (lib/jobs/tasks.ts:2');
      });

      it('B-1: with a catch-all `"*": ["./src/*"]`, a package is still a package and src/ still src/', () => {
        const real = fs.readFileSync(path.join(REPO_ROOT, 'tsconfig.json'), 'utf8');
        const catchAll = real.replace('"@/*": ["./src/*"]', '"@/*": ["./src/*"], "*": ["./src/*"]');
        expect(catchAll).not.toBe(real);
        const ov: Overlay = { [TSCONFIG_JSON]: catchAll, 'lib/i89/legacy2.js': impl };
        for (const spec of ['zod', 'node:crypto', 'fs', 'next/server', '@prisma/client']) expect(resolveSpec('lib/x', spec, ov)).toBeNull();
        red('lib/i89/legacy2', 'c1', writes, ov);
        // A file in src/ comes before a package of the same name, as in tsc.
        red('zod', 'c2', 'writes: prisma.evidence.delete (zod.js:2', { ...ov, 'zod.js': impl });
        // Neither a file in src/ nor a package: a typo, fail-closed.
        red('lib/i89/nope', 'c3', 'imports src/lib/i89/nope, which the guard cannot find (fail-closed)', ov);
        // Every import of today's tree resolves as it does without the catch-all or with a `baseUrl`.
        const variants = [ov, { [TSCONFIG_JSON]: real.replace('"paths": {', '"baseUrl": ".", "paths": {') }];
        let bare = 0;
        const moved: string[] = [];
        for (const file of sourceFiles(SRC)) {
          const from = path.relative(SRC, file).split(path.sep).join('/');
          for (const { fileName } of ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true).importedFiles) {
            if (fileName.startsWith('.')) continue;
            bare++;
            const today = resolveSpec(from, fileName, NO_OVERLAY);
            for (const v of variants) if (resolveSpec(from, fileName, v) !== today) moved.push(`${from}: ${fileName}`);
          }
        }
        expect(moved).toEqual([]);
        expect(bare).toBeGreaterThan(1000);
      });

      it('N-1: no two code files under src/ share a path but for the extension', () => {
        // A bundler that tries `.js` before `.ts` (webpack) would build the file the guard did not walk.
        const byStem = new Map<string, string[]>();
        for (const f of sourceFiles(SRC)) {
          const rel = path.relative(SRC, f).split(path.sep).join('/');
          const stem = rel.replace(SOURCE_FILE, '');
          byStem.set(stem, [...(byStem.get(stem) ?? []), rel]);
        }
        expect([...byStem.values()].filter((files) => files.length > 1)).toEqual([]);
      });
    });

    it('stays green for a check in each accepted shape', () => {
      const good = withAction(
        [
          "\nconst PERM = 'edit_proposal' as const;",
          'export async function okThrow(id: string) {',
          "  const { tenantId } = await requireTenantAction({ can: PERM });",
          '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));',
          '}',
          'export async function okIf(id: string) {',
          '  const { tenantId, role } = await requireTenantAction();',
          "  if (!can(role as never, 'edit_proposal')) {",
          "    throw new Error('forbidden');",
          '  }',
          '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));',
          '}',
          'async function gateStmt() {',
          "  const scope = await requireTenantAction({ can: 'edit_proposal' });",
          '  return scope;',
          '}',
          'export async function okHelper(id: string) {',
          '  const { tenantId } = await gateStmt();',
          '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));',
          '}',
          'export async function okTry(id: string) {',
          '  try {',
          "    const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });",
          '    await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));',
          '  } catch (e) {',
          '    return String(e);',
          '  }',
          '}',
          'export async function okCatchRethrows(id: string) {',
          '  try {',
          "    await requireTenantAction({ can: 'edit_proposal' });",
          '  } catch (e) {',
          "    console.error('refused', e);",
          '    throw e;',
          '  }',
          '  const { tenantId } = await requireTenantAction();',
          '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));',
          '}',
          'async function gateThrows(role: string) {',
          "  if (!can(role as never, 'edit_proposal')) throw new Error('forbidden');",
          '}',
          'export async function okThrowingHelper(id: string) {',
          '  const { tenantId, role } = await requireTenantAction();',
          '  await gateThrows(role);',
          '  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));',
          '}',
          'export async function okInCallback(id: string) {',
          '  const { tenantId, role } = await requireTenantAction();',
          '  await withTenant(tenantId, async (tx) => {',
          "    if (!can(role as never, 'edit_proposal')) return 'FORBIDDEN';",
          '    await tx.evidence.deleteMany({ where: { id, tenantId } });',
          '  });',
          '}',
          '',
        ].join('\n'),
      ).replace("import { requireTenantAction } from '@/lib/tenant';", "import { requireTenantAction } from '@/lib/tenant';\nimport { can } from '@/lib/rbac';");
      expect(findingsFor(evidence, good).findings).toEqual([]);
    });
  });
});
