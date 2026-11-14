/**
 * The scanner behind `pnpm rls:bypass-check` (scripts/check-tenant-bypass.ts).
 *
 * Kept separate from the gate for the same reason scripts/rls-migrations.ts is:
 * the gate decides *policy* (what is allowed), this file decides *fact* (what is
 * in the tree). A unit test can then drive the fact half without a baseline.
 *
 * ---------------------------------------------------------------------------
 * What it looks for, and why each rule is shaped the way it is
 * ---------------------------------------------------------------------------
 *
 * CHECK A — a tenant-scoped model reached through the `prisma` singleton.
 *
 *   `withTenant(tenantId, (tx) => tx.model.op(...))` hands its callback a
 *   *transaction* client on which `set_config('app.tenant_id', …)` has been
 *   run. The `prisma` singleton is a different connection with no such setting,
 *   so `prisma.<model>.<op>()` is outside every tenant scope — including when
 *   it is written *inside* a withTenant callback, where it would also escape
 *   the transaction. That makes the rule decidable from the accessor alone: no
 *   scope analysis, no false "it might be wrapped".
 *
 *   Under the `fabrika` role (SUPERUSER, BYPASSRLS) such a call quietly returns
 *   every tenant's rows. Under `fabrika_app` (NOBYPASSRLS) it returns none.
 *   Both are wrong; the gate exists so the day the role changes is not the day
 *   we find out which call sites depend on it.
 *
 * CHECK B — a tenant id that falls back instead of refusing.
 *
 *   B1 `tenantId ? { … } : { … }` with no tenantId on the false side. The
 *      filter does not narrow, it *disappears*: `{}` is every tenant's rows and
 *      `{ id }` is a lookup by id across tenants. Fixed twice in this repo and
 *      found alive in three more files afterwards
 *      (TASK-MTRKV9JGY7OQY, TASK-MTUGJTD5HZDW0, TASK-MTU6I3V2R30M8).
 *   B2 `tenantId: x ?? 'something'` / `x || y`. src/lib/db.ts is explicit that
 *      "no tenant" is a refusal in this codebase, never a wider query and never
 *      an invented name; `assertTenantScope` rejects `''` for that reason.
 *      `?? null` / `?? undefined` are NOT flagged: a nullable tenantId column
 *      (ConceptTemplate, Document, Chunk) is an honest absence.
 *
 * CHECK C — `prisma as unknown as TenantTx` outside src/lib/db.ts.
 *
 *   src/lib/db.ts:95 names this hole in its own docstring: the nominal brand on
 *   TenantTx stops a bare `prisma` at the type boundary, and `as unknown as`
 *   walks straight past it. The brand is minted in exactly one place
 *   (withTenantOn, beside set_config); any other mint is a claim of tenant
 *   scope that nothing checked.
 *
 * CHECK D — a sanctioned cross-tenant escape, counted so it stays sanctioned.
 *
 *   `withSystemScope(purpose, context, cb)` (src/lib/system-scope.ts) opens the
 *   `system_scope` RLS policy for one transaction, which is how the 35 call
 *   sites recorded as `allowed` here return rows at all under a NOBYPASSRLS
 *   role. Moving a call onto it takes the call OUT of CHECK A: the accessor
 *   becomes `tx.`, not `prisma.`, and the baseline entry falls to zero.
 *
 *   Without this check that is a mute button — the escape hatch would be the
 *   one way to make a finding disappear. So every `withSystemScope(` in src/**
 *   is a finding in its own right, keyed by file and purpose, and has to be
 *   recorded in the baseline with `kind: "system-scope"` and a written reason.
 *   The gate refuses a check-D entry recorded under any other kind, and refuses
 *   a check-A/B/C entry recorded as "system-scope", so a bypass cannot be
 *   relabelled into the quiet list. A call does not leave the ratchet by moving
 *   onto the sanctioned path; it changes which ratchet holds it.
 *
 *   The purpose is read from the RAW source, not the comment-blanked copy,
 *   because blanking removes string literals — and this file's own docstring
 *   would otherwise be a call site. The call POSITION still comes from the
 *   blanked copy, so a `withSystemScope(` quoted in prose is not a finding.
 *
 * CHECK E — the two shapes CHECK A cannot see, because the accessor is right
 * and the SCOPE is missing (TASK-MTWOVYEKUDNZY, FA-47 / FA-50).
 *
 *   E1 `prisma.$transaction((tx) => … tx.<tenant model>.<op>( … )`. The accessor
 *      is `tx.`, so CHECK A is silent — but this `tx` came from the bare
 *      singleton, not from withTenant/withSystemScope, so no set_config ran on
 *      it and it is outside every tenant scope exactly as `prisma.` is. The
 *      block is the balanced-parenthesis span of the `$transaction(` call, read
 *      on the comment-blanked copy; a line window would cut a wrapped callback
 *      in half and judge the wrong half. The callback's parameter name is read
 *      from the block (`(tx) =>`, `async (client) =>`), `tx` when unreadable.
 *      The receiver is the same set E2 uses: `prisma`, or a variable the file
 *      assigns as `<x> ?? prisma` — `db.$transaction(…)` on
 *      `const db = client ?? prisma` is a bare transaction whenever the caller
 *      omitted the client, and nothing at the call site says which it was
 *      (PR #121 review, crw3-gnd finding 3).
 *
 *      Exemption, by boss decision K-570148 = A: a block that calls
 *      `bindTransactionToTenant(tx, …)` (src/lib/legal/registration-consent.ts)
 *      is bound by the same `set_config('app.tenant_id', …, true)` that
 *      withTenantOn runs, applied at the first moment a tenant id exists — the
 *      registration flow, where the tenant is CREATED inside the transaction
 *      that then writes its Membership and Workspace, and withTenant cannot
 *      open because there is nothing to scope to yet. Accesses AFTER the bind
 *      call are exempt and reported as an information line, never a finding
 *      and never a baseline entry; an access BEFORE it is still a finding,
 *      because at that point the transaction is as bare as the singleton.
 *
 *      The bind only counts when it binds THIS transaction, unconditionally
 *      (PR #121 review, crw3-gnd finding 2): its first argument must be the
 *      callback's own parameter — `bindTransactionToTenant(prisma, id)` inside
 *      the block binds some other connection — and the call must be a
 *      statement at the top level of the callback body, so a bind parked in
 *      an `if` branch, a nested block or a nested function does not exempt the
 *      accesses that run whether or not that branch did. The check is
 *      lexical (brace depth one inside the block, preceded by `{`, `;` or
 *      `}`), not a flow analysis; a bind the rule cannot see is simply not an
 *      exemption, and the block is judged as bare — the safe direction.
 *
 *   E2 a tenant-scoped relation reached THROUGH a model that is not itself
 *      tenant-scoped: `prisma.tenant.findMany({ include: { _count: { select:
 *      { users } } } })`, `prisma.plan.findMany({ include: { assignments } })`,
 *      `prisma.tenant.findUnique({ include: { subscription } })`. The root
 *      table has no tenant_isolation policy, so the read returns its row; the
 *      joined table does, so under fabrika_app the relation comes back EMPTY —
 *      every tenant "has 0 members", every private plan "is assigned to
 *      nobody", a paying tenant "has no subscription" (all three measured,
 *      TASK-MTWOVYEKUDNZY-crw2-gnd.md). Convincing, wrong, and silent.
 *
 *      The relation names come from the generated client's DMMF
 *      (`Prisma.dmmf.datamodel.models`, `kind === 'object'` fields whose type
 *      is in tenantScopedModels()), never from a guessed list: a renamed or
 *      added relation is covered the moment `pnpm db:generate` runs. The
 *      receiver is `prisma` (the singleton, never in a scope), a variable the
 *      file assigns as `<x> ?? prisma` (an optional client that FALLS BACK to
 *      the singleton — src/lib/billing.ts's `const db = client ?? prisma` is
 *      the live instance, and every caller that omits the client lands on the
 *      bare path), or the callback parameter of a bare E1 block. Reads inside a
 *      withTenant / withSystemScope callback use that callback's `tx` and are
 *      never a finding. The argument body is searched for the relation as a
 *      property key, so `include`, `select`, `_count.select` and a `where`
 *      relation filter all count — each of them joins the policed table.
 *
 *   Both record under kind "allowed" or "debt" like A/B/C. The gate refuses
 *   an E entry recorded as "system-scope": leaving a scope through the
 *   sanctioned path is CHECK D, and a bare transaction is not that path.
 *
 * ---------------------------------------------------------------------------
 * Two deliberate limits, stated rather than hidden
 * ---------------------------------------------------------------------------
 *
 * 1. It reads the git INDEX, not the working tree. Six agents share this
 *    worktree; an untracked probe script belonging to someone else must not
 *    turn this gate red here and green in CI. New files are covered from the
 *    moment they are `git add`ed, which is also when githooks/pre-commit runs.
 *
 * 2. It scans src/** only, and skips *.test.ts / *.spec.ts / __tests__/ inside
 *    it. Fixtures create and delete rows across tenants on purpose, and
 *    scripts/ are operator tools that run as `fabrika` deliberately. Those
 *    counts are reported, not judged — see the gate's closing summary, so the
 *    exclusion is visible instead of silent.
 *
 * 3. CHECK E judges the call site it can see, not the helper it calls. A bare
 *    `$transaction` that hands `tx` to a function in another file
 *    (`createInvoiceForPayment(tx, …)`, `bootstrapOAuthTenant(tx, …)`) is not
 *    followed; what that helper does with `tx` is that helper's own call
 *    sites, and only a `tx.<model>` written in the block is judged here.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { NULLABLE_TENANT, SYSTEM_WIDE, tenantScopedModels } from './rls-models';

export type CheckId = 'A' | 'B1' | 'B2' | 'C' | 'D' | 'E1' | 'E2';

/**
 * Which checks record under kind "system-scope". Exactly one: CHECK D is the
 * sanctioned path, and only a call ON that path may be listed as being on it.
 * Every other check — A/B/C and the E family alike — records a bypass under
 * "allowed" or "debt". The gate derives its kind↔check rule from this set so
 * a new check cannot be added without being placed on one side of the line.
 */
export const SYSTEM_SCOPE_CHECKS: ReadonlySet<CheckId> = new Set<CheckId>(['D']);

export type BaselineKind = 'allowed' | 'debt' | 'system-scope';

/** True when a baseline entry's kind is legal for its check. */
export function kindMatchesCheck(check: CheckId, kind: BaselineKind): boolean {
  return SYSTEM_SCOPE_CHECKS.has(check) ? kind === 'system-scope' : kind !== 'system-scope';
}

export interface Finding {
  check: CheckId;
  /** Repo-relative path, as git reports it. */
  file: string;
  /** 1-indexed line in the file as it stands on disk. */
  line: number;
  /**
   * What the baseline matches on. Deliberately NOT the line number: line
   * numbers drift under every neighbouring edit (the card that ordered this
   * gate quoted export/route.ts:34 for a call that now sits at :47), and a
   * baseline keyed on them rots into noise within a day.
   */
  subject: string;
  /** The source line, trimmed, for the operator reading the failure. */
  text: string;
}

/** Files whose tenant access is fixture work, reported but not judged. */
export function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file) || file.includes('/__tests__/');
}

/**
 * Blanks comments and string literals while preserving line numbering.
 *
 * Necessary, not cosmetic: four of this repo's docstrings *quote* the bug they
 * fixed (`prisma.evidence.findMany({ where: tenantId ? { tenantId } : {} })` in
 * evidence/data.ts is a worked example of the leak). A gate that goes red on
 * its own documentation teaches people to delete the documentation.
 *
 * Template-literal `${…}` returns to code state, so a call interpolated into a
 * string is still seen. A regular-expression literal containing `//` is the
 * known blind spot; `//` preceded by a backslash is therefore not treated as a
 * comment, which covers the `/\/\//` shape.
 */
export function blankNonCode(src: string): string {
  const out: string[] = [];
  // 'code' | 'line' | 'block' | "'" | '"' | '`'
  const stack: string[] = ['code'];
  let i = 0;

  const top = () => stack[stack.length - 1] as string;
  const push = (s: string) => stack.push(s);
  const pop = () => {
    if (stack.length > 1) stack.pop();
  };
  const emit = (c: string) => out.push(c === '\n' ? '\n' : ' ');

  while (i < src.length) {
    const c = src[i] as string;
    const d = src[i + 1];
    const state = top();

    if (state === 'code') {
      if (c === '/' && d === '*') {
        push('block');
        out.push('  ');
        i += 2;
        continue;
      }
      if (c === '/' && d === '/' && src[i - 1] !== '\\') {
        push('line');
        out.push('  ');
        i += 2;
        continue;
      }
      if (c === '\'' || c === '"' || c === '`') {
        push(c);
        out.push(' ');
        i += 1;
        continue;
      }
      if (c === '}' && stack.length > 1) {
        // Closing a `${ … }` interpolation: back to the template literal.
        pop();
        out.push(' ');
        i += 1;
        continue;
      }
      out.push(c);
      i += 1;
      continue;
    }

    if (state === 'block') {
      if (c === '*' && d === '/') {
        pop();
        out.push('  ');
        i += 2;
        continue;
      }
      emit(c);
      i += 1;
      continue;
    }

    if (state === 'line') {
      if (c === '\n') {
        pop();
        out.push('\n');
        i += 1;
        continue;
      }
      emit(c);
      i += 1;
      continue;
    }

    // Inside a string or template literal.
    if (c === '\\') {
      out.push('  ');
      i += 2;
      continue;
    }
    if (state === '`' && c === '$' && d === '{') {
      push('code');
      out.push('  ');
      i += 2;
      continue;
    }
    if (c === state) {
      pop();
      out.push(' ');
      i += 1;
      continue;
    }
    emit(c);
    i += 1;
  }

  return out.join('');
}

/** Prisma's client accessor for a model: `SavedSearch` -> `savedSearch`. */
export function accessorFor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * The models this gate deliberately does not police, and why — printed by the
 * gate so their absence is documented rather than mistaken for a gap in the
 * inventory (TASK-MTSZ0AL4QP2CT §5.3 asked for exactly this).
 */
export interface CatalogueNote {
  model: string;
  accessor: string;
  /** How many `prisma.<accessor>.<op>(` call sites src/** holds today. */
  callSites: number;
  hasTenantColumn: boolean;
  reason: string;
}

const CATALOGUE_REASONS: Record<string, string> = {
  Topic:
    'shared CORDIS catalogue, no tenantId column at all — every tenant reads the same rows ' +
    '(pipeline/actions.ts:98,106). It is in SYSTEM_WIDE, so it never had an RLS policy to bypass.',
  ConceptTemplate:
    'tenantId is String? and null means "platform template"; it is in NULLABLE_TENANT and carries ' +
    'the tenant_or_shared policy, not tenant_isolation. Unlike Topic it DOES have a tenant column, ' +
    'so a read by a client-supplied id alone returned another tenant\'s template — measured, not ' +
    'hypothetical (TASK-MTVTU103F11XJ: tenant A created a ConceptNote against tenant B\'s template). ' +
    'The RLS policy did not stop it because the app role is BYPASSRLS. Fixed by routing every read ' +
    'through src/modules/m2/server/templates.ts, which ANDs the id with OR[tenantId NULL, tenantId]. ' +
    'Still structurally outside this gate, which judges the client rather than the where clause: ' +
    'src/modules/m2/server/templates.test.ts is the gate for this rule.',
  PublicLead:
    'contact request an anonymous visitor leaves on the readiness result screen (TASK-MULR765AR5G0C). ' +
    'The visitor has no account, so the row belongs to no tenant and has no tenantId; it is in ' +
    'SYSTEM_WIDE. NG-175: RLS on with system_scope only, so every access goes through withSystemScope ' +
    "('public-intake' form, 'platform-admin' lists, 'cross-tenant-job' forwarder and purge) and is " +
    'counted under check D. No tenant code path touches it.',
  Document: 'tenantId is String?; in NULLABLE_TENANT.',
  Chunk: 'tenantId is String?; in NULLABLE_TENANT.',
};

/**
 * A CHECK E1 block that is NOT a finding because of K-570148 = A, reported so
 * the exemption is visible on every run rather than silent. Never a baseline
 * entry: the baseline is for bypasses, and a bound transaction is not one.
 */
export interface Exemption {
  check: 'E1';
  file: string;
  /** Line of the `prisma.$transaction(` call. */
  line: number;
  /** Line of the `bindTransactionToTenant(` call inside it. */
  boundAt: number;
  /** How many `tx.<tenant model>` accesses after the bind were exempted. */
  accesses: number;
}

export interface ScanResult {
  findings: Finding[];
  /** Findings that live in fixtures: counted, never judged. */
  testFindings: Finding[];
  /** CHECK E1 blocks exempted by a bind call (K-570148 = A), src/** only. */
  exemptions: Exemption[];
  filesScanned: number;
  models: string[];
  catalogue: CatalogueNote[];
}

/** A model that is NOT tenant-scoped, with its relations that ARE. */
export interface RelationNote {
  model: string;
  /** relation field name -> tenant-scoped model it points at */
  relations: Map<string, string>;
}

/**
 * CHECK E2's map, read from the generated client's DMMF: for every model
 * outside tenantScopedModels(), the `kind === 'object'` fields whose type is
 * inside it. Keyed by Prisma accessor (`tenant`, `plan`, `user`). Models with
 * no such relation are left out, so a hit on this map is a hit on a policed
 * join. Throws, rather than returning an empty map, when the DMMF does not
 * know a model the schema regex found: that is a stale client, and a gate
 * that silently finds nothing on a stale client is the quiet failure this
 * file exists to prevent — run `pnpm db:generate`.
 */
export function tenantScopedRelations(scoped: ReadonlySet<string> = new Set(tenantScopedModels())): Map<string, RelationNote> {
  const models = Prisma.dmmf.datamodel.models;
  const known = new Set(models.map((m) => m.name));
  for (const name of scoped) {
    if (!known.has(name)) {
      throw new Error(
        `tenant-bypass-scan: model ${name} is in prisma/schema.prisma but not in the generated ` +
          'client\'s DMMF — run `pnpm db:generate` before `pnpm rls:bypass-check`.'
      );
    }
  }
  const out = new Map<string, RelationNote>();
  for (const m of models) {
    if (scoped.has(m.name)) continue;
    const relations = new Map<string, string>();
    for (const f of m.fields) {
      if (f.kind === 'object' && scoped.has(f.type)) relations.set(f.name, f.type);
    }
    if (relations.size > 0) out.set(accessorFor(m.name), { model: m.name, relations });
  }
  return out;
}

/**
 * Git hooks export GIT_DIR (and GIT_INDEX_FILE in a worktree); with those set,
 * git ignores `cwd` and answers from the hook's repository instead. Dropping
 * them makes `cwd` the repository again, which is what scan(cwd) promises.
 */
export const HOOK_GIT_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'] as const;

export function gitEnvFor(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const name of HOOK_GIT_VARS) delete out[name];
  return out;
}

function gitTrackedSources(cwd: string): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'src/*.ts', 'src/*.tsx'], {
    cwd,
    env: gitEnvFor(process.env),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split('\0').filter((f) => f.length > 0);
}

/** `tenantId ? {...} : {...}` where the false branch carries no tenantId. */
const COLLAPSE_TERNARY = /\btenantId\s*\?\s*\{([^{}]*)\}\s*:\s*\{([^{}]*)\}/g;
/**
 * `tenantId: <expr> ?? <expr>` / `|| <expr>`, fallback captured.
 *
 * Parentheses are allowed on the left because the live instance of this shape
 * in the tree is `tenantId: (subscription.metadata?.tenantId as string) ?? ''`
 * — excluding `(` from the left side silently missed it. Braces, commas,
 * semicolons and newlines still stop the match so it cannot run across
 * neighbouring properties.
 */
const FALLBACK_VALUE = /\btenantId\s*:\s*[^,;\n{}]*?(?:\?\?|\|\|)\s*([^,;\n{}]+)/g;
/**
 * Fallbacks that are not a fabricated tenant.
 *
 * `null` / `undefined` are an honest absence on a nullable tenantId column.
 * `PLATFORM_SCOPE_TENANT_ID` is src/lib/llm.ts's *declared* platform scope
 * (`'__platform__'`), whose docstring is explicit that it "is a declared scope,
 * not a stand-in for a tenant we failed to look up" and that its underscore
 * form cannot collide with a real cuid or slug. A named, documented constant is
 * a declaration; a bare string literal in the same position is a guess.
 */
const ALLOWED_FALLBACKS: ReadonlySet<string> = new Set([
  'null',
  'undefined',
  'PLATFORM_SCOPE_TENANT_ID',
]);

/** Any mint of the TenantTx brand. */
const BRAND_CAST = /\bas\s+(?:unknown\s+as\s+)?TenantTx\b/g;

/** Any use of the sanctioned cross-tenant path. */
const SYSTEM_SCOPE_CALL = /\bwithSystemScope(?:On)?\s*\(/g;
/**
 * The purpose literal, read out of the raw source within a short window of the
 * call — a window rather than the same line because prettier wraps a three-
 * argument call, and `withSystemScopeOn` puts a client in front of the purpose.
 */
const SYSTEM_SCOPE_PURPOSE = /['"]([a-z][a-z-]*)['"]/;
const KNOWN_PURPOSES: ReadonlySet<string> = new Set([
  'tenant-discovery',
  'subject-scoped',
  'platform-admin',
  'platform-aggregate',
  'cross-tenant-job',
  'public-intake',
]);
/** Where the path is defined; its own internal delegation is not a call site. */
const SYSTEM_SCOPE_HOME = 'src/lib/system-scope.ts';

/**
 * CHECK E1: a transaction opened on the singleton — or on a variable that falls
 * back to it — hence outside every scope. Built per file from the same receiver
 * list E2 uses (see SINGLETON_FALLBACK).
 */
function bareTransaction(receivers: readonly string[]): RegExp {
  return new RegExp(`(?<![\\w$])(?:${receivers.map(escapeRegExp).join('|')})\\.\\$transaction\\s*\\(`, 'g');
}
/**
 * The K-570148 = A exemption: the block binds itself the way withTenantOn does.
 * Matched with the callback's parameter as the first argument, so a bind of
 * some other connection inside the block is not one.
 */
function bindCall(cb: string): RegExp {
  return new RegExp(`\\bbindTransactionToTenant\\s*\\(\\s*${escapeRegExp(cb)}\\s*,`, 'g');
}
/**
 * An identifier may contain `$`, which is a regex metacharacter — and `\\b` does
 * not see a boundary before it, so the receiver regexes use a lookbehind.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[$\\^.*+?()[\]{}|]/g, '\\$&');
}
/**
 * The callback's parameter, read from the start of the block: `(tx) =>`,
 * `async (client) =>`, `tx =>`, `async function (tx)`. `tx` when unreadable —
 * the array form `$transaction([prisma.x.op()])` has no parameter and its
 * `prisma.` accessors are CHECK A's already.
 */
const CALLBACK_PARAM = /^\s*(?:async\s*)?(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*(?:=>|\{)/;
/** Reads whose argument body can name a relation. Writes carry data, not joins. */
const READ_OPS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
/**
 * A variable that falls back to the singleton: `const db = client ?? prisma`.
 * Every read through it is on the bare path whenever the caller omitted the
 * client, and nothing at the read site says which it was — so the read is
 * judged as if it were `prisma.`, because sometimes it is.
 */
const SINGLETON_FALLBACK = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?\?\?\s*prisma\b/g;

/**
 * Index of the `)` that closes the `(` at `open`, counting parentheses only —
 * strings and comments are already blanked, and braces inside a call are
 * balanced on their own. -1 when the file ends first (a regex literal holding
 * a lone parenthesis is the one way that happens); the block is then not
 * judged rather than guessed at.
 */
export function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineOf(code: string, offset: number): number {
  return code.slice(0, offset).split('\n').length;
}

/**
 * Offset, inside a bare `$transaction(` block, of the first
 * `bindTransactionToTenant(<cb>, …)` that is a top-level statement of the
 * callback body; -1 when there is none. Top level means brace depth exactly
 * one (the body's own braces, nothing nested) and, once trailing whitespace
 * and an `await` are stripped, the previous character is `{`, `;` or `}` — a
 * statement boundary. `if (x) await bind(tx, …)` fails on the boundary,
 * `if (x) { await bind(tx, …) }` fails on the depth, and so does a bind inside
 * a nested arrow function. Exported for the fixture tests.
 */
export function qualifyingBindAt(block: string, cb: string): number {
  for (const m of block.matchAll(bindCall(cb))) {
    const at = m.index ?? 0;
    const head = block.slice(0, at);
    let depth = 0;
    for (const c of head) {
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
    }
    if (depth !== 1) continue;
    const boundary = head.replace(/\s+$/, '').replace(/\bawait$/, '').replace(/\s+$/, '').slice(-1);
    if (boundary === '' || !'{;}'.includes(boundary)) continue;
    return at;
  }
  return -1;
}

/**
 * The tenant-scoped relations a read's argument body names, as property keys
 * (`users: true`, `subscription: {`, `assignments: {`). Sorted, so the baseline
 * subject is stable under reordering.
 */
function relationsNamed(args: string, note: RelationNote): string[] {
  const hit: string[] = [];
  for (const field of note.relations.keys()) {
    if (new RegExp(`(?:^|[^\\w$.])${field}\\s*:`).test(args)) hit.push(field);
  }
  return hit.sort();
}

export function scan(cwd = process.cwd()): ScanResult {
  const models = tenantScopedModels();
  const accessors = new Map<string, string>();
  for (const m of models) accessors.set(accessorFor(m), m);
  const relations = tenantScopedRelations(new Set(models));

  const files = gitTrackedSources(cwd);
  const findings: Finding[] = [];
  const testFindings: Finding[] = [];
  const exemptions: Exemption[] = [];
  /**
   * Seeded at zero for every model that has a written reason, because the note
   * is documentation of an absence and a counter that only grows when a call
   * site exists cannot report one. TASK-MTVTU103F11XJ took `ConceptTemplate`
   * from five bare call sites to none — and with a Map that only gained entries
   * on a match, the table and its recorded reason vanished from the report
   * entirely, which is the opposite of what §5.3 asked the note to do.
   */
  const catalogueCounts = new Map<string, number>(
    Object.keys(CATALOGUE_REASONS).map((model) => [model, 0])
  );

  for (const file of files) {
    const raw = readFileSync(resolve(cwd, file), 'utf8');
    const rawLines = raw.split('\n');
    const codeLines = blankNonCode(raw).split('\n');
    const sink = isTestFile(file) ? testFindings : findings;

    codeLines.forEach((code, idx) => {
      const line = idx + 1;
      const text = (rawLines[idx] ?? '').trim();

      // CHECK A — plus the catalogue tally, from the same pass.
      for (const m of code.matchAll(/\bprisma\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*\(/g)) {
        const accessor = m[1] as string;
        const model = accessors.get(accessor);
        if (model) {
          // Subject carries the operation as well as the model so the baseline
          // can hold "two of these three calls are by design and the third is
          // debt" — which is exactly the shape lifetime-licence.ts has.
          sink.push({ check: 'A', file, line, subject: `${accessor}.${m[2]}`, text });
          continue;
        }
        const capitalised = accessor.charAt(0).toUpperCase() + accessor.slice(1);
        if (SYSTEM_WIDE.has(capitalised) || NULLABLE_TENANT.has(capitalised)) {
          catalogueCounts.set(capitalised, (catalogueCounts.get(capitalised) ?? 0) + 1);
        }
      }

      // CHECK B1 — the collapse. Only when the false branch drops tenantId.
      for (const m of code.matchAll(COLLAPSE_TERNARY)) {
        const falseBranch = m[2] ?? '';
        if (/\btenantId\b/.test(falseBranch)) continue;
        sink.push({ check: 'B1', file, line, subject: 'tenantId-collapse-ternary', text });
      }

      // CHECK B2 — the invented tenant. `?? null` / `?? undefined` is honest absence.
      for (const m of code.matchAll(FALLBACK_VALUE)) {
        const fallback = (m[1] ?? '').trim();
        if (ALLOWED_FALLBACKS.has(fallback)) continue;
        sink.push({ check: 'B2', file, line, subject: 'tenantId-fallback', text });
      }

      // CHECK C — a brand mint outside the one place that earns it.
      if (file !== 'src/lib/db.ts') {
        for (const _m of code.matchAll(BRAND_CAST)) {
          void _m;
          sink.push({ check: 'C', file, line, subject: 'tenanttx-brand-cast', text });
        }
      }
    });

    // CHECK D — whole-file, because the purpose can sit on the next line.
    if (file !== SYSTEM_SCOPE_HOME) {
      const blanked = codeLines.join('\n');
      for (const m of blanked.matchAll(SYSTEM_SCOPE_CALL)) {
        const at = m.index ?? 0;
        const line = blanked.slice(0, at).split('\n').length;
        // The window starts at the same offset in the raw text: blankNonCode
        // preserves length byte for byte, which is what makes this sound.
        const window = raw.slice(at, at + 200);
        const found = SYSTEM_SCOPE_PURPOSE.exec(window)?.[1];
        const purpose = found && KNOWN_PURPOSES.has(found) ? found : 'unreadable-purpose';
        sink.push({
          check: 'D',
          file,
          line,
          subject: `system-scope:${purpose}`,
          text: (rawLines[line - 1] ?? '').trim(),
        });
      }
    }

    // CHECK E — whole-file, because a transaction block and a wrapped include
    // both span lines. Works on the blanked copy throughout; offsets map 1:1
    // onto the raw text, so the quoted line is the real one.
    const blanked = codeLines.join('\n');
    const push = (check: 'E1' | 'E2', at: number, subject: string) => {
      const line = lineOf(blanked, at);
      sink.push({ check, file, line, subject, text: (rawLines[line - 1] ?? '').trim() });
    };
    /** E2 on one read: the relations its argument body names, or nothing. */
    const judgeRead = (accessor: string, op: string, openParen: number, at: number) => {
      const note = relations.get(accessor);
      if (!note || !READ_OPS.has(op)) return;
      const close = closingParen(blanked, openParen);
      if (close < 0) return;
      const named = relationsNamed(blanked.slice(openParen + 1, close), note);
      if (named.length > 0) push('E2', at, `${accessor}.${op}->${named.join(',')}`);
    };

    // The bare receivers: the singleton and anything that falls back to it.
    const receivers = ['prisma'];
    for (const f of blanked.matchAll(SINGLETON_FALLBACK)) receivers.push(f[1] as string);

    // E1 — and E2 on the bare callback's non-scoped reads.
    for (const m of blanked.matchAll(bareTransaction(receivers))) {
      const open = (m.index ?? 0) + m[0].length - 1;
      const close = closingParen(blanked, open);
      if (close < 0) continue;
      const block = blanked.slice(open + 1, close);
      const cb = CALLBACK_PARAM.exec(block)?.[1] ?? 'tx';
      const bindAt = qualifyingBindAt(block, cb);
      let exempted = 0;
      const access = new RegExp(`\\b${cb}\\.([A-Za-z0-9_]+)\\.([A-Za-z0-9_]+)\\s*\\(`, 'g');
      for (const a of block.matchAll(access)) {
        const rel = a.index ?? 0;
        const at = open + 1 + rel;
        const accessor = a[1] as string;
        const op = a[2] as string;
        if (accessors.has(accessor)) {
          // After the bind the transaction carries app.tenant_id (K-570148 = A).
          if (bindAt >= 0 && rel > bindAt) exempted += 1;
          else push('E1', at, `${cb}.${accessor}.${op}`);
          continue;
        }
        if (bindAt >= 0 && rel > bindAt) continue;
        judgeRead(accessor, op, at + a[0].length - 1, at);
      }
      if (bindAt >= 0 && exempted > 0 && sink === findings) {
        exemptions.push({
          check: 'E1',
          file,
          line: lineOf(blanked, m.index ?? 0),
          boundAt: lineOf(blanked, open + 1 + bindAt),
          accesses: exempted,
        });
      }
    }

    // E2 — on the same receivers.
    const read = new RegExp(
      `(?<![\\w$])(?:${receivers.map(escapeRegExp).join('|')})\\.([A-Za-z0-9_]+)\\.([A-Za-z0-9_]+)\\s*\\(`,
      'g'
    );
    for (const r of blanked.matchAll(read)) {
      const at = r.index ?? 0;
      judgeRead(r[1] as string, r[2] as string, at + r[0].length - 1, at);
    }
  }

  const catalogue: CatalogueNote[] = [...catalogueCounts.entries()]
    .map(([model, callSites]) => ({
      model,
      accessor: accessorFor(model),
      callSites,
      hasTenantColumn: NULLABLE_TENANT.has(model),
      reason: CATALOGUE_REASONS[model] ?? (SYSTEM_WIDE.has(model)
        ? 'in SYSTEM_WIDE: no tenantId column, no policy expected.'
        : 'in NULLABLE_TENANT: tenantId is optional, covered by the shared policy.'),
    }))
    .sort((a, b) => b.callSites - a.callSites);

  return { findings, testFindings, exemptions, filesScanned: files.length, models, catalogue };
}
