'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { GateReason } from '@/lib/gates/reasons';

/**
 * The sentence for one gate refusal, in the language of the screen (src/lib/gates/reasons.ts).
 *
 * Seat roles and statuses use the consortium screen's words, so the reason names a role the way the
 * user already sees it. A role key that screen has no word for is shown as it is.
 */
export function useGateReasonText(): (reason: GateReason) => string {
  const t = useTranslations('GateReason');
  const consortium = useTranslations('Consortium');

  return useCallback(
    (reason: GateReason): string => {
      const roleWord = (role: string) => (consortium.has(`role.${role}`) ? consortium(`role.${role}`) : role);
      const statusWord = (status: string) =>
        consortium.has(`status.${status}`) ? consortium(`status.${status}`) : status;

      switch (reason.code) {
        case 'G1_SEAT_NO_ORGANISATION':
        case 'G1_NO_BACKUP':
        case 'G1_NO_LOI':
        case 'G1_NO_AGREED_BUDGET_SHARE':
          return t(reason.code, { role: roleWord(reason.values.role) });
        case 'G1_SEAT_NOT_FILLED':
          return t(reason.code, { role: roleWord(reason.values.role), status: statusWord(reason.values.status) });
        case 'G4_STATUS_BLOCKED':
          return t(`${reason.code}.${reason.values.status === 'WITHDRAWN' ? 'WITHDRAWN' : 'REJECTED'}`);
        default:
          return 'values' in reason ? t(reason.code, reason.values) : t(reason.code);
      }
    },
    [t, consortium],
  );
}
