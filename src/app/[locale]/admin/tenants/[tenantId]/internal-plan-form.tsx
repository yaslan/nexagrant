'use client';

import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { assignInternalPlanAction } from '../actions';

/**
 * Internal plan assignment (TASK-MVCH26OXNVLKR): Discover / Basic / Pro / Ultra
 * without a payment, with a mandatory note. Discover takes an internal plan
 * back. The rules live in src/lib/billing/internal-plan.ts; the action is
 * behind `requirePlatformAdmin()`.
 */
export function InternalPlanForm({
  tenantId,
  currentPlanId,
  choices,
}: {
  tenantId: string;
  /** The internal plan in force, or null when the tenant has none. */
  currentPlanId: string | null;
  choices: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('adminTenants');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [planId, setPlanId] = useState(currentPlanId ?? choices[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const res = await assignInternalPlanAction({ tenantId, planId, note });
      if (res.ok) {
        setNotice({ kind: 'ok', text: t(`internalPlan.outcome.${res.data.outcome}`) });
        setNote('');
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: t(`errors.${res.code}`) });
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="internal-plan-form">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-ink-2 space-y-1">
          <span className="block">{t('internalPlan.plan')}</span>
          <select
            data-testid="internal-plan-select"
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink min-w-[180px]"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2 space-y-1 flex-1 min-w-[220px]">
          <span className="block">{t('internalPlan.note')}</span>
          <input
            data-testid="internal-plan-note"
            required
            maxLength={500}
            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink"
            placeholder={t('internalPlan.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="submit"
          data-testid="internal-plan-submit"
          disabled={pending || !planId || !note.trim()}
          className="text-sm font-semibold bg-indigo-600 text-white px-3.5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {t('internalPlan.submit')}
        </button>
      </div>
      {notice && (
        <p
          role="status"
          data-testid="internal-plan-notice"
          className={`text-sm ${notice.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}
        >
          {notice.text}
        </p>
      )}
    </form>
  );
}
