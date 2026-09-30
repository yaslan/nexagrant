/**
 * The codes a failed CORDIS import may carry (İNCELEME-100 Y-1,
 * TASK-MUOBNYACFPLPF).
 *
 * The admin console turns a code into `adminCordis.importErrors.<code>`, so a
 * code is a translation key. The importer used to hand back the caught
 * message (SQL, file paths, CSV lines), and the server action passed it
 * straight to the browser; now only a listed code leaves the server, and the
 * text stays in the log, on the CordisImportRun row and in the alert.
 *
 * Not in `importer.ts`: the client reads this list too, and the importer pulls
 * in Prisma and the file system.
 */
export const CORDIS_IMPORT_FAILURE_CODES = ['SKIP_LIMIT_EXCEEDED', 'IMPORT_FAILED'] as const;

export type CordisImportFailureCode = (typeof CORDIS_IMPORT_FAILURE_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(CORDIS_IMPORT_FAILURE_CODES);

/** `code` when it is a listed one, else `IMPORT_FAILED`. */
export function cordisImportFailureCode(code: unknown): CordisImportFailureCode {
  return typeof code === 'string' && KNOWN.has(code) ? (code as CordisImportFailureCode) : 'IMPORT_FAILED';
}
