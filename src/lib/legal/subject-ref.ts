import { createHash } from 'node:crypto';

/**
 * The one-way reference to a data subject that stands in for their user id in
 * the audit trail (`user.erasure.requested`/`cancelled`, `user.data.exported`,
 * `user.erased`). Deterministic, so anyone holding the original id can
 * recompute it — which is the point: the request, export and erasure rows of
 * one person must carry the same value. Keep this the only definition
 * (TASK-MVDZHJ0N9MHRY); a second copy that drifts splits one subject in two.
 */
export function subjectRefOf(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}
