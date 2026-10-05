import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

import { PRODUCT_NAME, withBrand } from '@/lib/brand';
import { generatePdfHtml, templateBodyText } from '@/lib/document-exporter';

/**
 * TASK-MTSWM36QWC36Z — the retired product name stays retired, and the live one is read
 * from one place.
 *
 * The platform shipped as "FonBridge", was renamed to "Fabrika" in 2026-Q1, and returned to
 * "FonBridge" on 2026-09-10. The rename history showed that a brand name copied as a literal
 * into 32 source files — including the footer of every document a customer downloads — means a
 * single missed site keeps printing a dead brand onto a customer's paperwork. So the name is a
 * value read from `src/lib/brand.ts` and interpolated into `{brand}` in the catalogues, never
 * re-typed at the call site.
 *
 * Two things are therefore pinned here: no live source file names the retired brand, and the
 * generated document follows `PRODUCT_NAME` rather than a string that merely happens to match
 * it today.
 */

const ROOT = resolve(__dirname, '..');
const RETIRED = 'Fabrika';

/**
 * Comments that name the retired brand ON PURPOSE, as the record of a defect that removed it.
 *
 * `src/app/api/documents/export/route.ts` used to stamp a fabricated applicant organisation
 * ("FonBridge Teknoloji A.Ş.") onto every download; the comment above the fix says so, and
 * `tests/document-exporter.test.ts` asserts that exact string never reaches a document.
 * Rewriting those mentions to the new name would both falsify the record and mint a fresh
 * fabricated identity, so they are listed rather than renamed.
 */
const HISTORICAL_RECORD = new Set([
  'src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx',
  'src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx',
  'src/app/[locale]/admin/blog/actions.ts',
  'src/app/api/documents/export/route.ts',
  'src/app/api/invitations/route.ts',
  'src/app/api/billing/invoices/[id]/export/invoice-document.ts',
  'src/lib/brand.ts',
  'src/lib/document-exporter.ts',
  'src/lib/billing/vat-rates.ts',
  'src/lib/billing/subscription-sync.ts',
  'src/lib/billing/invoice-writer.ts',
  'src/lib/efatura-integrator.ts',
  'src/lib/env.ts',
  'src/lib/fx/tcmb.ts',
  'src/lib/llm.ts',
  'src/lib/llm.generate.test.ts',
  'src/lib/routes.ts',
  'src/lib/modules/state-machine.ts',
  'src/modules/m10/server/actions.ts',
  'next.config.ts',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|json)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('retired product name', () => {
  test('no live source file outside the documented record names the retired brand', () => {
    const offenders = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'next.config.ts')]
      .filter((f) => readFileSync(f, 'utf8').includes(RETIRED))
      .map((f) => relative(ROOT, f))
      .filter((f) => !HISTORICAL_RECORD.has(f));

    expect(offenders).toEqual([]);
  });

  test('neither message catalogue names the retired brand', () => {
    for (const locale of ['tr', 'en'] as const) {
      const catalogue = readFileSync(join(ROOT, 'messages', `${locale}.json`), 'utf8');
      expect(catalogue).not.toContain(RETIRED);
    }
  });

  test('catalogue strings hold a {brand} placeholder rather than the name itself', () => {
    for (const locale of ['tr', 'en'] as const) {
      const messages = JSON.parse(
        readFileSync(join(ROOT, 'messages', `${locale}.json`), 'utf8')
      ) as { DocumentExport: Record<string, string> };
      for (const key of ['footer', 'provenanceNotice', 'docxFallbackBody', 'templateBody']) {
        expect(messages.DocumentExport[key]).not.toContain(PRODUCT_NAME);
      }
      expect(messages.DocumentExport.footer).toContain('{brand}');
    }
  });

  test('an exported document carries the product name, in both languages', () => {
    for (const locale of ['tr', 'en'] as const) {
      const html = generatePdfHtml({
        kind: 'NDA',
        title: 'Gizlilik Sözleşmesi',
        tenantName: 'Küçük Danışmanlık Ltd.',
        locale,
      });
      expect(html).toContain(PRODUCT_NAME);
      expect(html).not.toContain(RETIRED);
      expect(html).not.toContain('{brand}');
    }
  });

  /**
   * The negative control. Asserting that the footer says "Fabrika" cannot distinguish a value
   * read from `brand.ts` from a literal that happens to match it, so the assertion is that an
   * unrelated name substituted into the same interpolation comes out the other end.
   */
  test('document text follows the single source rather than a matching literal', () => {
    const rendered = withBrand('{brand} — motor');
    expect(rendered).toBe(`${PRODUCT_NAME} — motor`);
    expect(templateBodyText('NDA', 'tr')).not.toContain('{brand}');
  });
});
