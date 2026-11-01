/**
 * M17 upload admission (FO-186). The status an upload leads to is computed in one
 * place only: the SQL `CASE` below, run on the locked row by saveDocument()
 * (./analyses.ts, crw2 Ö1) and again by the 30-day purge (./retention.ts, FO-195),
 * which empties slots the same way an upload fills them.
 *
 * ANALYZING refuses a new upload (the F2 run reads both texts); every other
 * status accepts one, and the stale F2 result is dropped.
 */
import { Prisma, type InterregAnalysisStatus } from '@prisma/client';

/** Whether a document may be (re)uploaded while the analysis is in `status`. */
export function acceptsUpload(status: InterregAnalysisStatus): boolean {
  return status !== 'ANALYZING';
}

/**
 * The one copy of the status rule, as a SQL expression over the row's own texts:
 *   neither document → UPLOADING · call guide only → CALL_READY
 *   both → READY (the "check the project" button opens)
 *   project file only → UPLOADING (the call guide is still missing)
 * ANALYZING, DONE and FAILED are not an outcome of it: callers apply it to a row
 * whose texts just changed, and the F2 run owns those three.
 */
export const STATUS_FROM_TEXTS_SQL = Prisma.sql`(CASE
    WHEN "callText" IS NOT NULL AND "projectText" IS NOT NULL THEN 'READY'
    WHEN "callText" IS NOT NULL THEN 'CALL_READY'
    ELSE 'UPLOADING'
  END)::"InterregAnalysisStatus"`;
