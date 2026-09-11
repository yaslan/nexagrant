import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test, expect, vi, beforeEach } from 'vitest';

import tr from '../messages/tr.json';
import en from '../messages/en.json';

/**
 * TASK-MTVUQ775Y9YIL — the marketplace page told "no rows" and "the read blew
 * up" apart by filling both in with the same three invented listings
 * (`list-demo-1..3`) and one invented API key (`key-demo-1`).
 *
 * The browser half of the proof is tests/e2e/marketplace-demo-fallback.spec.ts:
 * an empty tenant renders the empty state and none of the demo copy. What a
 * browser cannot force — without breaking a database four other agents are
 * using — is the *failure* half, so the three branches are driven here by
 * making the reads throw:
 *
 *   - a failed listing read renders the error notice with a retry link, and
 *     never a listing;
 *   - a failed key read is reported on its own, instead of being folded into
 *     "you have no keys" (the two reads used to share one try/catch);
 *   - both reads down renders the page-level error and NOT the client, whose
 *     forms would fail the same way.
 */

const { requireTenantPageMock, withTenantMock, listTenantListingsMock } = vi.hoisted(() => ({
  requireTenantPageMock: vi.fn(),
  withTenantMock: vi.fn(),
  listTenantListingsMock: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({ requireTenantPage: requireTenantPageMock }));
vi.mock('@/lib/db', () => ({ withTenant: withTenantMock, prisma: {} }));
vi.mock('@/modules/marketplace/server/listings', () => ({
  listTenantListings: listTenantListingsMock,
}));

// The catalogue itself answers `t()`, so a key the page asks for that is not in
// messages/*.json fails this test instead of rendering silently.
const catalogues: Record<string, Record<string, unknown>> = { tr, en };
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const root = catalogues[locale];
    if (!root) throw new Error(`no catalogue for locale ${locale}`);
    return (key: string) => {
      const path = `${namespace}.${key}`.split('.');
      let node: unknown = root;
      for (const part of path) {
        if (typeof node !== 'object' || node === null) node = undefined;
        else node = (node as Record<string, unknown>)[part];
      }
      if (typeof node !== 'string') throw new Error(`missing message key: ${path.join('.')}`);
      return node;
    };
  },
}));

// The client is a 'use client' island; this file is about what the server page
// decides to hand it, so it is stubbed down to its two counts.
vi.mock('@/app/[locale]/(app)/[workspace]/marketplace/client', () => ({
  MarketplaceClient: (props: { listings: unknown[]; apiKeys: unknown[] }) =>
    React.createElement(
      'div',
      { 'data-testid': 'marketplace-client' },
      `listings=${props.listings.length} apiKeys=${props.apiKeys.length}`
    ),
}));

const MarketplacePage = (await import('@/app/[locale]/(app)/[workspace]/marketplace/page')).default;

const TENANT = 'tenant-of-the-session';
const DEMO_STRINGS = [
  'Horizon Europe Proposal Coaching',
  'EV Solid-State Battery Thermal Sensor License',
  'Cleanroom ISO 5 Pilot Batch Fabrication',
  'ERP Enterprise Integration Key',
  'fp_live_9a8b',
];

const m8 = tr.m8 as unknown as {
  state: {
    retry: string;
    page: { errorTitle: string };
    listings: { emptyTitle: string; errorTitle: string };
    apiKeys: { emptyTitle: string; errorTitle: string };
  };
};

async function render(locale = 'tr', workspace = 'ws-a') {
  const element = await MarketplacePage({ params: Promise.resolve({ locale, workspace }) });
  return renderToStaticMarkup(element as React.ReactElement);
}

const listing = {
  id: 'real-listing-1',
  kind: 'consultancy',
  title: 'Gercek ilan',
  description: 'Bu satir veritabanindan geldi',
  price: '€1',
  status: 'active',
};
const apiKey = { id: 'real-key-1', name: 'Gercek anahtar', prefix: 'fp_live_real', createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireTenantPageMock.mockResolvedValue({ tenantId: TENANT, userId: 'user-1' });
});

describe('marketplace page — empty, failed and populated reads are three different screens', () => {
  test('no rows: empty state, and not one invented listing or key', async () => {
    listTenantListingsMock.mockResolvedValue([]);
    withTenantMock.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain(m8.state.listings.emptyTitle);
    expect(html).toContain(m8.state.apiKeys.emptyTitle);
    expect(html).not.toContain(m8.state.listings.errorTitle);
    expect(html).toContain('listings=0 apiKeys=0');
    for (const demo of DEMO_STRINGS) expect(html).not.toContain(demo);
  });

  test('rows present: the list, with no empty or error notice', async () => {
    listTenantListingsMock.mockResolvedValue([listing]);
    withTenantMock.mockResolvedValue([apiKey]);

    const html = await render();

    expect(html).toContain('listings=1 apiKeys=1');
    expect(html).not.toContain(m8.state.listings.emptyTitle);
    expect(html).not.toContain(m8.state.apiKeys.emptyTitle);
    expect(html).not.toContain(m8.state.listings.errorTitle);
    expect(html).not.toContain(m8.state.apiKeys.errorTitle);
  });

  test('listing read throws: error notice plus a retry link, never a fabricated row', async () => {
    listTenantListingsMock.mockRejectedValue(new Error('permission denied for table MarketplaceListing'));
    withTenantMock.mockResolvedValue([apiKey]);

    const html = await render();

    expect(html).toContain(m8.state.listings.errorTitle);
    expect(html).toContain(m8.state.retry);
    expect(html).toContain('href="/tr/ws-a/pazar-yeri"');
    // Not the empty state: the marketplace is not known to be empty.
    expect(html).not.toContain(m8.state.listings.emptyTitle);
    expect(html).toContain('listings=0 apiKeys=1');
    for (const demo of DEMO_STRINGS) expect(html).not.toContain(demo);
  });

  test('key read throws while listings load: the failure is reported on the key list alone', async () => {
    listTenantListingsMock.mockResolvedValue([listing]);
    withTenantMock.mockRejectedValue(new Error('connection terminated'));

    const html = await render();

    expect(html).toContain(m8.state.apiKeys.errorTitle);
    expect(html).not.toContain(m8.state.apiKeys.emptyTitle);
    // The listing read succeeded, so it is neither hidden nor flagged.
    expect(html).not.toContain(m8.state.listings.errorTitle);
    expect(html).toContain('listings=1 apiKeys=0');
  });

  test('both reads down: the page-level error, and no client to type into', async () => {
    listTenantListingsMock.mockRejectedValue(new Error('db down'));
    withTenantMock.mockRejectedValue(new Error('db down'));

    const html = await render();

    expect(html).toContain(m8.state.page.errorTitle);
    expect(html).toContain(m8.state.retry);
    expect(html).not.toContain('data-testid="marketplace-client"');
  });

  test('english locale answers from the english catalogue and keeps the /en route', async () => {
    listTenantListingsMock.mockRejectedValue(new Error('db down'));
    withTenantMock.mockRejectedValue(new Error('db down'));

    const html = await render('en', 'ws-a');

    expect(html).toContain((en.m8 as unknown as typeof m8).state.page.errorTitle);
    expect(html).toContain('href="/en/ws-a/marketplace"');
  });
});
