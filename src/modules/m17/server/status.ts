/**
 * M17 analysis status after an upload (FO-186). Pure, so the rule the UI badges
 * read is unit-tested in one place.
 *
 *   neither document           → UPLOADING
 *   call guide only            → CALL_READY
 *   both documents             → READY (the "check the project" button opens)
 *   project file only          → UPLOADING (the call guide is still missing)
 *
 * ANALYZING refuses a new upload (the F2 run reads both texts); DONE and FAILED
 * fall back to the rule above, and the caller drops the stale F2 result.
 */
import type { InterregAnalysisStatus } from '@prisma/client';

export function statusAfterUpload(hasCall: boolean, hasProject: boolean): InterregAnalysisStatus {
  if (hasCall && hasProject) return 'READY';
  if (hasCall) return 'CALL_READY';
  return 'UPLOADING';
}

/** Whether a document may be (re)uploaded while the analysis is in `status`. */
export function acceptsUpload(status: InterregAnalysisStatus): boolean {
  return status !== 'ANALYZING';
}
