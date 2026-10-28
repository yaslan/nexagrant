/**
 * M17 upload admission (FO-186). The status an upload leads to is computed in one
 * place only, saveDocument() in ./analyses.ts, on the locked row (crw2 Ö1).
 *
 * ANALYZING refuses a new upload (the F2 run reads both texts); every other
 * status accepts one, and the stale F2 result is dropped.
 */
import type { InterregAnalysisStatus } from '@prisma/client';

/** Whether a document may be (re)uploaded while the analysis is in `status`. */
export function acceptsUpload(status: InterregAnalysisStatus): boolean {
  return status !== 'ANALYZING';
}
