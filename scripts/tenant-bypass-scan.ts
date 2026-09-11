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
 *      (ConceptTemplate, AuditEvent, Document, Chunk) is an honest absence.
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
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NULLABLE_TENANT, SYSTEM_WIDE, tenantScopedModels } from './rls-models';

export type CheckId = 'A' | 'B1' | 'B2' | 'C' | 'D';

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
  AuditEvent:
    'tenantId is String? — an erasure request from a tenant-less user writes exactly that row, which ' +
    'strict isolation refuses. In NULLABLE_TENANT since TASK-MTU6HUB8FUHMG C-2.',
  Document: 'tenantId is String?; in NULLABLE_TENANT.',
  Chunk: 'tenantId is String?; in NULLABLE_TENANT.',
};

export interface ScanResult {
  findings: Finding[];
  /** Findings that live in fixtures: counted, never judged. */
  testFindings: Finding[];
  filesScanned: number;
  models: string[];
  catalogue: CatalogueNote[];
}

function gitTrackedSources(cwd: string): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'src/*.ts', 'src/*.tsx'], {
    cwd,
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
]);
/** Where the path is defined; its own internal delegation is not a call site. */
const SYSTEM_SCOPE_HOME = 'src/lib/system-scope.ts';

export function scan(cwd = process.cwd()): ScanResult {
  const models = tenantScopedModels();
  const accessors = new Map<string, string>();
  for (const m of models) accessors.set(accessorFor(m), m);

  const files = gitTrackedSources(cwd);
  const findings: Finding[] = [];
  const testFindings: Finding[] = [];
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

  return { findings, testFindings, filesScanned: files.length, models, catalogue };
}
