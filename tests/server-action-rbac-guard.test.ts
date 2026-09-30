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
 *     `can` must be asked about a role, not a literal one (`can('TENANT_OWNER',
 *     …)`, `can(Role.X, …)`);
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
 * `<Action>` must be a literal (or a same-file `const`) that rbac.ts declares.
 * Every write must come after such a check on its own path: a check inside a
 * `withTenant` callback covers the writes after it in that callback only, and
 * one inside an `if` block covers only that block.
 *
 * A write is `<anything>.<model>.<write method>(…)` or `<model>.<write
 * method>(…)` for a model of prisma/schema.prisma (so `(t) =>`, a destructured
 * `{ evidence }`, `prisma as client`, `tx['evidence']` and `const ev =
 * tx.evidence` are all seen), plus `$executeRaw*` and a `$queryRaw*` whose SQL
 * writes, in call or tagged-template form. What stays out of reach: a model
 * accessor passed through a function argument or stored in an object, a write
 * behind dynamic `import()` or `require`, and anything deeper than MAX_DEPTH —
 * that is what the behaviour tests (tests/server-action-rbac.test.ts) and
 * review are for. An action that answers to something other than a tenant role
 * goes in ALLOWED with the reason.
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
  /** Top-level `const X = '<string>'`. */
  consts: Map<string, string>;
  /** Value imports by local name. */
  imports: Map<string, Import>;
  /** Exported name → local function, and re-exports `export { a } from` / `export *`. */
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
  const consts = new Map<string, string>();
  const imports = new Map<string, Import>();
  const exported = new Map<string, string>(); // exported name → local function name
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
        if (ts.isIdentifier(d.name) && init && ts.isStringLiteralLike(init)) consts.set(d.name.text, init.text);
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
        badExports.push({
          key: `${sf.fileName}#default@${at(stmt)}`,
          problem: 'export default is not a function the guard can read',
        });
      }
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const target = resolveSpec(id, stmt.moduleSpecifier.text, overlay);
        if (!stmt.exportClause) reexports.push({ target, from: null, to: null });
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
    consts,
    imports,
    exports: exported,
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

/** The function module `id` exports as `name`, following re-exports. */
function exportedFn(id: string, name: string, overlay: Overlay, seen = new Set<string>()): { mod: Module; fn: Fn; name: string } | null {
  const key = `${id}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const mod = loadModule(id, overlay);
  if (!mod) return null;
  const local = mod.exports.get(name);
  if (local && mod.all.has(local)) return { mod, fn: mod.all.get(local)!, name: local };
  for (const r of mod.reexports) {
    if (!r.target || (r.to !== null && r.to !== name)) continue;
    const found = exportedFn(r.target, r.from ?? name, overlay, seen);
    if (found) return found;
  }
  return null;
}

function calleeName(call: ts.CallExpression): string | null {
  const e = strip(call.expression);
  return ts.isIdentifier(e) ? e.text : null;
}

/** The check a call makes, when its callee is imported from the check's own module (se-fb N3). */
function checkName(call: ts.CallExpression, mod: Module): string | null {
  const name = calleeName(call);
  const imp = name ? mod.imports.get(name) : undefined;
  if (!imp || !(imp.name in CHECK_SOURCES) || CHECK_SOURCES[imp.name] !== imp.target) return null;
  return imp.name;
}

/** A literal (or same-file constant) that names an rbac.ts permission. */
function isRbacAction(arg: ts.Expression | undefined, mod: Module): boolean {
  if (!arg) return false;
  const e = strip(arg);
  const value = ts.isStringLiteralLike(e) ? e.text : ts.isIdentifier(e) ? mod.consts.get(e.text) : undefined;
  return value !== undefined && RBAC_ACTIONS.has(value);
}

/** A role the code wrote down rather than the caller's: `'TENANT_OWNER'`, `Role.X`, a string constant (se-fb N4). */
function isFixedRole(arg: ts.Expression | undefined, mod: Module): boolean {
  if (!arg) return true;
  const e = strip(arg);
  if (ts.isStringLiteralLike(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if (ts.isIdentifier(e)) return mod.consts.has(e.text) || e.text === 'undefined';
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
    const root = strip(e.expression);
    return ts.isIdentifier(root) && root.text === 'Role';
  }
  return e.kind === ts.SyntaxKind.NullKeyword;
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

/** A call that throws unless the caller's role carries the permission. */
function isThrowingCheck(call: ts.CallExpression, mod: Module): boolean {
  const name = checkName(call, mod);
  if (name === 'requirePlatformAdmin') return true;
  if (name === 'assertTenantActionRole') return isRbacAction(call.arguments[1], mod);
  if (name !== 'requireTenantAction') return false;
  const opts = requireTenantActionOpts(call);
  return !!opts && isRbacAction(optionOf(opts, 'can'), mod);
}

/** A yes/no check the caller's role must pass. */
function isBooleanCheck(e: ts.Expression, mod: Module): boolean {
  const call = strip(e);
  if (!ts.isCallExpression(call) || call.questionDotToken) return false;
  const name = checkName(call, mod);
  if (!name || !BOOLEAN_CHECKS.has(name)) return false;
  if (name === 'can') return !isFixedRole(call.arguments[0], mod) && isRbacAction(call.arguments[1], mod);
  if (name === 'canConfirmSeat') return !isFixedRole(call.arguments[0], mod);
  return true;
}

/** After `if (<cond>) exit`, the check holds. */
function isGuardCondition(e: ts.Expression, mod: Module): boolean {
  e = strip(e);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    return isBooleanCheck(e.operand, mod);
  }
  if (ts.isBinaryExpression(e)) {
    if (e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      return isGuardCondition(e.left, mod) || isGuardCondition(e.right, mod);
    }
    if (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return isGuardCondition(e.left, mod) && isGuardCondition(e.right, mod);
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

/** The Prisma write this node makes, as source text, or null. */
function writeOf(node: ts.Node, mod: Module): string | null {
  let target: ts.Expression;
  let sql: ts.Node | undefined;
  if (ts.isCallExpression(node)) {
    target = unwrap(node.expression);
    sql = node.arguments[0];
  } else if (ts.isTaggedTemplateExpression(node)) {
    target = unwrap(node.tag);
    sql = node.template;
  } else return null;
  let method: string;
  if (ts.isPropertyAccessExpression(target)) method = target.name.text;
  else if (ts.isElementAccessExpression(target) && ts.isStringLiteralLike(target.argumentExpression))
    method = target.argumentExpression.text;
  else return null;
  const text = () => target.getText(mod.sf);
  if (RAW_WRITES.has(method)) return text();
  if (RAW_QUERIES.has(method)) return sql && SQL_WRITE.test(sql.getText(mod.sf)) ? `${text()} (writing SQL)` : null;
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

  constructor(
    private readonly mod: Module,
    private readonly root: Fn,
    private readonly frame: Frame,
    /** Judged as a same-file helper: does it stop its caller? */
    private readonly helper = false,
    facts?: Facts,
  ) {
    this.facts = facts ?? { readOnly: false, checks: 0, writes: [], unchecked: [] };
  }

  run(): Facts {
    this.fn(this.root, false);
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
        isGuardCondition(stmt.expression, this.mod)
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
      if (isThrowingCheck(call, this.mod)) return awaited || !ASYNC_CHECKS.has(checkName(call, this.mod)!);
      const name = calleeName(call);
      const helper = name && !this.mod.imports.has(name) ? this.mod.all.get(name) : undefined;
      const key = `${this.mod.id}#${name}`;
      if (!helper || this.frame.stack.includes(key)) return false;
      if (hasModifier(helper, ts.SyntaxKind.AsyncKeyword) && !awaited) return false;
      // Judged on its own: does its body check before it can return?
      const sub = new Walker(this.mod, helper, { ...this.frame, stack: [...this.frame.stack, key] }, true);
      return sub.fn(helper, false);
    });
  }

  /** Walks a function reached from the action, in this module or another. */
  private enter(mod: Module, fn: Fn, name: string, checked: boolean, depth: number): void {
    const key = `${mod.id}#${name}`;
    if (fn === this.root || this.frame.stack.includes(key) || depth > MAX_DEPTH) return;
    const frame: Frame = { ...this.frame, stack: [...this.frame.stack, key], depth };
    new Walker(mod, fn, frame, false, this.facts).fn(fn, checked);
  }

  /** A reference to a function: same file, or imported from a module of src/ (se-fb G5, N8, N14). */
  private follow(id: ts.Identifier, member: string | null, checked: boolean): void {
    const name = id.text;
    const imp = this.mod.imports.get(name);
    if (!imp) {
      const local = member === null ? this.mod.all.get(name) : undefined;
      if (local) this.enter(this.mod, local, name, checked, this.frame.depth);
      return;
    }
    const exportName = imp.name === '*' ? member : member === null ? imp.name : null;
    if (!imp.target || !exportName || TRUSTED.has(imp.target)) return;
    const found = exportedFn(imp.target, exportName, this.frame.overlay);
    // Another server action is an endpoint of its own: the guard judges its
    // check where it is declared, and a caller cannot skip that check.
    if (found && !TRUSTED.has(found.mod.id) && !found.mod.useServer) this.enter(found.mod, found.fn, found.name, checked, this.frame.depth + 1);
  }

  private node(node: ts.Node, checked: boolean): void {
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
    if (ts.isIdentifier(node) && isReference(node)) this.follow(node, null, checked);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const imp = this.mod.imports.get(node.expression.text);
      if (imp?.name === '*') {
        this.follow(node.expression, node.name.text, checked);
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
    if (facts.readOnly) {
      if (facts.writes.length > 0) {
        findings.push({ key, problem: `readOnly: true but writes: ${facts.writes.join('; ')}` });
      }
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
          'writes before any role check covers them',
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
        // One module more and the walk stops: the limit is where review takes over.
        const deeper = { ...overlay, 'lib/i63/l0': "import { l1 } from './l1';\nexport async function l0(id: string) { await l1(id); }\n" };
        expect(findingsFor(file, action.replace("import { l1 } from '@/lib/i63/l1'", "import { l0 as l1 } from '@/lib/i63/l0'"), deeper).findings).toEqual([]);
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
