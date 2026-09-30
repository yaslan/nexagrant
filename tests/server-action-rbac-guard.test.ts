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
 * `can` that only ran for one field (B-1). A role check now counts only in a
 * shape that stops the action:
 *
 *   - a statement that throws: `requireTenantAction({ can: '<Action>' })`,
 *     `assertTenantActionRole(scope, '<Action>')`, `requirePlatformAdmin()` —
 *     not behind `&&`, `||`, `?:` or inside a callback;
 *   - `if (!<check>(…)) return|throw` with no `else`, where <check> is one of
 *     BOOLEAN_CHECKS (`||` of such conditions, or `&&` of all of them, too);
 *   - a call to a same-file helper whose body does one of the above.
 *
 * `<Action>` must be a literal (or a same-file `const`) that rbac.ts declares.
 * Every write must come after such a check on its own path: a check inside a
 * `withTenant` callback covers the writes after it in that callback only, and
 * one inside an `if` block covers only that block.
 *
 * A write is `<anything>.<model>.<write method>(…)` or `<model>.<write
 * method>(…)` for a model of prisma/schema.prisma (so `(t) =>`, a destructured
 * `{ evidence }` and `prisma as client` are all seen), plus `$executeRaw*` in
 * call or tagged-template form. Calls are followed into helpers of the same
 * file. Known blind spots: a write made by a function in another module (se-fb
 * G5) and a model accessor stored under a different variable name — that is
 * what the behaviour tests (tests/server-action-rbac.test.ts) and review are
 * for. An action that answers to something other than a tenant role goes in
 * ALLOWED with the reason.
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

const hasExport = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

const isFn = (node: ts.Node): node is Fn =>
  ts.isFunctionDeclaration(node) ||
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isMethodDeclaration(node);

/** `(x)`, `x as T`, `x!`, `x satisfies T`, `await x` → `x`. */
function strip(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isAwaitExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

interface Module {
  sf: ts.SourceFile;
  /** Top-level functions by name. */
  all: Map<string, Fn>;
  /** Top-level `const X = '<string>'`. */
  consts: Map<string, string>;
}

/** Top-level functions and string constants of a module, and what it exports as a server action. */
function moduleOf(sf: ts.SourceFile): { mod: Module; exported: Map<string, string>; badExports: Finding[] } {
  const all = new Map<string, Fn>();
  const consts = new Map<string, string>();
  const exported = new Map<string, string>(); // exported name → local function name
  const badExports: Finding[] = [];
  const exportLists: ts.ExportDeclaration[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      all.set(stmt.name.text, stmt);
      if (hasExport(stmt)) exported.set(stmt.name.text, stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const init = strip(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          all.set(d.name.text, init);
          if (hasExport(stmt)) exported.set(d.name.text, d.name.text);
        } else if (ts.isStringLiteralLike(init)) {
          consts.set(d.name.text, init.text);
        }
      }
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      exportLists.push(stmt);
    }
  }
  // `export { fn }` / `export { fn as other }` (se-fb G7): the same endpoint as `export async function`.
  for (const decl of exportLists) {
    if (decl.moduleSpecifier || !decl.exportClause || !ts.isNamedExports(decl.exportClause)) {
      badExports.push({
        key: `${sf.fileName}#export@${sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1}`,
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
  return { mod: { sf, all, consts }, exported, badExports };
}

function calleeName(call: ts.CallExpression): string | null {
  const e = strip(call.expression);
  return ts.isIdentifier(e) ? e.text : null;
}

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

/** A call that throws unless the caller's role carries the permission. */
function isThrowingCheck(call: ts.CallExpression, mod: Module): boolean {
  const name = calleeName(call);
  if (name === 'requirePlatformAdmin') return true;
  if (name === 'assertTenantActionRole') return isRbacAction(call.arguments[1], mod);
  const opts = requireTenantActionOpts(call);
  return !!opts && isRbacAction(optionOf(opts, 'can'), mod);
}

/** A yes/no check the caller's role must pass. */
function isBooleanCheck(e: ts.Expression, mod: Module): boolean {
  const call = strip(e);
  if (!ts.isCallExpression(call)) return false;
  const name = calleeName(call);
  if (!name || !BOOLEAN_CHECKS.has(name)) return false;
  return name !== 'can' || isRbacAction(call.arguments[1], mod);
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

function exits(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) return true;
  const last = ts.isBlock(stmt) ? stmt.statements[stmt.statements.length - 1] : undefined;
  if (last) return exits(last);
  return false;
}

/** Calls a statement always makes: not behind `&&`/`||`/`??`/`?:`, not inside a callback. */
function unconditionalCalls(node: ts.Node, acc: ts.CallExpression[] = []): ts.CallExpression[] {
  if (isFn(node)) return acc;
  if (ts.isConditionalExpression(node)) return unconditionalCalls(node.condition, acc);
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      op === ts.SyntaxKind.BarBarEqualsToken ||
      op === ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
      return unconditionalCalls(node.left, acc);
    }
  }
  if (ts.isCallExpression(node) && !node.questionDotToken) acc.push(node);
  ts.forEachChild(node, (c) => {
    unconditionalCalls(c, acc);
  });
  return acc;
}

/** The Prisma write this node makes, as source text, or null. */
function writeOf(node: ts.Node, sf: ts.SourceFile): string | null {
  let target: ts.Expression;
  if (ts.isCallExpression(node)) target = node.expression;
  else if (ts.isTaggedTemplateExpression(node)) target = node.tag;
  else return null;
  if (!ts.isPropertyAccessExpression(target)) return null;
  const method = target.name.text;
  if (RAW_WRITES.has(method)) return target.getText(sf);
  if (!WRITE_METHODS.has(method)) return null;
  const receiver = strip(target.expression);
  const model = ts.isPropertyAccessExpression(receiver)
    ? receiver.name.text
    : ts.isIdentifier(receiver)
      ? receiver.text
      : null;
  return model && MODELS.has(model) ? target.getText(sf) : null;
}

interface Facts {
  readOnly: boolean;
  /** Role checks in a shape that stops the action, anywhere on its paths. */
  checks: number;
  writes: string[];
  /** Writes no earlier check covers. */
  unchecked: string[];
}

class Walker {
  readonly facts: Facts = { readOnly: false, checks: 0, writes: [], unchecked: [] };
  private readonly stack: string[] = [];

  constructor(
    private readonly mod: Module,
    private readonly root: Fn,
  ) {}

  run(): Facts {
    this.fn(this.root, false);
    return this.facts;
  }

  /** Walks a function body; true when its own top level establishes a check. */
  private fn(fn: Fn, checked: boolean): boolean {
    if (!fn.body) return false;
    if (ts.isBlock(fn.body)) return this.statements(fn.body.statements, checked);
    this.node(fn.body, checked);
    return false;
  }

  /** A statement list in order. True when it establishes a check for what follows it. */
  private statements(list: readonly ts.Statement[], checked: boolean): boolean {
    let established = false;
    for (const stmt of list) {
      if (ts.isIfStatement(stmt) && !stmt.elseStatement && exits(stmt.thenStatement) && isGuardCondition(stmt.expression, this.mod)) {
        this.node(stmt, checked);
        this.facts.checks++;
        checked = established = true;
        continue;
      }
      if (ts.isTryStatement(stmt)) {
        if (this.statements(stmt.tryBlock.statements, checked)) checked = established = true;
        if (stmt.catchClause) this.node(stmt.catchClause, checked);
        if (stmt.finallyBlock) this.node(stmt.finallyBlock, checked);
        continue;
      }
      if (ts.isBlock(stmt)) {
        if (this.statements(stmt.statements, checked)) checked = established = true;
        continue;
      }
      // Writes in this statement are judged against the checks before it.
      this.node(stmt, checked);
      if ((ts.isExpressionStatement(stmt) || ts.isVariableStatement(stmt)) && this.establishes(stmt)) {
        this.facts.checks++;
        checked = established = true;
      }
    }
    return established;
  }

  private establishes(stmt: ts.Statement): boolean {
    return unconditionalCalls(stmt).some((call) => {
      if (isThrowingCheck(call, this.mod)) return true;
      const name = calleeName(call);
      const helper = name ? this.mod.all.get(name) : undefined;
      if (!helper || this.stack.includes(name!)) return false;
      this.stack.push(name!);
      // Judged on its own: does its body check before it returns?
      const sub = new Walker(this.mod, helper);
      sub.stack.push(...this.stack);
      const ok = sub.fn(helper, false);
      this.stack.pop();
      return ok;
    });
  }

  private node(node: ts.Node, checked: boolean): void {
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
    const write = writeOf(node, this.mod.sf);
    if (write) {
      const line = this.mod.sf.getLineAndCharacterOfPosition(node.getStart(this.mod.sf)).line + 1;
      const via = this.stack.length > 0 ? `, via ${this.stack[this.stack.length - 1]}` : '';
      const label = `${write} (line ${line}${via})`;
      this.facts.writes.push(label);
      if (!checked) this.facts.unchecked.push(label);
    }
    if (ts.isCallExpression(node)) {
      if (this.stack.length === 0 && isReadOnlyCall(node)) this.facts.readOnly = true;
      const name = calleeName(node);
      const helper = name ? this.mod.all.get(name) : undefined;
      if (helper && helper !== this.root && !this.stack.includes(name!)) {
        this.stack.push(name!);
        this.fn(helper, checked);
        this.stack.pop();
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

/** Every violation in one source file. Exported for the mutant tests below. */
export function findingsFor(relPath: string, text: string): { findings: Finding[]; keys: string[] } {
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const { mod, exported, badExports } = moduleOf(sf);
  const moduleLevel = hasDirective(sf.statements, 'use server');
  const findings: Finding[] = moduleLevel ? [...badExports] : [];
  const keys: string[] = [];

  const judge = (key: string, fn: Fn, inline: boolean) => {
    keys.push(key);
    const facts = new Walker(mod, fn).run();
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
