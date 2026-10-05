'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { isPilotExpired } from '@/lib/pilot-expired';
import { isForbiddenRole } from '@/lib/forbidden-role';
import { isServiceBusy } from '@/lib/service-busy';
import { isLlmRefused, isLlmTruncated } from '@/lib/llm-outcome';

/**
 * The text to show for a failed server action.
 *
 * `error` is whatever the call site already has: the value it caught from a
 * rejected action, or the error code a value-returning action answered. A pilot
 * refusal (src/lib/pilot-expired.ts) gets the one "pilot ended, editing is off"
 * sentence; anything else gets `fallback` — the call site's own message,
 * unchanged. So a site keeps its wording and only stops telling an expired
 * pilot to "try again" (TASK-MUMIIUEGJ6N8B). An AI answer cut off at the
 * length limit or declined by the model gets its own sentence the same way
 * (TASK-MUN4PSBP19RKK), and so does a write the caller's role may not make
 * (src/lib/forbidden-role.ts, TASK-MUN80UOUPB2A4), and a write refused because
 * the database had no connection to give (src/lib/service-busy.ts,
 * TASK-MUOF85BU7BV3X). Pass a function when the fallback
 * is looked up from the code itself (`() => t(`errors.${code}`)`), so the
 * lookup never runs for `'pilotExpired'`, which that namespace does not have.
 * A site that showed nothing for a thrown error passes `null`: it still shows
 * nothing for other errors, and the pilot sentence for this one.
 */
export function useActionErrorText(): <F extends string | null>(error: unknown, fallback: F | (() => F)) => string | F {
  const t = useTranslations('Common');
  return useCallback(
    <F extends string | null>(error: unknown, fallback: F | (() => F)): string | F => {
      if (isPilotExpired(error)) return t('pilotExpired');
      if (isForbiddenRole(error)) return t('forbiddenRole');
      if (isServiceBusy(error)) return t('serviceBusy');
      if (isLlmTruncated(error)) return t('aiTruncated');
      if (isLlmRefused(error)) return t('aiRefused');
      return typeof fallback === 'function' ? fallback() : fallback;
    },
    [t]
  );
}
