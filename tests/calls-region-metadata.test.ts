import { describe, expect, it, vi } from 'vitest';

/**
 * NG-75 (PR #328 inceleme #5, #4b) — calls/[region] generateMetadata TR/EN.
 *
 * Real catalogs are used through a small getTranslations stand-in so the test
 * checks the strings a visitor actually gets, not a mock of them.
 */
vi.mock('next-intl/server', async () => {
  const tr = (await import('../messages/tr.json')).default;
  const en = (await import('../messages/en.json')).default;
  const catalogs = { tr, en } as unknown as Record<string, Record<string, Record<string, string | undefined>>>;
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
      (key: string, values?: Record<string, string>) => {
        const msg = catalogs[locale]?.[namespace]?.[key] ?? key;
        return values ? msg.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`) : msg;
      },
  };
});

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { generateMetadata } from '@/app/[locale]/(public)/calls/[region]/page';

const metaFor = (region: string, locale: string) =>
  generateMetadata({ params: Promise.resolve({ region, locale }) });

describe('calls/[region] generateMetadata (NG-75 #5)', () => {
  it('TR: başlık bölge + ürün adı, açıklama Türkçe ve ASCII apostroflu', async () => {
    const meta = await metaFor('germany', 'tr');
    expect(meta.title).toBe('Almanya — NexaGrant');
    expect(meta.description).toBe("Almanya'deki açık Horizon çağrıları. Deadline, bütçe ve uygunluk bilgisi.");
  });

  it('EN: açıklama İngilizce, bölge adı yerleşik', async () => {
    const meta = await metaFor('germany', 'en');
    // Region name is intentionally not pinned: REGIONS names are Turkish-only (open gap, see report).
    expect(meta.description).toMatch(/^Open Horizon calls in .+\. Deadlines, budgets, and eligibility information\.$/);
  });
});
