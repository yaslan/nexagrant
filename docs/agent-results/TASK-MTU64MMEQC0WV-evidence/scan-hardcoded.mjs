import fs from 'fs';
import path from 'path';

const SRC = path.join(process.cwd(), 'src');
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}
// blank out comments, keeping offsets
function strip(src) {
  let out = '', i = 0;
  const blank = t => t.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { const e = src.indexOf('\n', i); const s = e === -1 ? src.length : e; out += blank(src.slice(i, s)); i = s; }
    else if (two === '/*') { const e = src.indexOf('*/', i + 2); const s = e === -1 ? src.length : e + 2; out += blank(src.slice(i, s)); i = s; }
    else { out += src[i]; i++; }
  }
  return out;
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// Words that mark a literal as human prose rather than a token/class/id
const looksHuman = s => {
  const t = s.trim();
  if (t.length < 3) return false;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(t)) return false;
  if (/^[a-z0-9_-]+$/.test(t)) return false;              // slug / token
  if (/^[A-Z0-9_]+$/.test(t)) return false;               // CONST
  if (/^[\w-]+(\/[\w-]+)+$/.test(t)) return false;        // path/mime
  if (/^(https?:|\/|#|\.|@|\$)/.test(t)) return false;    // url/path/selector
  if (/^[a-z]+([A-Z][a-z]*)+$/.test(t)) return false;     // camelCase
  if (/^(flex|grid|text|bg|border|rounded|px|py|mt|mb|w-|h-|gap|items|justify|min|max|space|overflow|font|hover|focus|dark|sm:|md:|lg:)/.test(t)) return false;
  if (/\b(?:px|rem|em|vh|vw)\b/.test(t) && !/ [a-z]{3,} [a-z]{3,}/.test(t)) return false;
  return /[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(t);
};

const TEXT_ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'label', 'confirmLabel', 'cancelLabel', 'emptyMessage', 'helpText', 'description'];

const findings = [];
for (const file of walk(SRC)) {
  const raw = fs.readFileSync(file, 'utf-8');
  const src = strip(raw);
  const rel = path.relative(process.cwd(), file);
  const translated = /useTranslations|getTranslations/.test(raw);

  // 1) JSX text nodes:  >Some text<
  for (const m of src.matchAll(/>([^<>{}\n]{3,120})</g)) {
    const txt = m[1];
    if (!looksHuman(txt)) continue;
    findings.push({ file: rel, line: lineOf(src, m.index), kind: 'jsx-text', text: txt.trim(), translated });
  }
  // 2) text attributes with string literal
  for (const a of TEXT_ATTRS) {
    for (const m of src.matchAll(new RegExp(`\\b${a}=(["'])([^"'\\n]{3,120})\\1`, 'g'))) {
      if (!looksHuman(m[2])) continue;
      findings.push({ file: rel, line: lineOf(src, m.index), kind: `attr:${a}`, text: m[2].trim(), translated });
    }
  }
  // 3) toast/alert/confirm with a literal
  for (const m of src.matchAll(/\b(?:toast(?:\.\w+)?|alert|confirm|window\.confirm|window\.alert)\(\s*(["'`])([^"'`\n]{3,160})\1/g)) {
    if (!looksHuman(m[2])) continue;
    findings.push({ file: rel, line: lineOf(src, m.index), kind: 'toast/alert', text: m[2].trim(), translated });
  }
}
fs.writeFileSync(process.argv[2] || '/dev/stdout', JSON.stringify(findings, null, 2));
console.error(`files scanned, findings: ${findings.length}`);
