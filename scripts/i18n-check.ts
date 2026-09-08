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

type Lang = 'tr' | 'en';

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
}

function hasBlockingGaps(report: AuditReport): boolean {
  const s = report.summary;
  return (
    s.onlyInTurkish.length > 0 ||
    s.onlyInEnglish.length > 0 ||
    s.missingInTurkish.length > 0 ||
    s.missingInEnglish.length > 0 ||
    s.unmatchedPatternsTurkish.length > 0 ||
    s.unmatchedPatternsEnglish.length > 0
  );
}

function main(): void {
  const wantsJson = process.argv.includes('--json');
  const report = audit();

  if (wantsJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    displayReport(report);
  }

  if (hasBlockingGaps(report)) {
    if (!wantsJson) {
      console.error('\n❌ i18n check FAILED — see the entries above. CLAUDE.md rule 8: a key ships in both languages.\n');
    }
    process.exit(1);
  }

  if (!wantsJson) console.log('✅ i18n check passed: both catalogs agree and every key used in src/ resolves.\n');
  process.exit(0);
}

main();
