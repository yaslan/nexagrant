#!/usr/bin/env tsx
/**
 * Hard-coded user-facing string detector — the missing half of CLAUDE.md rule 8.
 *
 * `i18n:check` used to answer only "does every key that IS used resolve in both
 * catalogs?". A file that never calls `t()` was skipped on its first line
 * (`if (!raw.includes('useTranslations') ...) continue`), so the gate was structurally
 * blind to the violation that actually matters: text written straight into the JSX.
 * That blindness let a workspace page's client.tsx (since removed, ADR-0005) carry 41
 * Turkish literals with a green gate, and kept TASK-MTU6I7SO2BD28 false-closed for a
 * sprint (audited in TASK-MTU64MMEQC0WV §B-01).
 *
 * ── What counts as a violation ────────────────────────────────────────────────────────
 * Inside src/app/** and src/modules/** `.tsx` files, a string literal that reaches the
 * user as prose:
 *   - a JSX text node            <span>Aktif Hibe Çağrısı</span>
 *   - a text-carrying prop       title= / label= / placeholder= / aria-label=
 * and that is either Turkish (carries ç ğ ı İ ö ş ü) or two or more words. A single
 * ASCII word ("Save") is deliberately NOT a violation: at one word the signal is too weak
 * to separate prose from an identifier, and a gate that cries wolf gets disabled. This
 * detector is a floor, not a census.
 *
 * ── What is excluded ──────────────────────────────────────────────────────────────────
 * Technical strings are not prose: Tailwind class lists, routes and file paths, URLs,
 * test ids, import specifiers, mime types, identifiers (camelCase / PascalCase / kebab /
 * snake / CONST), dates, numbers with units. `className` and `data-testid` are not in the
 * prop list at all, so they cannot be reported even before those filters run.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface Violation {
  /** Repo-relative, POSIX separators — the key shape used in i18n-baseline.json. */
  file: string;
  line: number;
  kind: 'jsx-text' | 'attr:title' | 'attr:label' | 'attr:placeholder' | 'attr:aria-label';
  text: string;
}

/** Directories in scope. Everything else (src/components, src/lib) is out of this gate. */
export const SCAN_ROOTS = ['src/app', 'src/modules'];

/** Props whose string value is rendered to the user. `className` is pointedly absent. */
const TEXT_PROPS = ['title', 'label', 'placeholder', 'aria-label'] as const;

const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;

/**
 * Blanks out comments while preserving every offset and newline, so reported line
 * numbers still match the original file. Prose inside a comment ("// Kullanıcıya göster")
 * is not shipped text and must not fail the gate.
 */
export function stripComments(source: string): string {
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

/** Tailwind-shaped token: optional variants, then a utility with a dash or bracket part. */
const TAILWIND_TOKEN =
  /^-?(?:[a-z][a-z0-9]*:)*(?:[a-z][a-z0-9]*)(?:[-/][a-z0-9.[\]%()#-]+)+$|^-?(?:[a-z][a-z0-9]*:)+[a-z][a-z0-9]*$/;
/** Bare Tailwind utilities that carry no dash and would otherwise read as an English word. */
const TAILWIND_BARE = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden', 'table', 'contents', 'absolute', 'relative',
  'fixed', 'sticky', 'static', 'isolate', 'container', 'truncate', 'italic', 'underline',
  'uppercase', 'lowercase', 'capitalize', 'antialiased', 'transition', 'transform', 'filter',
  'border', 'rounded', 'shadow', 'ring', 'outline', 'group', 'peer', 'sr-only',
]);

/** A whitespace-separated list where every token is a Tailwind utility. */
function isTailwindClassList(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  let shaped = 0;
  for (const token of tokens) {
    if (TAILWIND_TOKEN.test(token)) {
      shaped++;
      continue;
    }
    if (TAILWIND_BARE.has(token)) continue;
    return false;
  }
  // At least one token must be unmistakably a utility ("items-center"), otherwise a plain
  // English phrase made of Tailwind-shaped words would be swallowed.
  return shaped > 0;
}

/** Identifiers, routes, URLs and other machine strings that never reach a translator. */
export function looksTechnical(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(t)) return true;              // digits / punctuation only
  if (/^(?:https?:|mailto:|tel:|data:|\/|\.\.?\/|#|@|\$|\{)/.test(t)) return true; // url / path / selector
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(t)) return true;         // SCREAMING_CONST
  if (/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(t)) return true;     // slug / kebab / snake / dotted — "save-button"
  if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return true;        // camelCase
  if (/^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(t)) return true; // PascalCase
  if (/^[\w@./-]+(?:\/[\w@./-]+)+$/.test(t)) return true;        // path / mime / package specifier
  if (/^[\d\s.,:/+-]+(?:px|rem|em|vh|vw|%|ms|s)?$/.test(t)) return true; // numbers, dates, sizes
  if (isTailwindClassList(t)) return true;
  return false;
}

/** Prose destined for a human: Turkish letters, or at least two words. */
export function isUserFacing(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (looksTechnical(t)) return false;
  if (TURKISH.test(t)) return true;
  return t.split(/\s+/).filter(w => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(w)).length >= 2;
}

/** JSX text node between two tags: `>Aktif Hibe Çağrısı<`. */
const JSX_TEXT = /> *([^<>{}\n][^<>{}\n]{1,199}?) *</g;

export function scanSource(relPath: string, raw: string): Violation[] {
  const src = stripComments(raw);
  const lineOf = (index: number) => src.slice(0, index).split('\n').length;
  const found: Violation[] = [];

  for (const m of src.matchAll(JSX_TEXT)) {
    const text = m[1];
    if (text === undefined || !isUserFacing(text)) continue;
    found.push({ file: relPath, line: lineOf(m.index), kind: 'jsx-text', text: text.trim() });
  }

  for (const prop of TEXT_PROPS) {
    // `title="..."` / `title='...'` only. `title={t('x')}` is an expression, not a literal,
    // and is therefore never matched — which is exactly the shape we want people to move to.
    const re = new RegExp(`(?:^|[^\\w-])${prop}=(["'])([^"'\\n]{3,200})\\1`, 'g');
    for (const m of src.matchAll(re)) {
      const text = m[2];
      if (text === undefined || !isUserFacing(text)) continue;
      found.push({ file: relPath, line: lineOf(m.index), kind: `attr:${prop}`, text: text.trim() });
    }
  }

  return found.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Every violation under SCAN_ROOTS, keyed by repo-relative POSIX path. */
export function scanHardcoded(cwd = process.cwd()): Violation[] {
  const violations: Violation[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(path.join(cwd, root))) {
      const rel = path.relative(cwd, file).split(path.sep).join('/');
      violations.push(...scanSource(rel, fs.readFileSync(file, 'utf-8')));
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** file → violation count, the shape stored in i18n-baseline.json. */
export function countByFile(violations: Violation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of violations) counts[v.file] = (counts[v.file] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
