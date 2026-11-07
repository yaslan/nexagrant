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

/** Violation kinds with texts, for tests that must pin WHICH pattern caught the literal. */
function hits(source: string, file = 'src/app/fixture.tsx'): string[] {
  return scanSource(file, source).map(v => `${v.kind} ${v.text}`).sort();
}

describe('i18n-hardcoded: setter arguments (NG-91)', () => {
  it('flags a Turkish literal passed to a React state setter', () => {
    const src = `setMessage('Kaydedilemedi, tekrar deneyin');`;
    expect(hits(src)).toEqual(['call:setter Kaydedilemedi, tekrar deneyin']);
  });

  it('flags a two-word English literal passed to any set* call', () => {
    const src = `setError('Something went wrong');`;
    expect(hits(src)).toEqual(['call:setter Something went wrong']);
  });

  it('ignores setters whose literal is a machine value, not prose', () => {
    const src = `setTab('pipeline'); setStatus('ACTIVE'); setWidth('w-full'); setOpen(true);`;
    expect(hits(src)).toEqual([]);
  });
});

describe('i18n-hardcoded: thrown Error messages (NG-91)', () => {
  // A throw in a client module is caught by client code and shown to the user (toast,
  // setMessage). A throw in a server module is a log line; it is never rendered, so it is
  // out of scope. The directive is the only signal that separates the two in a .tsx file.
  it('flags a user-visible Error message in a client module', () => {
    const src = `'use client';\nexport function A() { throw new Error('Yetkiniz yok, yöneticinizle iletişime geçin'); }`;
    expect(hits(src)).toEqual(['throw Yetkiniz yok, yöneticinizle iletişime geçin']);
  });

  it('flags an Error wrapped in Object.assign in a client module', () => {
    const src = `'use client';\nthrow Object.assign(new Error('Davet gönderilemedi'), { code: 'X' });`;
    expect(hits(src)).toEqual(['throw Davet gönderilemedi']);
  });

  it('does not flag a server-side throw — that message is a log line, not UI text', () => {
    const src = `export async function load() { throw new Error('Kullanıcı kaydı bulunamadı'); }`;
    expect(hits(src)).toEqual([]);
  });

  it('does not flag a client throw whose message is a machine code', () => {
    const src = `'use client';\nthrow new Error('ERR_INVITE_EXPIRED');`;
    expect(hits(src)).toEqual([]);
  });
});

describe('i18n-hardcoded: toast.promise messages (NG-91)', () => {
  it('flags loading, success and error strings of toast.promise', () => {
    const src = `toast.promise(save(), { loading: 'Kaydediliyor…', success: 'Kaydedildi', error: 'Kaydedilemedi' });`;
    expect(hits(src)).toEqual([
      'call:toast.promise Kaydedildi',
      'call:toast.promise Kaydedilemedi',
      'call:toast.promise Kaydediliyor…',
    ]);
  });

  it('flags the string a success callback returns', () => {
    const src = `toast.promise(p, { loading: 'Yükleniyor', success: () => 'Kayıt eklendi' });`;
    expect(hits(src)).toEqual(['call:toast.promise Kayıt eklendi', 'call:toast.promise Yükleniyor']);
  });

  it('ignores a toast.promise whose messages are t() calls', () => {
    const src = `toast.promise(p, { loading: t('saving'), success: t('saved'), error: t('failed') });`;
    expect(hits(src)).toEqual([]);
  });
});

describe('i18n-hardcoded: literal inside a JSX expression (NG-91)', () => {
  it('flags {"…"} as a JSX child', () => {
    expect(hits(`<span>{'Kanıt Kategorisi Seçin'}</span>`)).toEqual(['jsx-literal Kanıt Kategorisi Seçin']);
  });

  it('flags a literal option child — <option>{"…"}</option>', () => {
    expect(hits(`<select><option>{'Kanıt Kategorisi Seçin'}</option></select>`)).toEqual([
      'jsx-literal Kanıt Kategorisi Seçin',
    ]);
  });

  it('flags a literal passed through a text-carrying attribute expression', () => {
    expect(hits(`<input placeholder={'Belge adı ara'} />`)).toEqual(['attr:placeholder Belge adı ara']);
  });

  it('ignores a single ASCII word in an attribute expression, like the string form', () => {
    expect(hits(`<input placeholder={'Search'} />`)).toEqual([]);
  });

  it('ignores a non-prose literal child such as a unit or a machine value', () => {
    expect(hits(`<span>{'px'}</span><option value={'tr-TR'}>{'tr-TR'}</option>`)).toEqual([]);
  });

  it('ignores t() calls in expressions — the shape we want', () => {
    expect(hits(`<option>{t('kategori.sec')}</option><input placeholder={t('belge.ara')} />`)).toEqual([]);
  });
});

describe('i18n-hardcoded: NG-91 crw-gnd review fixes', () => {
  // Bulgu 1 — throw: an English developer invariant in a client module is not UI text.
  it('does not flag an English invariant thrown in a client module', () => {
    const src = `'use client';\nthrow new Error('Missing query client context');`;
    expect(hits(src)).toEqual([]);
  });

  it('still flags a Turkish user-facing message thrown in a client module', () => {
    const src = `'use client';\nthrow new Error('Oturum süresi doldu, yeniden giriş yapın');`;
    expect(hits(src)).toEqual(['throw Oturum süresi doldu, yeniden giriş yapın']);
  });

  // Bulgu 2 — toast.promise: quoted property keys are the same key as bare ones.
  it('flags toast.promise messages under quoted keys', () => {
    const src = `toast.promise(save(), { 'loading': 'Kaydediliyor…', "success": 'Kaydedildi' });`;
    expect(hits(src)).toEqual(['call:toast.promise Kaydedildi', 'call:toast.promise Kaydediliyor…']);
  });

  // Bulgu 3 — setter: a lone PascalCase token is a machine value, not prose.
  it('ignores a setter whose literal is a single PascalCase machine value', () => {
    const src = `setStatus('Active');`;
    expect(hits(src)).toEqual([]);
  });

  it('still flags a Turkish single-word setter literal', () => {
    const src = `setMessage('Başarısız');`;
    expect(hits(src)).toEqual(['call:setter Başarısız']);
  });
});
