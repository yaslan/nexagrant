import { describe, expect, it } from 'vitest';

import { scanSource } from './i18n-hardcoded';

/** Literal texts the detector reports, sorted (same-line hits are ordered by kind, not source). */
function texts(source: string): string[] {
  return scanSource('src/app/fixture.tsx', source).map(v => v.text).sort();
}

describe('i18n-hardcoded: text carried by expressions (NG-70)', () => {
  it('flags a ternary branch written as JSX child', () => {
    const src = `export const X = () => <span>{isTr ? 'Kanıt Taksonomisi' : 'Evidence Taxonomy'}</span>;`;
    expect(texts(src)).toEqual(['Kanıt Taksonomisi', 'Evidence Taxonomy'].sort());
  });

  it('flags ternary branches inside a JSX attribute expression (title)', () => {
    const src = `export const X = () => <button title={isTr ? 'Kaydı kalıcı olarak sil' : 'Permanently delete record'} />;`;
    expect(texts(src)).toEqual(['Kaydı kalıcı olarak sil', 'Permanently delete record'].sort());
  });

  it('flags a ternary branch passed to confirm()', () => {
    const src = `if (!confirm(isTr ? 'Bu belgeyi silmek istediğinize emin misiniz?' : 'Are you sure you want to delete this document?')) return;`;
    expect(texts(src)).toEqual(['Bu belgeyi silmek istediğinize emin misiniz?', 'Are you sure you want to delete this document?'].sort());
  });

  it('flags a plain literal passed to confirm() and alert()', () => {
    const src = `confirm('Bu kayıt silinsin mi?'); alert('Kaydedilemedi, tekrar deneyin');`;
    expect(texts(src)).toEqual(['Bu kayıt silinsin mi?', 'Kaydedilemedi, tekrar deneyin'].sort());
  });

  it('flags toast message arguments, literal and ternary', () => {
    const src = `toast.success(isTr ? 'Kaydedildi' : 'Saved'); toast.error('Bir hata oluştu');`;
    expect(texts(src)).toEqual(['Kaydedildi', 'Saved', 'Bir hata oluştu'].sort());
  });

  it('flags a template literal branch that has no interpolation', () => {
    const src = 'const m = isTr ? `Yükleme hatası oluştu` : `Upload failed`;';
    expect(texts(src)).toEqual(['Yükleme hatası oluştu', 'Upload failed'].sort());
  });
});

describe('i18n-hardcoded: false positives stay out (NG-70)', () => {
  it('ignores Tailwind class ternaries', () => {
    const src = `export const X = () => <div className={isTr ? 'px-2 py-1 text-xs' : 'px-3 text-sm'} />;`;
    expect(texts(src)).toEqual([]);
  });

  it('ignores locale-code ternaries', () => {
    const src = `const loc = isTr ? 'tr-TR' : 'en-US'; const d = new Date().toLocaleDateString(isTr ? 'tr' : 'en');`;
    expect(texts(src)).toEqual([]);
  });

  it('ignores machine-value ternaries (slugs, enum-like tokens)', () => {
    const src = `<input type={isTr ? 'text' : 'email'} variant={x ? 'primary' : 'ghost'} />;`;
    expect(texts(src)).toEqual([]);
  });

  it('ignores prose written inside comments', () => {
    const src = `// confirm(isTr ? 'Bu metin gösterilmez' : 'Not shown')\nconst a = 1;`;
    expect(texts(src)).toEqual([]);
  });
});

describe('i18n-hardcoded: arbitrary-value Tailwind classes stay out (NG-70)', () => {
  it('ignores a button class ternary with arbitrary shadow values', () => {
    const src = `const c = isTr ? 'bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.4)]' : 'bg-cyan-400';`;
    expect(texts(src)).toEqual([]);
  });
});
