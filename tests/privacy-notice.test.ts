import { describe, expect, test } from 'vitest';

import en from '../messages/en.json';
import tr from '../messages/tr.json';
import {
  PRIVACY_DEMO_VALUES,
  PRIVACY_LISTS,
  PRIVACY_PLACEHOLDERS,
  PRIVACY_TABLES,
} from '../src/app/[locale]/(public)/privacy/structure';

/**
 * FO-170 — the site-wide KVKK notice (/privacy), built from the owner's template
 * and cut down to what the code actually does.
 */

type Tree = { [key: string]: string | Tree };
const CATALOGS = { tr: tr.legal.privacy as Tree, en: en.legal.privacy as Tree } as const;

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const FLAT = { tr: flatten(CATALOGS.tr), en: flatten(CATALOGS.en) };

describe('privacy notice copy (FO-170)', () => {
  test('tr and en carry the same keys', () => {
    expect(Object.keys(FLAT.en).sort()).toEqual(Object.keys(FLAT.tr).sort());
  });

  test('every row, cell, column and list item the page reads exists in both languages', () => {
    const needed: string[] = [];
    for (const [section, table] of Object.entries(PRIVACY_TABLES)) {
      for (const column of table.columns) needed.push(`${section}.${column}`);
      for (const row of table.rows) for (const cell of table.cells) needed.push(`${section}.rows.${row}.${cell}`);
    }
    const listPrefix = { s4: 's4.items', s5domestic: 's5.domestic', s8rights: 's8.rights', s8channels: 's8.channels', s9consents: 's9.consents' };
    for (const [list, ids] of Object.entries(PRIVACY_LISTS)) {
      for (const id of ids) needed.push(`${listPrefix[list as keyof typeof listPrefix]}.${id}`);
    }
    for (const lang of ['tr', 'en'] as const) {
      const missing = needed.filter((key) => !(key in FLAT[lang]));
      expect(missing, `${lang} is missing`).toEqual([]);
    }
  });

  test('nine numbered sections, in template order', () => {
    for (const lang of ['tr', 'en'] as const) {
      const headings = Array.from({ length: 9 }, (_, i) => FLAT[lang][`s${i + 1}.heading`]);
      headings.forEach((heading, i) => expect(heading, `${lang} s${i + 1}`).toMatch(new RegExp(`^${i + 1}\\. `)));
    }
  });

  test('the placeholder list is exactly the bracketed text left in the copy', () => {
    // The publish gate (FO-140) reads PRIVACY_PLACEHOLDERS; a placeholder that is
    // in the text but not in the list would ship unnoticed, and a listed one
    // that was filled in would block a release for nothing.
    for (const lang of ['tr', 'en'] as const) {
      const found = Object.entries(FLAT[lang]).flatMap(([key, value]) =>
        (value.match(/\[[^\]]+\]/g) ?? []).map((text) => ({ key, text })),
      );
      const listed = PRIVACY_PLACEHOLDERS.map((p) => ({ key: p.key, text: p[lang] }));
      expect(found).toEqual(expect.arrayContaining(listed));
      expect(listed).toEqual(expect.arrayContaining(found));
    }
  });

  test('tax office, MERSIS, VERBIS and effective date are still placeholders', () => {
    expect(PRIVACY_PLACEHOLDERS.map((p) => p.key).sort()).toEqual(
      ['s1.rows.mersis.value', 's1.rows.taxId.value', 's1.rows.verbis.value', 's9.effective'].sort(),
    );
  });

  test('controller identity matches the expert notice (FO-149 v3)', () => {
    expect(FLAT.tr['s1.rows.controller.value']).toContain('Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.');
    expect(FLAT.en['s1.rows.controller.value']).toContain('Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.');
    expect(FLAT.tr['s1.rows.address.value']).toBe('Kadıköy Mahallesi No:55, İlkadım / SAMSUN');
    expect(FLAT.en['s1.rows.address.value']).toBe('Kadıköy Mahallesi No:55, İlkadım / SAMSUN, Türkiye');
    for (const { key, value } of PRIVACY_DEMO_VALUES) {
      expect(FLAT.tr[key]).toBe(value);
      expect(FLAT.en[key]).toBe(value);
    }
  });

  test.each([
    ['LinkedIn sign-in', /linkedin (ile giriş|ile oturum|or google|veya google)|sign in with linkedin|linkedin.{0,20}(giriş|sign)/i],
    ['WhatsApp', /whatsapp/i],
    ['SMS', /\bsms\b/i],
    ['retargeting / advertising cookies', /yeniden hedefleme|retarget|re-target/i],
    ['commercial electronic messages', /ticari elektronik ileti|commercial electronic message|6563/i],
    ['newsletter', /bülten|newsletter/i],
    ['the template\'s internal lawyer note', /genel bir şablondur|avukat/i],
  ])('no claim the code does not back: %s', (_label, pattern) => {
    for (const lang of ['tr', 'en'] as const) {
      const hits = Object.entries(FLAT[lang]).filter(([, value]) => pattern.test(value));
      expect(hits, `${lang}`).toEqual([]);
    }
  });

  test('the cookie table lists only the two kinds the banner has', () => {
    expect(PRIVACY_TABLES.s7.rows).toEqual(['essential', 'analytics']);
  });
});
