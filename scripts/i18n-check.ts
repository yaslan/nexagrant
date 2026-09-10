#!/usr/bin/env tsx
/**
 * i18n gate — enforces CLAUDE.md rule 8 ("no hard-coded user-facing text; a new key is
 * added to BOTH languages").
 *
 * Three independent checks, all of them blocking:
 *
 *   1. CATALOG PARITY  messages/tr.json and messages/en.json must carry the same key set.
 *      This is rule 8 stated literally, and it is the check the old script never had.
 *   2. STATIC KEYS     every `t('some.key')` in src/ must resolve in both catalogs.
 *   3. DYNAMIC KEYS    every `t(`some.${variable}.key`)` must have at least one catalog
 *      entry matching its shape, in both catalogs (see "Dynamic keys" below).
 *   4. HARD-CODED TEXT no NEW user-facing literal may be written straight into a .tsx
 *      under src/app/** or src/modules/**, measured against i18n-baseline.json.
 *
 * ── Why check 4 exists ────────────────────────────────────────────────────────────────
 * Checks 1-3 only ask whether the keys that ARE used resolve. A file that never calls
 * `t()` was skipped on the first line of the scan loop, so the gate could not see the
 * violation that matters most: text written straight into the JSX. That is how
 * marketplace/client.tsx carried 41 Turkish literals under a green gate and kept
 * TASK-MTU6I7SO2BD28 false-closed for a sprint (TASK-MTU64MMEQC0WV §B-01). Rule 8 was
 * being enforced backwards — bind a string to `t()` and you got audited, hard-code it and
 * you became invisible.
 *
 * ── Why a baseline, and not a flat ban ────────────────────────────────────────────────
 * Turning the rule on unconditionally paints the gate red today: 325 literals across 37
 * files are already in the tree, and a gate that is red on arrival gets switched off
 * rather than obeyed. So i18n-baseline.json records the debt per file and check 4 is a
 * RATCHET: a file may not gain literals, and a file absent from the baseline may not have
 * any at all. Paying debt down is always green — the run just prints a note that the
 * baseline is now looser than reality and can be refreshed with --update-baseline.
 *
 * Unused catalog keys are reported for information only and never fail the run: the
 * extractor cannot see keys reached from outside src/ (docs, seed data, e-mail templates),
 * so an "unused" verdict is a hint, not a defect.
 *
 * ── Namespaces ────────────────────────────────────────────────────────────────────────
 * The previous version took the FIRST `useTranslations('X')` in a file and prefixed every
 * `t(...)` in that file with X. Eleven files declare two or three namespaces, so their keys
 * were resolved against the wrong prefix — which is where a large part of the 600 phantom
 * "unused" entries came from. This version binds each variable to its own namespace
 * (`const tIdentity = useTranslations('UserIdentity')` → `tIdentity('x')` is
 * `UserIdentity.x`) and understands the server-side form
 * `await getTranslations({ locale, namespace: 'X' })` as well, which 23 files use and the
 * old regex ignored entirely.
 *
 * ── Dynamic keys ──────────────────────────────────────────────────────────────────────
 * `t(`detail.tab.${tab}`)` has no single key to look up; the concrete key depends on a
 * runtime value. The old script treated the source text as a literal key, so it reported
 * `Pipeline.detail.tab.${tab}` as missing from both catalogs — 28 such phantom gaps, which
 * is why the check exited 1 on every single run and why next.config.ts had been taught to
 * swallow it.
 *
 * Three ways to handle these were available:
 *   (a) skip dynamic calls entirely — silent, but then a whole namespace can be deleted
 *       from one language and nothing notices;
 *   (b) enumerate the possible values by evaluating the expression — needs type
 *       information and real inference, and still fails on anything from the database;
 *   (c) turn the call into a shape and require the shape to be inhabited.
 * This script does (c): each `${...}` becomes a single-segment wildcard, so the call above
 * becomes the pattern `Pipeline.detail.tab.*` and passes only while at least one key of
 * that shape exists in BOTH catalogs. It cannot prove that every runtime value resolves —
 * nothing static can — but it does catch the failure that actually happens: a translated
 * group present in one language and missing in the other. Combined with check 1, a variant
 * added to tr.json alone still fails the run.
 */
import * as fs from 'fs';
import * as path from 'path';

import { countByFile, scanHardcoded, type Violation } from './i18n-hardcoded';

type Lang = 'tr' | 'en';

/** Repo-root ledger of pre-existing hard-coded literals: file → count. */
const BASELINE_FILE = 'i18n-baseline.json';

interface DynamicPattern {
  /** Source text of the key, e.g. "Pipeline.detail.tab.${tab}" — used in reports. */
  raw: string;
  /** Segments; `null` marks a `${...}` wildcard segment. */
  segments: (string | null)[];
}

interface AuditReport {
  timestamp: string;
  summary: {
    totalKeysInCode: number;
    totalDynamicPatterns: number;
    totalKeysInTurkish: number;
    totalKeysInEnglish: number;
    /** Rule 8: key sets of the two catalogs must be identical. */
    onlyInTurkish: string[];
    onlyInEnglish: string[];
    missingInTurkish: string[];
    missingInEnglish: string[];
    missingInBoth: string[];
    /** Dynamic call shapes that match no key in the given catalog. */
    unmatchedPatternsTurkish: string[];
    unmatchedPatternsEnglish: string[];
    unusedInTurkish: string[];
    unusedInEnglish: string[];
  };
  hardcoded: HardcodedReport;
  /** Check 5: a placeholder-bearing key called as `t('key')` with no value at all. */
  placeholderViolations: PlaceholderViolation[];
}

interface HardcodedReport {
  /** Every literal found today, so --json consumers can diff without re-scanning. */
  violations: Violation[];
  /** file → count, as measured now. */
  current: Record<string, number>;
  /** file → count, as recorded in i18n-baseline.json (empty when the file is absent). */
  baseline: Record<string, number>;
  /** BLOCKING — a baselined file gained literals. */
  regressions: { file: string; baseline: number; current: number }[];
  /** BLOCKING — a file with no baseline entry carries literals. */
  newOffenders: { file: string; current: number }[];
  /** Informational — debt was paid down; the baseline is now looser than reality. */
  improvements: { file: string; baseline: number; current: number }[];
  /** Informational — a baselined file is fully clean and can leave the ledger. */
  cleared: string[];
}

// ── Hard-coded text (check 4) ──────────────────────────────────────────────────────────

function loadBaseline(): Record<string, number> {
  const file = path.join(process.cwd(), BASELINE_FILE);
  if (!fs.existsSync(file)) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${BASELINE_FILE} must be an object of "<file path>": <violation count>`);
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`${BASELINE_FILE}: "${key}" must map to a non-negative integer, got ${String(value)}`);
    }
    out[key] = value;
  }
  return out;
}

function writeBaseline(current: Record<string, number>): void {
  fs.writeFileSync(path.join(process.cwd(), BASELINE_FILE), `${JSON.stringify(current, null, 2)}\n`, 'utf-8');
}

function auditHardcoded(): HardcodedReport {
  const violations = scanHardcoded();
  const current = countByFile(violations);
  const baseline = loadBaseline();

  const regressions: HardcodedReport['regressions'] = [];
  const newOffenders: HardcodedReport['newOffenders'] = [];
  const improvements: HardcodedReport['improvements'] = [];
  const cleared: string[] = [];

  for (const [file, count] of Object.entries(current)) {
    const allowed = baseline[file];
    if (allowed === undefined) newOffenders.push({ file, current: count });
    else if (count > allowed) regressions.push({ file, baseline: allowed, current: count });
    else if (count < allowed) improvements.push({ file, baseline: allowed, current: count });
  }
  for (const file of Object.keys(baseline)) {
    if (current[file] === undefined) cleared.push(file);
  }

  return { violations, current, baseline, regressions, newOffenders, improvements, cleared: cleared.sort() };
}

// ── Catalogs ───────────────────────────────────────────────────────────────────────────

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function loadMessageKeys(lang: Lang): string[] {
  const messageFile = path.join(process.cwd(), 'messages', `${lang}.json`);
  const content = fs.readFileSync(messageFile, 'utf-8');
  return flattenKeys(JSON.parse(content) as Record<string, unknown>).sort();
}

// ── Source scanning ────────────────────────────────────────────────────────────────────

function findFiles(dir: string, extensions = ['.ts', '.tsx']): string[] {
  const files: string[] = [];
  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) traverse(fullPath);
      else if (extensions.some(ext => entry.name.endsWith(ext))) files.push(fullPath);
    }
  }
  traverse(dir);
  return files;
}

/** `const t = useTranslations('NS')` / `useTranslations()` → t ↦ 'NS' (or the root, ''). */
const USE_TRANSLATIONS =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useTranslations\(\s*(?:(['"])([^'"]*)\2\s*)?\)/g;
/** `const t = await getTranslations({ locale, namespace: 'NS' })` */
const GET_TRANSLATIONS_OBJ =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?getTranslations\(\s*\{[^}]*?namespace\s*:\s*(['"])([^'"]*)\2[^}]*?\}\s*\)/g;
/** `const t = await getTranslations('NS')` / `getTranslations()` */
const GET_TRANSLATIONS_STR =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?getTranslations\(\s*(?:(['"])([^'"]*)\2\s*)?\)/g;

interface Binding {
  variable: string;
  namespace: string;
  /** Character offset of the binding in the (comment-stripped) source. */
  at: number;
}

/**
 * Blanks out `//` and block comments, keeping every offset and line break intact so
 * positions still line up with the original file. Without this, prose such as the note in
 * src/app/[locale]/admin/feedback/page.tsx — "only sees literal `t('...')` arguments" —
 * is scanned as a call and reported as the missing key `adminFeedback....`.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else {
      out += source[i];
      i++;
    }
  }
  return out;
}

function collectNamespaceBindings(content: string): Binding[] {
  const bindings: Binding[] = [];
  for (const re of [USE_TRANSLATIONS, GET_TRANSLATIONS_OBJ, GET_TRANSLATIONS_STR]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const variable = m[1];
      if (variable === undefined) continue;
      // The object form without a `namespace:` key falls through to the string form with an
      // undefined group; both mean the root namespace.
      bindings.push({ variable, namespace: m[3] ?? '', at: m.index });
    }
  }
  // De-duplicate: the object and string patterns can both match one `getTranslations({...})`.
  const seen = new Set<string>();
  return bindings
    .sort((a, b) => a.at - b.at || b.namespace.length - a.namespace.length)
    .filter(b => {
      const id = `${b.variable}@${b.at}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/**
 * The namespace in force for a call at `offset` is the one bound by the nearest preceding
 * `const <var> = useTranslations(...)`. src/app/[locale]/admin/feedback/page.tsx binds `t`
 * three times in three functions — twice to `adminFeedback`, once to `feedback` — so
 * "one namespace per variable per file" resolves six of its keys against the wrong prefix.
 * Full scope analysis needs a parser; nearest-binding-above is exact for the idiom this
 * codebase uses, where the binding sits at the top of the function that calls it.
 */
function namespaceAt(bindings: Binding[], variable: string, offset: number): string | undefined {
  let found: string | undefined;
  for (const b of bindings) {
    if (b.variable !== variable) continue;
    if (b.at > offset) break;
    found = b.namespace;
  }
  return found;
}

function qualify(namespace: string, key: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

function toPattern(raw: string): DynamicPattern {
  // Split on `.` that sit outside a `${ ... }`, then mark interpolated segments.
  const segments: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '$' && raw[i + 1] === '{') {
      depth++;
      current += '${';
      i++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      current += '}';
    } else if (ch === '.' && depth === 0) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return {
    raw,
    segments: segments.map(s => (s.includes('${') ? null : s)),
  };
}

function patternMatches(pattern: DynamicPattern, key: string): boolean {
  const keySegments = key.split('.');
  if (keySegments.length !== pattern.segments.length) return false;
  return pattern.segments.every((seg, i) => seg === null || seg === keySegments[i]);
}

interface Extraction {
  staticKeys: string[];
  dynamicPatterns: DynamicPattern[];
}

function extractTranslationKeysFromCode(): Extraction {
  const srcDir = path.join(process.cwd(), 'src');
  const files = findFiles(srcDir);

  const staticKeys = new Set<string>();
  const dynamicByRaw = new Map<string, DynamicPattern>();

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    if (!raw.includes('useTranslations') && !raw.includes('getTranslations')) continue;

    const content = stripComments(raw);
    const bindings = collectNamespaceBindings(content);
    if (bindings.length === 0) continue;

    const variables = new Set(bindings.map(b => b.variable));
    for (const variable of variables) {
      // `t('key')`, `t.rich('key')`, `t.raw('key')`, `t.markup('key')`, and the template
      // form of each. Keys never contain a quote character, so a non-greedy scan to the
      // matching quote is enough.
      const callRe = new RegExp(
        `(?:^|[^\\w.$])${variable}(?:\\.(?:rich|raw|markup|has))?\\(\\s*(['"\`])([^'"\`]*)\\1`,
        'g'
      );
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(content)) !== null) {
        const key = m[2];
        if (key === undefined || key === '') continue;
        const namespace = namespaceAt(bindings, variable, m.index);
        if (namespace === undefined) continue; // call sits above every binding: not a t()
        const full = qualify(namespace, key);
        if (full.includes('${')) {
          if (!dynamicByRaw.has(full)) dynamicByRaw.set(full, toPattern(full));
        } else {
          staticKeys.add(full);
        }
      }
    }
  }

  return {
    staticKeys: Array.from(staticKeys).sort(),
    dynamicPatterns: Array.from(dynamicByRaw.values()).sort((a, b) => a.raw.localeCompare(b.raw)),
  };
}

// ── Placeholder-bearing keys called without a value (check 5) ────────────────────────
//
// next-intl does not throw when `t('key')` resolves to a message like "{brand} Pricing"
// and no `brand` is supplied: it logs a FORMATTING_ERROR and falls back to rendering the
// key path itself ("pricing.metaTitle") in its place — a 200 response with a broken
// <title> or, worse, broken on-screen copy. Checks 1-3 only ask whether a key resolves,
// so they are blind to this; TASK-MTVTIU3LAYFOA found six such call sites with nothing
// but a live curl and a grep. This check makes the failure static instead of something a
// crawler discovers first: a plain `t('key')` call — no second argument at all — is
// blocking when the resolved message needs at least one `{var}` interpolation in either
// catalog.
//
// Scope, deliberately: only the literal-key form (`t('key')`, not a template literal —
// those are dynamic and already handled by checks 3), and only "zero arguments" (a call
// that passes a params object missing just one of several needed variables — as
// `ModuleGate.reason.DEV_INTERNAL_ONLY` did until this task fixed it — is not caught,
// since that needs matching the object's actual keys against the message's variables, not
// just detecting an object literal exists). And only simple `{var}` interpolation is
// recognised — ICU plural/select forms ("{count, plural, ...}") need real ICU parsing to
// tell apart from a literal brace, so they are left alone rather than risking a false
// positive on day one.

interface PlaceholderViolation {
  key: string;
  file: string;
  line: number;
  placeholders: string[];
}

function collectPlaceholders(obj: Record<string, unknown>, prefix: string, out: Map<string, string[]>): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      const vars = Array.from(value.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)).map(m => m[1]).filter((v): v is string => v !== undefined);
      if (vars.length > 0) {
        const existing = out.get(fullKey) ?? [];
        out.set(fullKey, Array.from(new Set([...existing, ...vars])));
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectPlaceholders(value as Record<string, unknown>, fullKey, out);
    }
  }
}

/** Message keys (in either catalog) whose value contains at least one simple `{var}`. */
function placeholderKeys(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const lang of ['tr', 'en'] as const) {
    const messageFile = path.join(process.cwd(), 'messages', `${lang}.json`);
    const parsed = JSON.parse(fs.readFileSync(messageFile, 'utf-8')) as Record<string, unknown>;
    collectPlaceholders(parsed, '', map);
  }
  return map;
}

function scanPlaceholderCalls(): PlaceholderViolation[] {
  const needsValue = placeholderKeys();
  const srcDir = path.join(process.cwd(), 'src');
  const files = findFiles(srcDir);
  const violations: PlaceholderViolation[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    if (!raw.includes('useTranslations') && !raw.includes('getTranslations')) continue;

    const content = stripComments(raw);
    const bindings = collectNamespaceBindings(content);
    if (bindings.length === 0) continue;

    const variables = new Set(bindings.map(b => b.variable));
    for (const variable of variables) {
      // Plain string-literal key only, e.g. `t('key')` or `t("key")` — a template-literal
      // key is a dynamic call and out of scope here.
      const callRe = new RegExp(`(?:^|[^\\w.$])${variable}\\(\\s*(['"])([^'"]*)\\1`, 'g');
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(content)) !== null) {
        const key = m[2];
        if (!key) continue;
        const namespace = namespaceAt(bindings, variable, m.index);
        if (namespace === undefined) continue;
        const full = qualify(namespace, key);
        const placeholders = needsValue.get(full);
        if (!placeholders) continue;

        const afterKey = m.index + m[0].length;
        const next = content.slice(afterKey).match(/^\s*([),])/);
        const hasSecondArg = next?.[1] === ',';
        if (!hasSecondArg) {
          const line = content.slice(0, m.index).split('\n').length;
          violations.push({ key: full, file: path.relative(process.cwd(), file), line, placeholders });
        }
      }
    }
  }
  return violations;
}

// ── Audit ──────────────────────────────────────────────────────────────────────────────

function audit(): AuditReport {
  const { staticKeys, dynamicPatterns } = extractTranslationKeysFromCode();
  const turkishKeys = loadMessageKeys('tr');
  const englishKeys = loadMessageKeys('en');

  const turkishSet = new Set(turkishKeys);
  const englishSet = new Set(englishKeys);

  const missingInTurkish = staticKeys.filter(k => !turkishSet.has(k));
  const missingInEnglish = staticKeys.filter(k => !englishSet.has(k));
  const missingInBoth = missingInTurkish.filter(k => !englishSet.has(k));

  const onlyInTurkish = turkishKeys.filter(k => !englishSet.has(k));
  const onlyInEnglish = englishKeys.filter(k => !turkishSet.has(k));

  const unmatchedPatternsTurkish: string[] = [];
  const unmatchedPatternsEnglish: string[] = [];
  const coveredByPattern = new Set<string>();

  for (const pattern of dynamicPatterns) {
    const trHits = turkishKeys.filter(k => patternMatches(pattern, k));
    const enHits = englishKeys.filter(k => patternMatches(pattern, k));
    if (trHits.length === 0) unmatchedPatternsTurkish.push(pattern.raw);
    if (enHits.length === 0) unmatchedPatternsEnglish.push(pattern.raw);
    for (const k of trHits) coveredByPattern.add(k);
    for (const k of enHits) coveredByPattern.add(k);
  }

  const usedSet = new Set(staticKeys);
  const isUsed = (k: string) => usedSet.has(k) || coveredByPattern.has(k);

  return {
    timestamp: new Date().toISOString(),
    hardcoded: auditHardcoded(),
    placeholderViolations: scanPlaceholderCalls(),
    summary: {
      totalKeysInCode: staticKeys.length,
      totalDynamicPatterns: dynamicPatterns.length,
      totalKeysInTurkish: turkishKeys.length,
      totalKeysInEnglish: englishKeys.length,
      onlyInTurkish,
      onlyInEnglish,
      missingInTurkish,
      missingInEnglish,
      missingInBoth,
      unmatchedPatternsTurkish,
      unmatchedPatternsEnglish,
      unusedInTurkish: turkishKeys.filter(k => !isUsed(k)),
      unusedInEnglish: englishKeys.filter(k => !isUsed(k)),
    },
  };
}

// ── Reporting ──────────────────────────────────────────────────────────────────────────

function list(label: string, keys: string[], cap = 25): void {
  if (keys.length === 0) return;
  console.log(`${label} (${keys.length}):`);
  keys.slice(0, cap).forEach(k => console.log(`   - ${k}`));
  if (keys.length > cap) console.log(`   ... and ${keys.length - cap} more`);
  console.log();
}

function displayReport(report: AuditReport): void {
  const s = report.summary;

  console.log('\n=== i18n Translation Audit Report ===\n');
  console.log(`Report generated: ${report.timestamp}\n`);
  console.log('Summary:');
  console.log(`  Static keys used in code: ${s.totalKeysInCode}`);
  console.log(`  Dynamic key patterns:     ${s.totalDynamicPatterns}`);
  console.log(`  Keys in messages/tr.json: ${s.totalKeysInTurkish}`);
  console.log(`  Keys in messages/en.json: ${s.totalKeysInEnglish}\n`);

  list('❌ In tr.json but NOT in en.json (rule 8)', s.onlyInTurkish);
  list('❌ In en.json but NOT in tr.json (rule 8)', s.onlyInEnglish);
  list('❌ Used in code, missing in BOTH languages', s.missingInBoth);
  list('❌ Used in code, missing in Turkish', s.missingInTurkish.filter(k => !s.missingInBoth.includes(k)));
  list('❌ Used in code, missing in English', s.missingInEnglish.filter(k => !s.missingInBoth.includes(k)));
  list('❌ Dynamic key shape matches nothing in Turkish', s.unmatchedPatternsTurkish);
  list('❌ Dynamic key shape matches nothing in English', s.unmatchedPatternsEnglish);
  list('💤 In the catalogs but not reached from src/ (informational)', s.unusedInTurkish, 10);

  if (report.placeholderViolations.length > 0) {
    console.log(`❌ Placeholder key called with no value — next-intl will render the key path, not the message (${report.placeholderViolations.length}):`);
    for (const v of report.placeholderViolations) {
      console.log(`   - ${v.file}:${v.line}  ${v.key}  needs { ${v.placeholders.join(', ')} }`);
    }
    console.log();
  }

  displayHardcoded(report.hardcoded);
}

function displayHardcoded(h: HardcodedReport): void {
  const total = Object.values(h.current).reduce((a, b) => a + b, 0);
  const allowed = Object.values(h.baseline).reduce((a, b) => a + b, 0);

  console.log('Hard-coded user-facing text (src/app, src/modules — *.tsx):');
  console.log(`  Literals found:   ${total} in ${Object.keys(h.current).length} file(s)`);
  console.log(`  Baseline allows:  ${allowed} in ${Object.keys(h.baseline).length} file(s)\n`);

  if (h.newOffenders.length > 0) {
    console.log(`❌ Not in ${BASELINE_FILE} — a file may not introduce hard-coded text (${h.newOffenders.length}):`);
    for (const o of h.newOffenders) {
      console.log(`   - ${o.file}  (${o.current} literal${o.current === 1 ? '' : 's'})`);
      for (const v of h.violations.filter(v => v.file === o.file).slice(0, 5)) {
        console.log(`       ${v.line}  [${v.kind}]  ${JSON.stringify(v.text)}`);
      }
      if (o.current > 5) console.log(`       ... and ${o.current - 5} more`);
    }
    console.log();
  }

  if (h.regressions.length > 0) {
    console.log(`❌ More hard-coded text than the baseline allows (${h.regressions.length}):`);
    for (const r of h.regressions) {
      console.log(`   - ${r.file}  ${r.baseline} → ${r.current}  (+${r.current - r.baseline})`);
      // A count cannot say WHICH literal is the new one — the baseline stores numbers, not
      // texts. So list the file's literals and let the author recognise their own addition;
      // printing only a slice would point at the wrong line most of the time.
      const inFile = h.violations.filter(v => v.file === r.file);
      for (const v of inFile.slice(0, 12)) {
        console.log(`       ${v.line}  [${v.kind}]  ${JSON.stringify(v.text)}`);
      }
      if (inFile.length > 12) console.log(`       ... and ${inFile.length - 12} more in this file`);
    }
    console.log();
  }

  if (h.improvements.length > 0 || h.cleared.length > 0) {
    const paid =
      h.improvements.reduce((sum, i) => sum + (i.baseline - i.current), 0) +
      h.cleared.reduce((sum, f) => sum + (h.baseline[f] ?? 0), 0);
    console.log(`⚠️  Baseline is looser than reality — ${paid} literal(s) paid down. Refresh it with:`);
    console.log(`      pnpm i18n:check --update-baseline`);
    for (const i of h.improvements) console.log(`   - ${i.file}  ${i.baseline} → ${i.current}`);
    for (const f of h.cleared) console.log(`   - ${f}  ${h.baseline[f]} → 0  (clean — remove from the baseline)`);
    console.log();
  }
}

function hasBlockingGaps(report: AuditReport): boolean {
  const s = report.summary;
  return (
    s.onlyInTurkish.length > 0 ||
    s.onlyInEnglish.length > 0 ||
    s.missingInTurkish.length > 0 ||
    s.missingInEnglish.length > 0 ||
    s.unmatchedPatternsTurkish.length > 0 ||
    s.unmatchedPatternsEnglish.length > 0 ||
    // Check 4 is a ratchet: growth blocks, shrinkage does not.
    report.hardcoded.regressions.length > 0 ||
    report.hardcoded.newOffenders.length > 0 ||
    report.placeholderViolations.length > 0
  );
}

function main(): void {
  const wantsJson = process.argv.includes('--json');
  const updateBaseline = process.argv.includes('--update-baseline');
  const report = audit();

  if (updateBaseline) {
    writeBaseline(report.hardcoded.current);
    const total = Object.values(report.hardcoded.current).reduce((a, b) => a + b, 0);
    console.log(`✍️  ${BASELINE_FILE} rewritten: ${total} literal(s) in ${Object.keys(report.hardcoded.current).length} file(s).`);
    console.log('   Commit it with the change that moved the text, so the ledger only ever shrinks.\n');
    process.exit(0);
  }

  if (wantsJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    displayReport(report);
  }

  if (hasBlockingGaps(report)) {
    if (!wantsJson) {
      console.error('\n❌ i18n check FAILED — see the entries above. CLAUDE.md rule 8: no hard-coded user-facing text, and a key ships in both languages.\n');
    }
    process.exit(1);
  }

  if (!wantsJson) console.log('✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.\n');
  process.exit(0);
}

main();
