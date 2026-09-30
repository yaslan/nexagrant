/**
 * Source scanner behind the 5xx body guard (TASK-MUNY0O53ITDU4, İNCELEME-75 D-1).
 *
 * The first guard was a blacklist: it looked for `.message`, `String(err)` or
 * `errorMessage(` inside a response call whose status was a literal 5xx. Every
 * other way of writing the same leak slipped past it (`.stack`, `${err}`,
 * `JSON.stringify(err)`, a body built on the line above, `{ status }` from a
 * variable) — and the GDPR routes leaked through exactly that last one.
 *
 * The rule is now positive. A response call may only be built directly when its
 * status is provably below 500: absent, a numeric literal, or a ternary of
 * numeric literals. Anything that is or might be a 5xx must go through
 * `internalError()` (src/lib/api-error.ts), whose body is a fixed code. What
 * the body contains no longer matters, so there is no pattern left to miss.
 */

const RESPONSE_CALL = /\b(?:NextResponse\.json|Response\.json|new\s+NextResponse|new\s+Response)\s*\(/g;

/**
 * `src` with the contents of strings and comments blanked to spaces, so brackets
 * and commas inside them cannot be mistaken for code. Template literals keep
 * their `${…}` expressions, which are code. Offsets and line breaks are kept.
 */
export function maskSource(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // Stack of open template literals; each entry is the brace depth of the `${`
  // that interrupted it (-1 while inside the literal text itself).
  const templates: number[] = [];
  let braces = 0;
  let i = 0;
  const scanTemplateText = () => {
    const start = i;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { blank(start, i); i++; templates.pop(); return; }
      if (c === '$' && src[i + 1] === '{') {
        blank(start, i);
        i += 2;
        templates[templates.length - 1] = braces;
        braces++;
        return;
      }
      i++;
    }
    blank(start, i);
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      const start = ++i;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      blank(start, i);
      i++;
    } else if (c === '`') {
      i++;
      templates.push(-1);
      scanTemplateText();
    } else if (c === '{') {
      braces++;
      i++;
    } else if (c === '}') {
      braces--;
      i++;
      if (templates.length && templates[templates.length - 1] === braces) {
        templates[templates.length - 1] = -1;
        scanTemplateText();
      }
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Splits `text` on commas that are not nested inside brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * The statuses an identifier is typed as, when the file declares it with a
 * union of numeric literals — as a function parameter
 * (`function refuse(error: E, status: 400 | 413)`) or a typed `const`/`let`.
 * TypeScript then holds every caller to those values. An object property such
 * as `{ status: 400, headers }` is not a declaration and does not count.
 */
function annotatedStatuses(name: string, masked: string): number[] | null {
  const union = String.raw`(\d{3}(?:\s*\|\s*\d{3})*)`;
  const typed = new RegExp(String.raw`^\s*${name}\s*:\s*${union}\s*(?:=[\s\S]*)?$`);
  const params = /\bfunction\b[^(]*\(([^)]*)\)|\(([^()]*)\)\s*(?::[^=;{]*)?=>/g;
  for (const m of masked.matchAll(params)) {
    for (const param of splitTopLevel(m[1] ?? m[2] ?? '')) {
      const t = typed.exec(param);
      if (t) return t[1]!.split('|').map((n) => Number(n.trim()));
    }
  }
  const decl = new RegExp(String.raw`\b(?:const|let)\s+${name}\s*:\s*${union}\s*=`).exec(masked);
  return decl ? decl[1]!.split('|').map((n) => Number(n.trim())) : null;
}

/**
 * The statuses an expression can take, or `null` when that cannot be read off
 * the source: a numeric literal, an identifier typed as a union of them, or a
 * (nested) ternary whose branches are one of those.
 */
function literalStatuses(expr: string, masked: string): number[] | null {
  const e = expr.trim().replace(/^\((.*)\)$/s, '$1').trim();
  if (/^\d{3}$/.test(e)) return [Number(e)];
  if (/^[A-Za-z_$][\w$]*$/.test(e)) return annotatedStatuses(e, masked);
  // Condition ? a : b — split on the first top-level `?` and its matching `:`.
  let depth = 0;
  let q = -1;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === '?' && e[i + 1] !== '?' && e[i + 1] !== '.' && e[i - 1] !== '?') {
      q = i;
      break;
    }
  }
  if (q === -1) return null;
  let nested = 0;
  depth = 0;
  for (let i = q + 1; i < e.length; i++) {
    const c = e[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === '?' && e[i + 1] !== '?' && e[i + 1] !== '.' && e[i - 1] !== '?') nested++;
    else if (depth === 0 && c === ':') {
      if (nested > 0) { nested--; continue; }
      const a = literalStatuses(e.slice(q + 1, i), masked);
      const b = literalStatuses(e.slice(i + 1), masked);
      return a && b ? [...a, ...b] : null;
    }
  }
  return null;
}

/**
 * The statuses a response init argument can produce, or `null` when unknown.
 * No init, or an object literal without `status`, means 200.
 */
function initStatuses(init: string | undefined, masked: string): number[] | null {
  if (init === undefined) return [200];
  const body = init.trim();
  if (!body.startsWith('{') || !body.endsWith('}')) return null;
  const props = splitTopLevel(body.slice(1, -1));
  let statuses: number[] = [200];
  for (const prop of props) {
    if (prop.startsWith('...')) return null; // `{ ...init }` could carry any status
    const m = /^status\s*(?::([\s\S]*))?$/.exec(prop);
    if (!m) continue;
    const s = literalStatuses(m[1] ?? 'status', masked); // `{ status }` is `status: status`
    if (!s) return null;
    statuses = s;
  }
  return statuses;
}

export interface ResponseCall {
  line: number;
  /** Statuses the call can return, or `null` when the source does not say. */
  statuses: number[] | null;
}

export function responseCalls(src: string): ResponseCall[] {
  const masked = maskSource(src);
  const calls: ResponseCall[] = [];
  for (const m of masked.matchAll(RESPONSE_CALL)) {
    const open = m.index! + m[0].length;
    let depth = 1;
    let i = open;
    while (i < masked.length && depth > 0) {
      const c = masked[i++];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
    }
    const args = splitTopLevel(masked.slice(open, i - 1));
    calls.push({ line: masked.slice(0, m.index).split('\n').length, statuses: initStatuses(args[1], masked) });
  }
  return calls;
}

/** Lines of response calls that are, or might be, a 5xx built outside `internalError()`. */
export function unguardedServerErrors(src: string): number[] {
  return responseCalls(src)
    .filter(({ statuses }) => statuses === null || statuses.some((s) => s >= 500))
    .map(({ line }) => line);
}

/**
 * Functions that turn a caught value into a fixed code, so passing the caught
 * value to them does not carry its text anywhere. Reading `caught.code`
 * directly counts the same as `errorCode(caught)`.
 */
const SANITISERS = ['errorCode', 'failureCode', 'mailFailureCode'];

function blockEnd(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}' && --depth === 0) return i;
  }
  return masked.length;
}

/** Whether `expr` uses one of `names` other than through a sanitiser or `instanceof`. */
function usesTainted(expr: string, names: Set<string>): boolean {
  for (const name of names) {
    const cleaned = expr
      .replace(new RegExp(String.raw`\b(?:${SANITISERS.join('|')})\(\s*${name}\b`, 'g'), '(')
      .replace(new RegExp(String.raw`\b${name}\s+instanceof\b`, 'g'), '')
      .replace(new RegExp(String.raw`(?<![.\w$])${name}\.code\b`, 'g'), '');
    // `{ error: 'x' }` names a property, it does not read the variable.
    const key = new RegExp(String.raw`[{,]\s*${name}\s*:(?!:)`, 'g');
    if (new RegExp(String.raw`(?<![.\w$])${name}\b`).test(cleaned.replace(key, ','))) return true;
  }
  return false;
}

/**
 * Lines where a server action hands a caught value back to its caller
 * (İNCELEME-75 Y-1/D-1(d)). A server action is its own HTTP entry point: what
 * it returns is serialised to the browser. The GDPR actions returned
 * `error instanceof Error ? error.message : …` through a local `message`, and
 * the routes passed it on — so a name derived from the caught value counts as
 * the caught value.
 */
export function catchReturnLeaks(src: string): number[] {
  const masked = maskSource(src);
  const lines: number[] = [];
  for (const m of masked.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    const block = masked.slice(open, blockEnd(masked, open) + 1);
    const tainted = new Set([m[1]!]);
    for (const d of block.matchAll(/\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=([^;]*);/g)) {
      if (!usesTainted(d[2]!, tainted)) continue;
      for (const n of d[1]!.match(/[A-Za-z_$][\w$]*/g) ?? []) tainted.add(n);
    }
    for (const r of block.matchAll(/\breturn\b([^;]*);/g)) {
      if (usesTainted(r[1]!, tainted)) lines.push(masked.slice(0, open + r.index!).split('\n').length);
    }
  }
  return lines;
}
