import React from 'react';
import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { getWorkspaceRoute } from '@/lib/routes';
import { listTenantListings } from '@/modules/marketplace/server/listings';
import { MarketplaceClient, type ApiKeyItem, type ListingItem } from './client';
import { errorMessage } from '@/lib/errors';

/**
 * Empty and failed reads look identical to a caller that only sees `[]`, so the
 * page used to fill both in with three hardcoded `list-demo-*` listings and one
 * `key-demo-1` row (TASK-MTVUQ775Y9YIL). That fallback fired exactly where it
 * hurt most: under a NOBYPASSRLS role a read without `set_config('app.tenant_id')`
 * returns zero rows rather than an error (see the measurement in
 * `src/modules/marketplace/server/listings.ts`), so a tenant-isolation failure
 * rendered as a populated marketplace with prices on it. The demo rows are gone;
 * the three states are now told apart and each one is named to the user.
 */
type ReadState<T> = { ok: true; rows: T[] } | { ok: false };

async function readState<T>(label: string, read: () => Promise<T[]>): Promise<ReadState<T>> {
  try {
    return { ok: true, rows: await read() };
  } catch (e) {
    // Message only: the row payload may carry tenant data, the error text does not.
    console.error(`[MarketplacePage] ${label} read failed: ${errorMessage(e)}`);
    return { ok: false };
  }
}

function StateNotice({
  tone,
  title,
  body,
  retry,
}: {
  tone: 'empty' | 'error';
  title: string;
  body: string;
  retry?: { href: string; label: string };
}) {
  const isError = tone === 'error';
  return (
    <div
      role={isError ? 'alert' : undefined}
      className={`rounded-2xl border p-5 ${
        isError ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-surface'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className={`text-sm font-bold ${isError ? 'text-amber-500' : 'text-ink'}`}>{title}</h2>
          <p className="text-xs text-ink-2 leading-relaxed">{body}</p>
        </div>
        {retry ? (
          // A full document request, not a soft navigation: the point of the
          // button is to run the failed query again on the server.
          <a
            href={retry.href}
            className="shrink-0 px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl font-semibold text-xs transition shadow-2xs self-start sm:self-auto"
          >
            {retry.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default async function MarketplacePage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, userId } = await requireTenantPage(locale);
  const t = await getTranslations({ locale, namespace: 'm8' });

  // Two independent reads under one `try` meant a failed listing read also
  // reported the key list as empty. They are read, and reported, separately.
  const listingsRead = await readState<ListingItem>('listings', () =>
    listTenantListings(tenantId)
  );
  const apiKeysRead = await readState<ApiKeyItem>('apiKeys', () =>
    withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })
    )
  );

  const retry = {
    href: getWorkspaceRoute('marketplace', locale, workspace),
    label: t('state.retry'),
  };

  // Both reads down: the forms below would fail too, so nothing is rendered
  // that invites the user to act on data the page could not fetch.
  if (!listingsRead.ok && !apiKeysRead.ok) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <StateNotice
          tone="error"
          title={t('state.page.errorTitle')}
          body={t('state.page.errorBody')}
          retry={retry}
        />
      </div>
    );
  }

  const listings = listingsRead.ok ? listingsRead.rows : [];
  const apiKeys = apiKeysRead.ok ? apiKeysRead.rows : [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {!listingsRead.ok ? (
        <StateNotice
          tone="error"
          title={t('state.listings.errorTitle')}
          body={t('state.listings.errorBody')}
          retry={retry}
        />
      ) : listings.length === 0 ? (
        <StateNotice
          tone="empty"
          title={t('state.listings.emptyTitle')}
          body={t('state.listings.emptyBody')}
        />
      ) : null}

      {!apiKeysRead.ok ? (
        <StateNotice
          tone="error"
          title={t('state.apiKeys.errorTitle')}
          body={t('state.apiKeys.errorBody')}
          retry={retry}
        />
      ) : apiKeys.length === 0 ? (
        <StateNotice
          tone="empty"
          title={t('state.apiKeys.emptyTitle')}
          body={t('state.apiKeys.emptyBody')}
        />
      ) : null}

      <MarketplaceClient
        tenantId={tenantId}
        userId={userId}
        listings={listings}
        apiKeys={apiKeys}
      />
    </div>
  );
}
