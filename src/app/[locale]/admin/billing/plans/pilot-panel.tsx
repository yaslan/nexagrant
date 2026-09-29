'use client';

import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { grantPilotAction } from './actions';

/**
 * Free 90-day pilot (TASK-MUMABL78X5JLX): the platform admin puts a tenant on
 * the Ekip package without payment. The data rules — idempotent, audited, never
 * over a paying or contract subscription — are in src/lib/billing/pilot.ts;
 * the action is behind `requirePlatformAdmin()`.
 */
export function PilotPanel({
  tenants,
  pilots,
}: {
  tenants: Array<{ id: string; name: string }>;
  pilots: Array<{ tenantId: string; tenantName: string; lastDay: string; endsAt: string; expired: boolean }>;
}) {
  const t = useTranslations('adminPlans');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tenantId, setTenantId] = useState('');
  const [extend, setExtend] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = () => {
    setNotice(null);
    startTransition(async () => {
      // The end on screen: a second tab extending the same pilot comes back
      // `stale` instead of adding another 90 days.
      const seen = pilots.find((p) => p.tenantId === tenantId)?.endsAt ?? null;
      const res = await grantPilotAction(tenantId, extend, extend ? seen : undefined);
      if (res.ok) {
        setNotice({ kind: 'ok', text: t(`pilot.outcome.${res.data.outcome}`) });
        setExtend(false);
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: t(`errors.${res.code}`, { detail: res.detail }) });
      }
    });
  };

  return (
    <section className="max-w-6xl mx-auto px-4 pb-16" data-testid="pilot-panel">
      <div className="bg-surface border rounded-xl p-5 space-y-3">
        <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
          <FlaskConical className="w-4 h-4" /> {t('pilot.title')}
        </h2>
        <p className="text-xs text-muted">{t('pilot.hint')}</p>

        {notice && (
          <p
            role="status"
            data-testid="pilot-notice"
            className={`text-sm ${notice.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}
          >
            {notice.text}
          </p>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-ink-2 space-y-1">
            <span className="block">{t('assign.tenant')}</span>
            <select
              data-testid="pilot-tenant"
              className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink min-w-[220px]"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            >
              <option value="">{t('assign.pickTenant')}</option>
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {tn.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-2 flex items-center gap-1.5 pb-2">
            <input
              type="checkbox"
              data-testid="pilot-extend"
              checked={extend}
              onChange={(e) => setExtend(e.target.checked)}
            />
            {t('pilot.extend')}
          </label>
          <button
            type="button"
            data-testid="pilot-submit"
            disabled={pending || !tenantId}
            onClick={submit}
            className="text-sm font-semibold bg-indigo-600 text-white px-3.5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {extend ? t('pilot.submitExtend') : t('pilot.submit')}
          </button>
        </div>

        <ul className="divide-y divide-border border border-border rounded-lg" data-testid="pilot-list">
          {pilots.length === 0 && <li className="p-3 text-xs text-muted">{t('pilot.empty')}</li>}
          {pilots.map((p) => (
            <li key={p.tenantId} data-testid={`pilot-${p.tenantId}`} className="p-3 flex justify-between gap-3 text-sm">
              <span className="font-semibold text-ink">{p.tenantName}</span>
              <span className={p.expired ? 'text-amber-700' : 'text-ink-2'}>
                {p.expired ? t('pilot.expiredOn', { date: p.lastDay }) : t('pilot.until', { date: p.lastDay })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
