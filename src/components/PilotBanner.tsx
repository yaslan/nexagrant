import React from 'react';
import { getTranslations } from 'next-intl/server';
import { getPilotState, pilotLastDayLabel } from '@/lib/billing/pilot';

/**
 * The free-pilot strip over every workspace page (TASK-MUMABL78X5JLX).
 *
 * Running: when it ends, and that nothing is charged. Run out: that the
 * workspace is read-only and the data is kept — the reason every save from
 * here on is refused (`requireTenantAction`, src/lib/tenant.ts). A tenant with
 * no pilot gets nothing, and a failed read shows nothing rather than a guess.
 */
export default async function PilotBanner({ tenantId, locale }: { tenantId: string; locale: string }) {
  let state: Awaited<ReturnType<typeof getPilotState>>;
  try {
    state = await getPilotState(tenantId);
  } catch {
    return null;
  }
  if (state.kind === 'none') return null;

  const t = await getTranslations({ locale, namespace: 'pilot' });
  const date = pilotLastDayLabel(state.endsAt, locale);

  if (state.kind === 'expired') {
    return (
      <div
        role="status"
        data-testid="pilot-banner-expired"
        className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      >
        <strong className="font-semibold">{t('expiredTitle')}</strong> {t('expiredBody', { date })}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="pilot-banner-active"
      className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
    >
      <strong className="font-semibold">{t('activeTitle')}</strong> {t('activeBody', { date })}
    </div>
  );
}
