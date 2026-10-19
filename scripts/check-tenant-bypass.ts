/**
 * Tenant-bypass gate — the fifth and last slice of the tenant-bypass sprint
 * (TASK-MTVRAZSUVLL9R), and the one that makes the other four stay done.
 *
 *   pnpm rls:bypass-check
 *
 * Slices 1-4 moved 48 tenant calls into `withTenant`. Nothing stopped the 49th
 * from being written the old way the next morning. This gate does: it fails on
 * a tenant-scoped Prisma call reached through the singleton, on a tenantId that
 * falls back instead of refusing, and on a TenantTx brand minted outside the one
 * function that earns it. What it finds and why each rule is drawn where it is
 * lives in scripts/tenant-bypass-scan.ts.
 *
 * ---------------------------------------------------------------------------
 * Why a static gate, and why a static gate is not enough
 * ---------------------------------------------------------------------------
 *
 * TASK-MTSZ0AL4QP2CT §2.3 measured the thing that makes this necessary: an
 * agent deliberately broke a wrapped read by giving it ANOTHER tenant's scope
 * and the Playwright suite stayed green — 2 passed. Locally the app connects as
 * `fabrika` (SUPERUSER, BYPASSRLS), so RLS is inert and the surviving
 * `where: { tenantId }` does the work on its own. An e2e-only gate for this
 * defect class reports success by construction.
 *
 * So this gate reads files, never the database, and it is deliberately the
 * cheap half of a pair. The other half already exists and already runs in
 * `pnpm gate`: `pnpm rls:verify` (scripts/check-rls-live.ts) measures isolation
 * on a real `fabrika_app` connection. Neither replaces the other — this one
 * catches the call that was never scoped, that one catches the policy that was
 * never applied. And neither replaces running the code: a gate that says the
 * shape is right says nothing about whether the query returns rows.
 *
 * ---------------------------------------------------------------------------
 * The baseline is a ratchet
 * ---------------------------------------------------------------------------
 *
 * 42 call sites in src/** are outside a tenant scope today. 36 of them are
 * right — GDPR subject exports that span every tenant a person belongs to,
 * platform-admin consoles, cron fan-outs, and lookups where the row IS the
 * credential and the tenant is the ANSWER. Six are wrong. Making the gate red
 * on all 42 would mean turning it off; recording all 42 as "fine" would mean
 * the six rot, which is exactly what happened to the findings in
 * TASK-MTSHUZUMVLTBF.
 *
 * scripts/tenant-bypass-baseline.json therefore records each one with a reason
 * read out of the file it names, a `kind` of `allowed` or `debt`, and a count.
 * The gate is red if a key is missing (new bypass) and red if a count RISES (a
 * new call site in a file whose recorded reason covers the old ones only).
 *
 * A count that FALLS is a warning, not a failure, and the asymmetry is
 * deliberate. A fall means somebody wrapped a call — an improvement, never a
 * regression — and in a worktree six agents share, the person whose push it
 * would block is usually not the person who caused it. That is how a ratchet
 * gets deleted rather than fixed. It happened during this card's own run:
 * TASK-MTVSBEO7VX6Y4 removed one of the two fallbacks in subscription-sync.ts
 * while the baseline was being written.
 *
 * What a warning cannot be allowed to do is let the list rot, so the debt
 * summary reports MEASURED counts rather than recorded ones, and marks an entry
 * measured at zero as fixed and awaiting `--prune`. The list can therefore
 * never overstate what is owed, and it prints on every run, green or red, so a
 * deferred finding cannot go quiet the way the ones in TASK-MTSHUZUMVLTBF did.
 *
 *   --prune   lower or remove entries whose count has fallen, then exit 0.
 *   --json    machine-readable findings.
 *
 * Exit codes: 0 = baseline matches exactly. 1 = it does not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  kindMatchesCheck,
  scan,
  type BaselineKind,
  type CheckId,
  type Finding,
} from './tenant-bypass-scan';

interface BaselineEntry {
  check: CheckId;
  file: string;
  subject: string;
  count: number;
  kind: BaselineKind;
  class: string;
  reason: string;
  card?: string;
}

interface Baseline {
  measuredAt: string;
  measuredAgainst: string;
  entries: BaselineEntry[];
}

const BASELINE_PATH = 'scripts/tenant-bypass-baseline.json';

const CHECK_TITLES: Record<CheckId, string> = {
  A: 'tenant-scoped model reached through the `prisma` singleton',
  B1: '`tenantId ? {…} : {…}` — the filter disappears instead of narrowing',
  B2: '`tenantId: x ?? …` / `x || …` — an invented tenant instead of a refusal',
  C: '`as unknown as TenantTx` — the brand minted outside withTenantOn',
  D: '`withSystemScope(…)` — a sanctioned cross-tenant escape, counted so it stays sanctioned',
  E1: '`prisma.$transaction((tx) => tx.<model>…)` — a tenant-scoped model on a transaction nothing bound',
  E2: 'a tenant-scoped relation joined through a model that is not tenant-scoped (include/select/_count/where)',
};

const HOW_TO_FIX: Record<CheckId, string> = {
  A:
    'Wrap it: `await withTenant(tenantId, (tx) => tx.<model>.<op>({ … }))`, keeping\n' +
    '  `tenantId` in the where/data clause. If the call genuinely cannot be scoped —\n' +
    '  the tenant is what it looks UP, or the question spans the estate — add it to\n' +
    `  ${BASELINE_PATH} with kind "allowed" and a reason read out of the file.`,
  B1:
    'Take the tenant from requireTenantPage/requireTenantAction/requireTenantApi\n' +
    '  (src/lib/tenant.ts) so it is a guaranteed non-empty string and the ternary is\n' +
    '  unnecessary. "No tenant" is a refusal in this codebase, never a wider query.',
  B2:
    'Refuse instead: assertTenantScope(tenantId, "<context>") throws\n' +
    '  MissingTenantScopeError. For a call that belongs to no tenant at all, use the\n' +
    "  declared scope PLATFORM_SCOPE_TENANT_ID ('__platform__', src/lib/llm.ts), not\n" +
    '  an ad-hoc string.',
  C:
    'The brand is minted in exactly one place — withTenantOn, beside\n' +
    '  set_config(\'app.tenant_id\', …). A cast elsewhere claims a tenant scope that\n' +
    '  nothing set. Call withTenant/withTenantOn and use the `tx` it hands you.',
  D:
    'Leaving a tenant scope is allowed, and is never silent. Record it in\n' +
    `  ${BASELINE_PATH} with kind "system-scope" and a reason read out of the file —\n` +
    '  the same standard the 35 `allowed` entries were held to. If the purpose reads\n' +
    '  as "unreadable-purpose", pass one of the five literals from\n' +
    '  SYSTEM_SCOPE_PURPOSES directly at the call site instead of a variable: a\n' +
    '  purpose the gate cannot read is a purpose nobody reviews.',
  E1:
    'Open the transaction through the scope instead: `withTenant(tenantId, (tx) => …)`\n' +
    '  or `withSystemScope(purpose, context, (tx) => …)` — both run set_config on the\n' +
    '  `tx` they hand you; `prisma.$transaction` does not. The one flow that cannot\n' +
    '  (the tenant is CREATED inside the transaction) calls\n' +
    '  `bindTransactionToTenant(tx, tenant.id)` first (src/lib/legal/registration-consent.ts)\n' +
    '  and is exempt from that line on — boss decision K-570148 = A, printed below\n' +
    '  as an exemption, never recorded here.',
  E2:
    'The root row is readable without a scope, the joined rows are not, so the\n' +
    '  relation comes back EMPTY under fabrika_app — "0 members", "no subscription",\n' +
    '  "assigned to nobody". Wrap the read: `withTenant(tenantId, (tx) => tx.<model>…)`\n' +
    '  for one tenant, `withSystemScope(purpose, context, (tx) => …)` for a platform\n' +
    '  screen. A helper that takes an optional client and does `client ?? prisma`\n' +
    '  is judged as the singleton it falls back to: make the client required.',
};

function keyOf(f: { check: string; file: string; subject: string }): string {
  return `${f.check}|${f.file}|${f.subject}`;
}

function loadBaseline(cwd: string): Baseline {
  return JSON.parse(readFileSync(resolve(cwd, BASELINE_PATH), 'utf8')) as Baseline;
}

function describe(f: Finding): string {
  return `  ${f.file}:${f.line}\n      ${f.text}`;
}

function main(): void {
  const cwd = process.cwd();
  const prune = process.argv.includes('--prune');
  const asJson = process.argv.includes('--json');

  const result = scan(cwd);
  const baseline = loadBaseline(cwd);

  const actual = new Map<string, Finding[]>();
  for (const f of result.findings) {
    const list = actual.get(keyOf(f));
    if (list) list.push(f);
    else actual.set(keyOf(f), [f]);
  }

  const expected = new Map<string, BaselineEntry>();
  for (const e of baseline.entries) expected.set(keyOf(e), e);

  const introduced: Finding[] = [];
  const grown: { entry: BaselineEntry; found: Finding[] }[] = [];
  const shrunk: { entry: BaselineEntry; found: number }[] = [];

  /**
   * The kind and the check have to agree, or the sanctioned path becomes the
   * mute button it was built not to be: relabel a CHECK A bypass as
   * "system-scope" and it would slide into the quiet list without ever going
   * through withSystemScope. Structural, so nobody has to remember it.
   */
  const mislabelled = baseline.entries.filter((e) => !kindMatchesCheck(e.check, e.kind));

  for (const [key, found] of actual) {
    const entry = expected.get(key);
    if (!entry) {
      introduced.push(...found);
      continue;
    }
    if (found.length > entry.count) grown.push({ entry, found });
  }
  for (const [key, entry] of expected) {
    const found = actual.get(key)?.length ?? 0;
    if (found < entry.count) shrunk.push({ entry, found });
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        { filesScanned: result.filesScanned, findings: result.findings, introduced, grown, shrunk },
        null,
        2
      )
    );
  }

  if (prune) {
    if (shrunk.length === 0) {
      console.log('Nothing to prune: no baseline entry is above what the tree holds.');
      return;
    }
    const stale = new Map(shrunk.map((s) => [keyOf(s.entry), s.found]));
    baseline.entries = baseline.entries
      .map((e) => {
        const found = stale.get(keyOf(e));
        return found === undefined ? e : { ...e, count: found };
      })
      .filter((e) => e.count > 0);
    writeFileSync(resolve(cwd, BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Pruned ${shrunk.length} baseline entr${shrunk.length === 1 ? 'y' : 'ies'}:`);
    for (const s of shrunk) {
      console.log(`  ${keyOf(s.entry)}  ${s.entry.count} -> ${s.found}`);
    }
    console.log(`\n${BASELINE_PATH} rewritten. Commit it with the change that closed them.`);
    return;
  }

  console.log(
    `Scanned ${result.filesScanned} tracked source files in src/** against ` +
      `${result.models.length} tenant-scoped models.`
  );
  console.log(
    `  ${result.findings.length} call site(s) outside a tenant scope; ` +
      `baseline records ${baseline.entries.reduce((a, e) => a + e.count, 0)}.`
  );
  console.log(
    `  ${result.testFindings.length} more are in fixtures (*.test.ts, *.spec.ts, __tests__/): ` +
      `reported, not judged.`
  );

  let failed = false;

  if (mislabelled.length > 0) {
    failed = true;
    console.error(`\n❌ ${mislabelled.length} baseline entr${mislabelled.length === 1 ? 'y has' : 'ies have'} a kind that does not match its check:`);
    for (const e of mislabelled) {
      console.error(`  ${e.file} — ${e.subject} (check ${e.check}, kind "${e.kind}")`);
    }
    console.error(
      '  CHECK D is the sanctioned cross-tenant path and is recorded as kind\n' +
        '  "system-scope"; every other check — A, B, C and the E family (a bare\n' +
        '  transaction, a relation joined without a scope) — records a bypass and\n' +
        '  must not be. A bypass relabelled into the sanctioned list is the mute\n' +
        '  button this gate exists to prevent.'
    );
  }

  if (introduced.length > 0) {
    failed = true;
    console.error(`\n❌ ${introduced.length} tenant bypass(es) this baseline has never seen:`);
    const byCheck = new Map<CheckId, Finding[]>();
    for (const f of introduced) {
      const list = byCheck.get(f.check);
      if (list) list.push(f);
      else byCheck.set(f.check, [f]);
    }
    for (const [check, list] of [...byCheck].sort()) {
      console.error(`\n  CHECK ${check} — ${CHECK_TITLES[check]}`);
      for (const f of list) console.error(describe(f));
      console.error(`\n  ${HOW_TO_FIX[check]}`);
    }
  }

  if (grown.length > 0) {
    failed = true;
    console.error(`\n❌ ${grown.length} known file(s) gained call sites:`);
    for (const g of grown) {
      console.error(
        `\n  ${g.entry.file} — ${g.entry.subject}: baseline ${g.entry.count}, found ${g.found.length}`
      );
      for (const f of g.found) console.error(describe(f));
      console.error(
        `  The recorded reason covers ${g.entry.count} of them:\n      ${g.entry.reason}`
      );
      console.error('  A new call site is not covered by an old reason. Wrap it, or record it.');
    }
  }

  if (shrunk.length > 0) {
    // Deliberately not `failed = true` — see the header. Fewer bypasses than the
    // baseline records is somebody's fix landing, and the gate must not bill the
    // next person to push for it.
    console.log(`\n⚠ ${shrunk.length} baseline entr${shrunk.length === 1 ? 'y is' : 'ies are'} ahead of the tree:`);
    for (const s of shrunk) {
      console.log(
        `  ${s.entry.file} — ${s.entry.subject}: recorded ${s.entry.count}, found ${s.found}` +
          (s.found === 0 ? '  ✔ fixed' : '')
      );
    }
    console.log(
      '  Somebody wrapped these. Run `pnpm rls:bypass-check --prune` and commit\n' +
        `  ${BASELINE_PATH} alongside the change that closed them. Not a failure.`
    );
  }

  // The catalogue note. TASK-MTSZ0AL4QP2CT §5.3 asked for this by name: Topic is
  // in none of the audit's buckets, and an absence with no explanation reads as a
  // missing row in the inventory rather than a deliberate exclusion.
  // PublicLead (TASK-MULR765AR5G0C) is printed for the same reason as Topic: it
  // holds personal data and is SYSTEM_WIDE, so its absence must be explained.
  const catalogue = result.catalogue.filter(
    (c) => c.hasTenantColumn || c.model === 'Topic' || c.model === 'PublicLead'
  );
  if (catalogue.length > 0) {
    console.log('\nShared catalogues this gate does not police (by construction, not by allowlist):');
    for (const c of catalogue) {
      console.log(`  ${c.model} — ${c.callSites} call site(s) in src/**`);
      console.log(`      ${c.reason}`);
    }
  }

  // CHECK E1 exemptions (K-570148 = A). An information line, not a finding and
  // not a baseline entry: the block bound itself the way withTenantOn does.
  // Printed on every run so the exemption stays visible — the day a second
  // registration-style flow appears here is the day somebody should ask why.
  if (result.exemptions.length > 0) {
    console.log(
      `\nℹ CHECK E1 exemptions (K-570148 = A): ${result.exemptions.length} bare transaction ` +
        'block(s) bound by bindTransactionToTenant, not judged after the bind:'
    );
    for (const x of result.exemptions) {
      console.log(
        `  ${x.file}:${x.line} — bound at :${x.boundAt}, ${x.accesses} tenant-scoped ` +
          `access(es) after it exempt`
      );
    }
    console.log(
      '  Same set_config as withTenantOn, applied at the first moment a tenant id\n' +
        '  exists (src/lib/legal/registration-consent.ts). Accesses BEFORE the bind are\n' +
        '  still judged.'
    );
  }

  // The sanctioned escapes, measured. Printed on every run for the same reason
  // the debt block is: a list of places where isolation is deliberately off is
  // exactly the list that must not go quiet.
  const escapes = baseline.entries
    .filter((e) => e.kind === 'system-scope')
    .map((e) => ({ entry: e, live: actual.get(keyOf(e))?.length ?? 0 }));
  const escapeCount = escapes.reduce((a, e) => a + e.live, 0);
  if (escapes.length > 0) {
    console.log(
      `\nSanctioned cross-tenant escapes: ${escapeCount} call site(s) via withSystemScope, measured.`
    );
    const byPurpose = new Map<string, { files: number; sites: number }>();
    for (const e of escapes) {
      const purpose = e.entry.subject.replace(/^system-scope:/, '');
      const acc = byPurpose.get(purpose) ?? { files: 0, sites: 0 };
      acc.files += 1;
      acc.sites += e.live;
      byPurpose.set(purpose, acc);
    }
    for (const [purpose, acc] of [...byPurpose].sort()) {
      console.log(`  ${purpose.padEnd(20)} ${acc.sites} call site(s) in ${acc.files} file(s)`);
    }
    console.log(
      '  Each one is recorded with a reason, ratcheted like a bypass, and opens the\n' +
        '  `system_scope` RLS policy for one transaction only (prisma/rls.sql).'
    );
  }

  // Measured, never recorded: a debt list that can overstate is a debt list
  // people stop reading.
  const debt = baseline.entries
    .filter((e) => e.kind === 'debt')
    .map((e) => ({ entry: e, live: actual.get(keyOf(e))?.length ?? 0 }));
  const owed = debt.reduce((a, d) => a + d.live, 0);
  if (debt.length > 0) {
    console.log(`\n⚠ Outstanding tenant-bypass debt: ${owed} call site(s), measured.`);
    for (const d of debt) {
      const state = d.live === 0 ? 'fixed — prune me' : `x${d.live}`;
      console.log(`  [${d.entry.card ?? 'UNASSIGNED'}] ${d.entry.file} — ${d.entry.subject} (${state})`);
    }
    console.log('  Recorded as wrong, not as accepted. This block prints on every run.');
  }

  if (failed) {
    console.error('\n❌ rls:bypass-check FAILED.');
    process.exit(1);
  }

  const allowed = baseline.entries
    .filter((e) => e.kind === 'allowed')
    .reduce((a, e) => a + (actual.get(keyOf(e))?.length ?? 0), 0);
  console.log(
    `\n✅ SUCCESS: no new tenant bypass. ${allowed} call site(s) allowed with a recorded reason, ` +
      `${escapeCount} on the sanctioned cross-tenant path, ${owed} still owed.`
  );
  console.log('   (Shape only — `pnpm rls:verify` asks the database whether isolation actually holds.)');
}

main();
