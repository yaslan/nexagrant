/**
 * NG-79 — the consortium page's query-failure banner reads its text from the catalogs.
 *
 * The page used to carry the TR/EN pair inline (`isTr ? '…' : '…'`). This renders the real
 * page with the database read failing, once per locale, and checks the banner shows the
 * catalog string for that locale. The catalogs are the real messages/*.json files, so a
 * missing or mistyped key fails here instead of rendering a raw key on screen.
 *
 * Set NG79_EXPORT_HTML=<dir> to also write the two rendered banners as HTML (screenshot input).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import tr from '../messages/tr.json';
import en from '../messages/en.json';

const h = vi.hoisted(() => ({
  moduleGate: vi.fn(),
  recordAlert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  withTenant: async () => {
    throw new Error('simulated read failure');
  },
}));
vi.mock('@/lib/page-role', () => ({
  requireTenantPageRole: async () => ({ tenantId: 't-1', role: 'OWNER' }),
}));
vi.mock('@/modules/m8/server/seat-transitions', () => ({ canConfirmSeat: () => true }));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'tr' | 'en'; namespace: string }) => {
    const catalog = (locale === 'tr' ? tr : en) as Record<string, Record<string, unknown>>;
    const section = catalog[namespace] as Record<string, unknown>;
    return (key: string) => {
      const value = section?.[key];
      if (typeof value !== 'string') throw new Error(`missing ${locale} ${namespace}.${key}`);
      return value;
    };
  },
}));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: h.moduleGate }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess: vi.fn(async () => ({ allowed: false })) }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: h.recordAlert }));
vi.mock('@/modules/m8/server/matching', () => ({ findOpportunityTopic: vi.fn() }));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager', () => ({
  default: () => null,
}));

import ConsortiumPage from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page';

async function renderBanner(locale: 'tr' | 'en'): Promise<string> {
  h.moduleGate.mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const tree = await ConsortiumPage({
    params: Promise.resolve({ id: 'o-1', locale, workspace: 'w-1' }),
  });
  return renderToStaticMarkup(tree as React.ReactElement);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consortium page — query-failed banner (NG-79)', () => {
  it('shows the Turkish catalog text on the tr locale', async () => {
    const html = await renderBanner('tr');
    expect(html).toContain('role="alert"');
    expect(html).toContain(tr.Consortium.queryFailed);
    expect(html).not.toContain(en.Consortium.queryFailed);
    expect(h.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('shows the English catalog text on the en locale', async () => {
    const html = await renderBanner('en');
    expect(html).toContain('role="alert"');
    expect(html).toContain(en.Consortium.queryFailed);
    expect(html).not.toContain(tr.Consortium.queryFailed);
  });

  it('keeps the TR and EN catalogs on the same key set for this namespace', () => {
    expect(Object.keys(en.Consortium).sort()).toEqual(Object.keys(tr.Consortium).sort());
  });

  it('optionally exports both banners as HTML for screenshots', async () => {
    const dir = process.env.NG79_EXPORT_HTML;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    for (const locale of ['tr', 'en'] as const) {
      const html = await renderBanner(locale);
      writeFileSync(path.join(dir, `banner-${locale}.html`), html, 'utf8');
    }
  });
});
