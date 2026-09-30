import fs from 'fs';
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
 *   - `require`, `import()` of a computed specifier, `eval`, getters, Proxies;
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
  'app/[locale]/fon-hazirlik/actions.ts#submitReadinessLead': 'public lead form, no session by design',
  'app/[locale]/accept-invite/continue/actions.ts#startInvitationSignInAction':
    'invitation sign-in; the invitation token is the credential',
  'app/[locale]/accept-invite/continue/actions.ts#acceptInvitationAction':
    'joins a tenant by invitation; the role comes from the invitation, the caller has none yet',
  'app/[locale]/accept-invite/continue/actions.ts#signOutForInvitationAction': 'signs the caller out',
  // Personal data of the caller themself (KVKK/GDPR), not tenant business data.
  'actions/user/export-data.ts#exportUserData': "the caller's own data export (KVKK right of access)",
  'actions/user/request-deletion.ts#requestAccountDeletion': "the caller's own account (KVKK erasure)",
  'actions/user/request-deletion.ts#cancelAccountDeletion': "the caller's own account (KVKK erasure)",
  'actions/user/request-deletion.ts#getDeletionStatus': "reads the caller's own deletion request",
  // Token-authenticated partner portal: no session, no tenant role. Narrow by
  // construction (Part A budget lines only) and pilot-gated on the token's tenant.
  'modules/m11/server/actions.ts#addBudgetLineByToken': 'partner portal; the magic token is the credential',
  // The portal form's inline action only hands the form to addBudgetLineByToken
  // above; an inline action that writes itself is refused regardless of this entry.
  'app/[locale]/portal/partner/[token]/page.tsx#inline:PartnerPortalPage:1':
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

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.|\.spec\.|\.d\.ts$/.test(entry.name)) found.push(full);
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
  /** Module under src/ without extension (`lib/rbac`), or null outside src/. */
  target: string | null;
  /** The name it has there: `default`, `*` for a namespace, or the export name. */
  name: string;
}

interface Module {
  sf: ts.SourceFile;
  /** Module under src/ without extension. */
  id: string;
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

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/** `@/x/y` or `./y` from module `from` → a module id under src/ that exists, or null. */
function resolveSpec(from: string, spec: string, overlay: Overlay): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  base = base.replace(/\.(tsx?|jsx?)$/, '');
  if (base in overlay) return base;
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(path.join(SRC, base + ext))) return ext.startsWith('/index') ? `${base}/index` : base;
  }
  return null;
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
        const target = resolveSpec(id, stmt.moduleSpecifier.text, overlay);
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
      const target = ts.isStringLiteral(stmt.moduleSpecifier) ? resolveSpec(id, stmt.moduleSpecifier.text, overlay) : null;
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
  let cache = moduleCache.get(overlay);
  if (!cache) moduleCache.set(overlay, (cache = new Map()));
  if (cache.has(id)) return cache.get(id)!;
  let text: string | undefined = overlay[id];
  let file = `${id}.ts`;
  if (text === undefined) {
    const ext = ['.ts', '.tsx'].find((x) => fs.existsSync(path.join(SRC, id + x)));
    file = ext ? id + ext : file;
    text = ext ? fs.readFileSync(path.join(SRC, file), 'utf8') : undefined;
  }
  const mod =
    text === undefined
      ? null
      : moduleOf(id, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), overlay).mod;
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
type Resolved = { mod: Module; node: Fn | ts.Node; name: string } | { ns: string } | { external: true } | null;
// `external`: outside src/, or a string constant — nothing to walk.

function resolveExport(id: string, name: string, overlay: Overlay, seen = new Set<string>()): Resolved {
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
function localBinding(id: ts.Identifier): ts.Node | null {
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
function writtenTo(decl: ts.Node): boolean {
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
    if (node === this.root || this.frame.stack.includes(key)) return;
    if (depth > MAX_DEPTH) {
      this.facts.deep.push({ label: `${name} (${mod.id}, from ${this.mod.id})`, checked });
      return;
    }
    const frame: Frame = { ...this.frame, stack: [...this.frame.stack, key], depth };
    const walker = new Walker(mod, isFn(node) ? node : null, frame, false, this.facts);
    if (isFn(node)) walker.fn(node, checked);
    else walker.node(node, checked);
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
    if (TRUSTED.has(target)) return;
    if (member === null) this.enterModule(target, '*', checked);
    else this.followExport(target, member, null, checked);
  }

  private followExport(target: string, name: string, member: string | null, checked: boolean): void {
    if (TRUSTED.has(target)) return;
    const r = resolveExport(target, name, this.frame.overlay);
    // Fail-closed (İNCELEME-74 Y-1): a name the guard cannot find is the whole module.
    if (r === null) return this.enterModule(target, name, checked);
    if ('external' in r) return;
    if ('ns' in r) return this.followMember(r.ns, member, checked);
    // Another server action is an endpoint of its own: the guard judges its
    // check where it is declared, and a caller cannot skip that check.
    if (TRUSTED.has(r.mod.id) || r.mod.useServer) return;
    this.enter(r.mod, r.node, r.name, checked, this.frame.depth + 1);
  }

  /** Every function and value of a module, as if the action reached each one (fail-closed). */
  private enterModule(target: string, name: string, checked: boolean): void {
    const mod = loadModule(target, this.frame.overlay);
    if (!mod || TRUSTED.has(target) || mod.useServer) return;
    if (this.frame.stack.some((k) => k.startsWith(`${target}#?`))) return;
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
      const where = this.frame.depth > 0 ? `${this.mod.id}.ts:${line}` : `line ${line}`;
      const via = top ? `, via ${top.split('#')[1]}${this.frame.depth > 0 ? ` (${top.split('#')[0]})` : ''}` : '';
      const label = `${write} (${where}${via})`;
      this.facts.writes.push(label);
      if (!checked) this.facts.unchecked.push(label);
    }
    if (ts.isCallExpression(node) && this.frame.stack.length === 0 && isReadOnlyCall(node)) this.facts.readOnly = true;
    // `const { wipe } = ns`: the namespace is followed where its names are used (İNCELEME-74 R6, D2).
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && this.namespaceOf(node.initializer)) {
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
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const { mod, exported, badExports } = moduleOf(relPath.replace(/\.tsx?$/, ''), sf, overlay);
  const moduleLevel = hasDirective(sf.statements, 'use server');
  const findings: Finding[] = moduleLevel ? [...badExports] : [];
  const keys: string[] = [];

  const judge = (key: string, fn: Fn, inline: boolean) => {
    keys.push(key);
    const facts = new Walker(mod, fn, { stack: [], depth: 0, overlay }).run();
    const deep = (all: boolean) =>
      facts.deep
        .filter((d) => all || !d.checked)
        .map((d) => d.label)
        .join('; ');
    const tooDeep = `calls go deeper than ${MAX_DEPTH} modules, where the guard stops seeing writes`;
    if (facts.readOnly) {
      if (facts.writes.length > 0) {
        findings.push({ key, problem: `readOnly: true but writes: ${facts.writes.join('; ')}` });
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
      findings.push({ key, problem: `writes before any role check covers them: ${facts.unchecked.join('; ')}` });
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
      only(profile, mutant, 'updateTenantProvince', 'writes before any role check covers them: tx.tenant.update');
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
      const portal = 'app/[locale]/portal/partner/[token]/page.tsx';
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
