import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { isUserFacing, looksTechnical, scanSource } from '../scripts/i18n-hardcoded';

/**
 * These cases pin the shape of the i18n gate's check 4. Loosening the detector to make a
 * red gate green is the exact move that let TASK-MTU6I7SO2BD28 stay false-closed
 * (TASK-MTU64MMEQC0WV §B-01), so the boundary lives in a test rather than in a comment.
 */
describe('hard-coded text detector — what counts', () => {
  it('reports a Turkish JSX text node', () => {
    const found = scanSource('a.tsx', '<span>Aktif Hibe Çağrısı</span>');
    expect(found.map(v => v.text)).toEqual(['Aktif Hibe Çağrısı']);
  });

  it('reports a two-word English JSX text node', () => {
    expect(scanSource('a.tsx', '<h2>Consortium Builder</h2>')).toHaveLength(1);
  });

  it('reports the four text-carrying props and no others', () => {
    const src = `<input
      placeholder="Fırsat, not veya kişi ara..."
      title="Sorumlu kullanıcıyı değiştir"
      aria-label="Ana menüyü aç"
      label="Ortak Kurum Adı"
      className="flex items-center rounded-md"
      data-testid="save-button"
      alt="Kurum logosu"
    />`;
    expect(scanSource('a.tsx', src).map(v => v.kind).sort()).toEqual([
      'attr:aria-label',
      'attr:label',
      'attr:placeholder',
      'attr:title',
    ]);
  });

  it('sees a file that never calls t() — the blindness B-01 described', () => {
    const src = `export function Panel() {
      return (<div className="flex items-center">
        <h2>Yeni Kiracı Paneli</h2>
        <p>Bu sayfa hiçbir çeviri kancası kullanmıyor.</p>
      </div>);
    }`;
    expect(scanSource('panel.tsx', src)).toHaveLength(2);
  });

  it('ignores prose inside comments but keeps line numbers of real text', () => {
    const src = ['// <span>Yorumdaki Türkçe metin</span>', '<span>Gerçek Türkçe metin</span>'].join('\n');
    const found = scanSource('a.tsx', src);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
  });

  it('ignores an expression prop — `title={t("x")}` is the shape we want', () => {
    expect(scanSource('a.tsx', '<button title={t("pipeline.expandAll")}>{t("save")}</button>')).toHaveLength(0);
  });
});

describe('hard-coded text detector — multi-line JSX text (FO-95)', () => {
  // The old line regex refused a newline inside the match, so a label written on its own
  // line — the normal Prettier shape for a button — was never counted. Dev's Part B editor
  // scored 16 while carrying "Kaydet", "Senkronize" and "Vazgeç" in exactly that shape.
  it('reports a Turkish label that sits on its own line', () => {
    const src = ['<button', '  onClick={close}', '>', '  Vazgeç', '</button>'].join('\n');
    const found = scanSource('a.tsx', src);
    expect(found.map(v => [v.kind, v.text, v.line])).toEqual([['jsx-text', 'Vazgeç', 4]]);
  });

  it('points at the label line even under deep indentation', () => {
    const indent = ' '.repeat(16);
    const src = ['<div>', `${indent}<button>`, `${indent}  Vazgeç`, `${indent}</button>`, '</div>'].join('\n');
    expect(scanSource('a.tsx', src).map(v => v.line)).toEqual([3]);
  });

  it('reports an ASCII-spelled label on its own line — "Vazgec" has no Turkish letter to give it away', () => {
    const src = ['<button type="button">', '  Vazgec', '</button>'].join('\n');
    expect(scanSource('a.tsx', src).map(v => v.text)).toEqual(['Vazgec']);
  });

  it('reports a sentence wrapped over several lines once, with its whitespace collapsed', () => {
    const src = ['<p className="text-sm">', '  Bu metin iki', '  satıra bölünmüş', '</p>'].join('\n');
    const found = scanSource('a.tsx', src);
    expect(found.map(v => [v.text, v.line])).toEqual([['Bu metin iki satıra bölünmüş', 2]]);
  });

  it('reports text that shares its node with an expression', () => {
    const src = '<span>~{pages} Sayfa ({words} Kelime)</span>';
    expect(scanSource('a.tsx', src).map(v => v.text)).toEqual(['Sayfa (', 'Kelime)']);
  });

  it('reports a single capitalised word in JSX text', () => {
    expect(scanSource('a.tsx', '<button>Save</button>').map(v => v.text)).toEqual(['Save']);
  });

  it('does not read TypeScript comparisons as JSX text', () => {
    const src = 'function f(cents: bigint, limit: bigint) {\n  if (cents > limit || cents < -limit) return null;\n  return <b>{String(cents)}</b>;\n}';
    expect(scanSource('a.tsx', src)).toHaveLength(0);
  });
});

describe('hard-coded text detector — what does not count', () => {
  it.each([
    'flex items-center',
    'mt-2 grid grid-cols-3 gap-4 text-sm font-medium',
    'save-button',
    'cancel-button',
    '/tr/admin/settings',
    'https://example.com/a/b',
    '@/lib/routes',
    'next/navigation',
    'application/json',
    'conceptNoteEditor',
    'PartBCollaborativeEditor',
    'SCREAMING_CONST',
    '2021-2027',
    '16 px',
  ])('treats %j as technical', text => {
    expect(looksTechnical(text)).toBe(true);
    expect(isUserFacing(text)).toBe(false);
  });

  it('does not report a single ASCII word in a prop — too weak a signal to block on', () => {
    expect(isUserFacing('Save')).toBe(false);
    expect(scanSource('a.tsx', '<button title="Save" />')).toHaveLength(0);
  });

  it('does not report a lowercase single word in JSX text — units and code samples', () => {
    expect(scanSource('a.tsx', '<span>px</span><code>pnpm</code><span>{n} kB</span>')).toHaveLength(0);
  });

  it('still reports a single Turkish word', () => {
    expect(isUserFacing('İşlemler')).toBe(true);
  });
});

describe('i18n-baseline.json', () => {
  const raw = fs.readFileSync(path.join(process.cwd(), 'i18n-baseline.json'), 'utf-8');
  const baseline = JSON.parse(raw) as Record<string, number>;

  it('maps repo-relative paths to positive integers', () => {
    for (const [file, count] of Object.entries(baseline)) {
      expect(file.startsWith('src/app/') || file.startsWith('src/modules/')).toBe(true);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it('only lists files that still exist — a stale entry is a hole in the ratchet', () => {
    for (const file of Object.keys(baseline)) {
      expect(fs.existsSync(path.join(process.cwd(), file)), `${file} is gone`).toBe(true);
    }
  });
});
