'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ProvinceRouteError } from '@/core/contracts/lead-routing';
import { deactivateProvinceLeadRouteAction, setProvinceLeadRouteAction } from './actions';

export interface ProvinceView {
  province: string;
  /** active = routed now; inactive = a mapping exists but is switched off; unmapped = none. */
  status: 'active' | 'inactive' | 'unmapped';
  tenantId: string | null;
  tenantName: string | null;
  /** Name of the admin who last changed the province, or null when never changed. */
  changedBy: string | null;
  /** UTC timestamp of the last change, or null when never changed. */
  changedAt: string | null;
}

export interface TenantOption {
  id: string;
  name: string;
}

const ERROR_KEY = {
  invalid_province: 'error_invalid_province',
  tenant_not_found: 'error_tenant_not_found',
  tenant_ineligible: 'error_tenant_ineligible',
  route_not_found: 'error_route_not_found',
} as const satisfies Record<ProvinceRouteError, string>;

type Feedback = { kind: 'ok' | 'error'; text: string };

/** The province map (81 rows). Every write goes through the NG-167 actions; the server re-checks eligibility. */
export default function LeadRoutesClient({ provinces, tenants }: { provinces: ProvinceView[]; tenants: TenantOption[] }) {
  const t = useTranslations('adminLeadRoutes');
  return (
    <div className="space-y-3">
      {tenants.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink-2">{t('empty_tenants')}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label={t('table_caption')}>
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">{t('table_caption')}</caption>
          <thead className="bg-surface-hover text-xs font-semibold uppercase tracking-wide text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2">{t('col_province')}</th>
              <th scope="col" className="px-3 py-2">{t('col_tenant')}</th>
              <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_status')}</th>
              <th scope="col" className="px-3 py-2">{t('col_updated')}</th>
              <th scope="col" className="px-3 py-2">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-ink">
            {provinces.map((p) => (
              <ProvinceRow key={p.province} view={p} tenants={tenants} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProvinceRow({ view, tenants }: { view: ProvinceView; tenants: TenantOption[] }) {
  const t = useTranslations('adminLeadRoutes');
  const router = useRouter();
  const [selected, setSelected] = useState(view.tenantId ?? '');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();

  // The select follows the server value. When a save, a deactivation or another admin changes the
  // row (tenantId or changedAt), the local pick is replaced. Done during render, not in an effect,
  // and without remounting the row, so the feedback message survives `router.refresh()`.
  const serverKey = `${view.tenantId ?? ''}|${view.changedAt ?? ''}`;
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setSelected(view.tenantId ?? '');
  }

  const unmapped = view.status !== 'active';
  const changed = selected !== (view.tenantId ?? '');
  const statusLabel = view.status === 'active' ? t('status_active') : view.status === 'inactive' ? t('status_inactive') : t('status_unmapped');

  const save = () => {
    if (!selected) return;
    startTransition(async () => {
      try {
        const res = await setProvinceLeadRouteAction({ province: view.province, tenantId: selected });
        if (res.ok) {
          setFeedback({ kind: 'ok', text: t('saved', { province: view.province, tenant: res.route.tenantName }) });
          router.refresh();
        } else {
          setFeedback({ kind: 'error', text: t(ERROR_KEY[res.error]) });
        }
      } catch {
        setFeedback({ kind: 'error', text: t('error_generic') });
      }
    });
  };

  const deactivate = () => {
    startTransition(async () => {
      try {
        const res = await deactivateProvinceLeadRouteAction({ province: view.province });
        if (res.ok) {
          setFeedback({ kind: 'ok', text: t('deactivated', { province: view.province }) });
          router.refresh();
        } else {
          setFeedback({ kind: 'error', text: t(ERROR_KEY[res.error]) });
        }
      } catch {
        setFeedback({ kind: 'error', text: t('error_generic') });
      }
    });
  };

  return (
    <tr className={`align-top ${unmapped ? 'bg-surface-hover' : ''}`}>
      <th scope="row" className="px-3 py-2 font-semibold whitespace-nowrap">{view.province}</th>
      <td className="px-3 py-2">
        <select
          aria-label={t('select_label', { province: view.province })}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending || tenants.length === 0}
          className="w-full min-w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-60"
        >
          <option value="" disabled>{t('select_placeholder')}</option>
          {tenants.map((tn) => (
            <option key={tn.id} value={tn.id}>{tn.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={unmapped ? 'font-semibold text-bad' : 'font-semibold text-ink'}>{statusLabel}</span>
      </td>
      <td className="px-3 py-2 text-xs text-ink-2">
        {view.changedAt ? (
          <>
            <div>{view.changedBy}</div>
            <div className="font-mono">{view.changedAt}</div>
          </>
        ) : (
          t('not_changed')
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !selected || !changed}
            className="min-h-9 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? t('saving') : t('save')}
          </button>
          {view.status === 'active' && (
            <button
              type="button"
              onClick={deactivate}
              disabled={pending}
              className="min-h-9 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-ink-2 disabled:opacity-50"
            >
              {pending ? t('deactivating') : t('deactivate')}
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className={`mt-1 text-xs ${feedback?.kind === 'error' ? 'text-bad' : 'text-ink-2'}`}>
          {feedback?.text}
        </p>
      </td>
    </tr>
  );
}
