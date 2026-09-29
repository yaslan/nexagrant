'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { assignCandidateToSeat } from '@/modules/m8/server/actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

/**
 * "Davet Et" — invites one candidate to a seat.
 *
 * This was an inline `'use server'` form on the matching page whose catch only
 * logged: `assignCandidateToSeat` refused an expired pilot and the user saw
 * nothing, so they clicked again (İNCELEME-30 B-2, TASK-MUN39FIAKFY2R). The
 * refusal now reaches the browser with its `PILOT_EXPIRED` digest and is shown
 * as `Common.pilotExpired`. Any other failure stays silent, as before — the
 * action is the gate, this is only the message.
 */
export default function InviteCandidateButton({
  seatId,
  organizationId,
  opportunityId,
}: {
  seatId: string;
  organizationId: string;
  opportunityId: string;
}) {
  const t = useTranslations('Consortium');
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await assignCandidateToSeat(seatId, organizationId, 'INVITED', opportunityId);
            } catch (e) {
              setError(errorText(e, null));
            }
          })
        }
        className="min-h-11 text-xs bg-surface hover:bg-surface-hover dark:bg-gray-800 dark:hover:bg-gray-700 text-ink border border-border px-2 py-1 rounded disabled:opacity-60 disabled:cursor-progress focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t('invite')}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400 max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
}
