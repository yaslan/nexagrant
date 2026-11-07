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
 * ASCII word in a prop (title="Save") is deliberately NOT a violation: at one word the
 * signal is too weak to separate prose from an identifier, and a gate that cries wolf
 * gets disabled. JSX text is the exception: there a capitalised word ("Kaydet", "Vazgec")
 * is a button label, not an identifier, so it counts. This detector is a floor, not a
 * census.
 *
 * JSX text is read from the TypeScript AST, not a line regex. The regex refused a newline
 * inside the match, so a label on its own line — the normal Prettier shape — was never
 * counted: dev's Part B editor scored 16 while carrying ~55 literals (FO-95).
 *
 * ── What is excluded ──────────────────────────────────────────────────────────────────
 * Technical strings are not prose: Tailwind class lists, routes and file paths, URLs,
 * test ids, import specifiers, mime types, identifiers (camelCase / PascalCase / kebab /
 * snake / CONST), dates, numbers with units. `className` and `data-testid` are not in the
 * prop list at all, so they cannot be reported even before those filters run.
 */
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

export interface Violation {
  /** Repo-relative, POSIX separators — the key shape used in i18n-baseline.json. */
  file: string;
  line: number;
  kind:
    | 'jsx-text'
    | 'jsx-literal'
    | 'attr:title' | 'attr:label' | 'attr:placeholder' | 'attr:aria-label'
    | 'ternary' | 'call:confirm' | 'call:alert' | 'call:toast'
    | 'call:setter' | 'call:toast.promise' | 'throw';
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
  /^-?(?:[a-z][a-z0-9]*:)*(?:[a-z][a-z0-9]*)(?:[-/][a-z0-9.[\]%()#,_-]+)+$|^-?(?:[a-z][a-z0-9]*:)+[a-z][a-z0-9]*$/;
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
  if (/^[a-z]{2,3}[-_][A-Za-z]{2,4}$/.test(t)) return true;      // locale code — "tr-TR", "en_US"
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

const SINGLE_LABEL = /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}$/;

/** JSX text adds one shape to isUserFacing: a lone capitalised word, i.e. a label. */
export function isJsxProse(text: string): boolean {
  if (isUserFacing(text)) return true;
  const words = text.trim().split(/\s+/).filter(w => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(w));
  if (words.length !== 1) return false;
  // "Sayfa (" and "Kelime)" sit next to an expression; the brackets are not the word.
  const word = words[0]!.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]+|[^A-Za-zÇĞİÖŞÜçğıöşü]+$/g, '');
  return SINGLE_LABEL.test(word);
}

/** Every JSX text node, whitespace collapsed the way React renders it. */
function jsxTextNodes(raw: string): { line: number; text: string }[] {
  const sf = ts.createSourceFile('scan.tsx', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && !node.containsOnlyTriviaWhiteSpaces) {
      // getStart already skips the leading newline and indentation of a JSX text node.
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      out.push({ line, text: node.text.replace(/\s+/g, ' ').trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Peels parentheses and type assertions so `(isTr ? 'a' : 'b')` reads as the ternary. */
function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

/**
 * The static text of a string-ish expression: a plain literal, a template without
 * interpolation, or the leading text of a template with holes. Anything else is `undefined`
 * (an identifier, a `t('key')` call, a member access): those are not literals to report.
 */
function staticText(node: ts.Expression): string | undefined {
  const e = unwrapExpression(node);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) return e.head.text;
  return undefined;
}

/** `confirm(...)`, `alert(...)`, `toast(...)`, `toast.success(...)`: the message is the argument. */
const PROSE_CALLEE = /^(?:window\.)?(confirm|alert)$|^(?:toast|showToast)(?:\.[A-Za-z]+)?$/;

/** React state setters — `setMessage('…')`, `setError('…')`. Machine values are filtered by isJsxProse. */
const SETTER_CALLEE = /^set[A-Z]\w*$/;

/** The three message slots of `toast.promise(promise, { loading, success, error })`. */
const TOAST_PROMISE_SLOTS = new Set(['loading', 'success', 'error']);

/** A file whose first statement is the `'use client'` directive — its code runs in the browser. */
function isClientModule(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return first !== undefined && ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) && first.expression.text === 'use client';
}

/**
 * The Error message of a `throw` argument: `new Error('…')` or `Object.assign(new Error('…'), …)`.
 * Returns undefined for anything else (a variable, a call, a non-Error value).
 */
function thrownMessage(node: ts.Expression): ts.Expression | undefined {
  const e = unwrapExpression(node);
  if (ts.isCallExpression(e) && e.expression.getText() === 'Object.assign' && e.arguments[0]) {
    return thrownMessage(e.arguments[0]);
  }
  if (ts.isNewExpression(e) && /Error$/.test(e.expression.getText()) && e.arguments?.[0]) {
    return e.arguments[0];
  }
  return undefined;
}

/**
 * Prose reached through an EXPRESSION, which the JSX-text and attribute-literal passes never
 * see: a ternary branch (`{isTr ? 'Sil' : 'Delete'}`, `title={isTr ? ...}`, `confirm(isTr ? ...)`)
 * or a literal handed to confirm / alert / toast. Each reported text goes through the same
 * prose test as JSX text, so `'tr-TR' : 'en-US'`, Tailwind class ternaries and slug-valued
 * ternaries stay out.
 */
function expressionProse(raw: string): { line: number; text: string; kind: Violation['kind'] }[] {
  const sf = ts.createSourceFile('scan.tsx', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { line: number; text: string; kind: Violation['kind'] }[] = [];
  const report = (
    node: ts.Node,
    text: string | undefined,
    kind: Violation['kind'],
    isProse: (t: string) => boolean = isJsxProse,
  ) => {
    if (text === undefined || !isProse(text.replace(/\s+/g, ' ').trim())) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push({ line, text: text.replace(/\s+/g, ' ').trim(), kind });
  };
  const client = isClientModule(sf);
  const visit = (node: ts.Node) => {
    if (ts.isConditionalExpression(node)) {
      report(node.whenTrue, staticText(node.whenTrue), 'ternary');
      report(node.whenFalse, staticText(node.whenFalse), 'ternary');
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const match = PROSE_CALLEE.exec(callee);
      if (match) {
        const kind: Violation['kind'] =
          match[1] === 'confirm' ? 'call:confirm' : match[1] === 'alert' ? 'call:alert' : 'call:toast';
        for (const arg of node.arguments) report(arg, staticText(arg), kind);
      }
      if (ts.isIdentifier(node.expression) && SETTER_CALLEE.test(callee) && node.arguments[0]) {
        // A setter argument is never a lone label, so the single-capitalised-word rule does not apply.
        report(node.arguments[0], staticText(node.arguments[0]), 'call:setter', isUserFacing);
      }
      if (callee === 'toast.promise' && node.arguments[1]) {
        const options = unwrapExpression(node.arguments[1]);
        if (ts.isObjectLiteralExpression(options)) {
          for (const prop of options.properties) {
            // `loading:` and `'loading':` are the same key; read the name's value, not its source text.
            if (!ts.isPropertyAssignment(prop)) continue;
            const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
            if (key === undefined || !TOAST_PROMISE_SLOTS.has(key)) continue;
            // `success: () => '…'` — the message is what the callback returns.
            const value = unwrapExpression(prop.initializer);
            const message = ts.isArrowFunction(value) && !ts.isBlock(value.body) ? value.body : value;
            report(prop, staticText(message), 'call:toast.promise');
          }
        }
      }
    } else if (ts.isThrowStatement(node) && node.expression && client) {
      const message = thrownMessage(node.expression);
      // Narrowed (NG-91 review): only Turkish text counts as a user-facing throw. An English
      // invariant ("Missing query client context") is a developer message, not UI text.
      // Known limit: an English message the user does see is not caught here.
      if (message) report(message, staticText(message), 'throw', t => TURKISH.test(t) && isUserFacing(t));
    } else if (ts.isJsxExpression(node) && node.expression) {
      const literal = staticText(node.expression);
      const parent = node.parent;
      if (ts.isJsxAttribute(parent)) {
        // `placeholder={'…'}` — the same props the string form checks, with the same prose test.
        const prop = parent.name.getText(sf);
        if (TEXT_PROPS.includes(prop as (typeof TEXT_PROPS)[number]) && literal !== undefined && isUserFacing(literal)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          out.push({ line, text: literal.trim(), kind: `attr:${prop}` as Violation['kind'] });
        }
      } else if (literal !== undefined && isJsxProse(literal.replace(/\s+/g, ' ').trim())) {
        // `<option>{'…'}</option>`, `<span>{'…'}</span>` — a literal child is JSX text in disguise.
        report(node, literal, 'jsx-literal');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function scanSource(relPath: string, raw: string): Violation[] {
  const src = stripComments(raw);
  const lineOf = (index: number) => src.slice(0, index).split('\n').length;
  const found: Violation[] = [];

  for (const { line, text } of jsxTextNodes(raw)) {
    if (!isJsxProse(text)) continue;
    found.push({ file: relPath, line, kind: 'jsx-text', text });
  }

  for (const { line, text, kind } of expressionProse(raw)) {
    found.push({ file: relPath, line, kind, text });
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
