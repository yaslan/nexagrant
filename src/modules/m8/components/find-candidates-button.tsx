'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import {
  computeSeatCandidatesForm,
  type SeatCandidateFormState,
} from '@/modules/m8/server/actions';

/**
 * "Aday Bul" — the button that runs the matcher for one seat.
 *
 * It is a client component for one reason: matching walks the CORDIS graph and
 * takes a noticeable moment, and the server-component form it replaced gave no
 * sign that anything was happening — a user with no feedback clicks again, and
 * each click re-runs the scorer. It also renders the failure inline; the action
 * used to throw, which in a server-component form means Next's error screen
 * instead of a sentence the user can act on.
 */

const INITIAL: SeatCandidateFormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('Consortium');

  return (
    <button
      type="submit"
      disabled={pending}
      // 44px min target: WCAG 2.5.5 / AA target size.
      className="min-h-11 text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded disabled:opacity-60 disabled:cursor-progress focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {pending ? t('computing') : t('findCandidates')}
    </button>
  );
}

export default function FindCandidatesButton({
  opportunityId,
  seatId,
}: {
  opportunityId: string;
  seatId: string;
}) {
  const [state, formAction] = useActionState(computeSeatCandidatesForm, INITIAL);
  const t = useTranslations('Consortium');

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="seatId" value={seatId} />
      <SubmitButton />

      {/* Both outcomes are announced: a screen-reader user gets no visual cue
          that the click did anything. */}
      <p aria-live="polite" className="sr-only">
        {state.status === 'ok' ? t('candidatesReady', { count: state.count ?? 0 }) : ''}
      </p>

      {state.status === 'error' && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400 max-w-xs text-right">
          {t('computeFailed')} {state.message}
        </p>
      )}
    </form>
  );
}
