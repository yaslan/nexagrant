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
 *    module is a public POST endpoint. `requireTenantAction` makes it a write
 *    by default (the pilot gate fails closed), and a write must also check the
 *    caller's role against src/lib/rbac.ts — `requireTenantAction({ can })`,
 *    `assertTenantActionRole`, a bare `can(...)`, or one of the role rules in
 *    ROLE_CHECKS. 52 write actions once checked nothing but the tenant, so a
 *    MEMBER could evaluate gates, delete evidence and rewrite concept notes.
 * 2. `readOnly: true` means it. The flag skips the expired-pilot gate, so an
 *    action marked read-only that writes is a write an expired pilot can still
 *    make (m11 `updatePresenceHeartbeat` did, TASK-MUN4H2RL79D8B N-2).
 *
 * Both follow calls into helpers of the same file (`savePartContent`,
 * `requireManager`, …). A write made by a function in another module is not
 * seen — that is what the behaviour tests (tests/server-action-rbac.test.ts)
 * and review are for. An action that answers to something other than a tenant
 * role goes in ALLOWED with the reason.
 */

/** Calls that decide on the caller's role (or platform-staff status) before a write. */
const ROLE_CHECKS = new Set([
  'can',
  'assertTenantActionRole',
  'requirePlatformAdmin',
  'isPlatformAdminSession',
  // Owner-or-pipeline-role rule, src/lib/pipeline/archive.ts.
  'canArchiveOpportunity',
  // manage_approvals rule for confirming a seat, src/modules/m8/server/seat-transitions.ts.
  'canConfirmSeat',
]);

/** Prisma write methods. Matched only as `<prisma|tx|db>.<model>.<method>(…)`. */
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
const CLIENTS = new Set(['prisma', 'tx', 'db']);
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
  // Reads that resolve the tenant through pipeline/actions.ts `sessionScope()`
  // rather than `requireTenantAction({ readOnly: true })`.
  'app/[locale]/(app)/[workspace]/pipeline/actions.ts#getOpportunityFormMembers': 'read-only member list',
  'app/[locale]/(app)/[workspace]/pipeline/actions.ts#getSuggestedTopics': 'read-only shared call catalogue',
  // Role checked inline against its own set (TENANT_OWNER/TENANT_ADMIN), and the
  // refusal is a result value the co-brand form shows.
  'app/[locale]/(app)/ajans/cobrand-actions.ts#saveCoBrand': 'EDITOR_ROLES.has(scope.role) — owner/admin only',
  // Four-eyes decisions: the dual-approval engine compares the approver's role
  // with the request's required role (canRoleApprove, src/lib/dual-approval.ts).
  'app/[locale]/(app)/[workspace]/approvals/actions.ts#approveRequestAction':
    'role checked by approveApprovalRequest(approverRole) against requiredRole',
  'app/[locale]/(app)/[workspace]/approvals/actions.ts#rejectRequestAction':
    'role checked by rejectApprovalRequest(approverRole) against requiredRole',
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

function hasUseServerDirective(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === 'use server') return true;
  }
  return false;
}

const hasExport = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** Top-level functions of a module by name, and which of them are exported. */
function functionsOf(sf: ts.SourceFile): { all: Map<string, Fn>; exported: string[] } {
  const all = new Map<string, Fn>();
  const exported: string[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      all.set(stmt.name.text, stmt);
      if (hasExport(stmt)) exported.push(stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        let init = d.initializer;
        while (init && (ts.isParenthesizedExpression(init) || ts.isAsExpression(init))) init = init.expression;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          all.set(d.name.text, init);
          if (hasExport(stmt)) exported.push(d.name.text);
        }
      }
    }
  }
  return { all, exported };
}

function calleeName(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  return null;
}

/** `requireTenantAction({ …, <key>: … })` — the key is present (and for readOnly, `true`). */
function requireTenantActionHas(call: ts.CallExpression, key: 'readOnly' | 'can'): boolean {
  if (calleeName(call) !== 'requireTenantAction') return false;
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === key &&
      (key === 'can' || p.initializer.kind === ts.SyntaxKind.TrueKeyword),
  );
}

function isPrismaWrite(call: ts.CallExpression): boolean {
  const e = call.expression;
  if (!ts.isPropertyAccessExpression(e)) return false;
  const method = e.name.text;
  if (RAW_WRITES.has(method)) return true;
  if (!WRITE_METHODS.has(method)) return false;
  const model = e.expression;
  return (
    ts.isPropertyAccessExpression(model) && ts.isIdentifier(model.expression) && CLIENTS.has(model.expression.text)
  );
}

interface Facts {
  readOnly: boolean;
  roleChecked: boolean;
  writes: string[];
}

/** What an exported action does, following calls into same-file helpers. */
function factsOf(sf: ts.SourceFile, name: string, all: Map<string, Fn>): Facts {
  const facts: Facts = { readOnly: false, roleChecked: false, writes: [] };
  const seen = new Set<string>();
  const visitFn = (fnName: string) => {
    if (seen.has(fnName)) return;
    seen.add(fnName);
    const fn = all.get(fnName);
    if (!fn) return;
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = calleeName(node);
        if (requireTenantActionHas(node, 'readOnly') && fnName === name) facts.readOnly = true;
        if (requireTenantActionHas(node, 'can')) facts.roleChecked = true;
        if (callee && ROLE_CHECKS.has(callee)) facts.roleChecked = true;
        if (isPrismaWrite(node)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          facts.writes.push(`${node.expression.getText(sf)} (line ${line}${fnName === name ? '' : `, via ${fnName}`})`);
        }
        if (callee && all.has(callee)) visitFn(callee);
      }
      ts.forEachChild(node, walk);
    };
    walk(fn);
  };
  visitFn(name);
  return facts;
}

export interface Finding {
  key: string;
  problem: string;
}

/** Every violation in one 'use server' module's source. Exported for the mutant tests below. */
export function findingsFor(relPath: string, text: string): { findings: Finding[]; keys: string[] } {
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (!hasUseServerDirective(sf)) return { findings: [], keys: [] };
  const { all, exported } = functionsOf(sf);
  const findings: Finding[] = [];
  const keys: string[] = [];
  for (const name of exported) {
    const key = `${relPath}#${name}`;
    keys.push(key);
    const facts = factsOf(sf, name, all);
    if (facts.readOnly) {
      if (facts.writes.length > 0) {
        findings.push({ key, problem: `readOnly: true but writes: ${facts.writes.join('; ')}` });
      }
      continue;
    }
    if (!facts.roleChecked && !(key in ALLOWED)) {
      findings.push({ key, problem: 'write action without a role check (requireTenantAction({ can }) / can(...))' });
    }
  }
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
  });
});
