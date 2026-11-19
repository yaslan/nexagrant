/**
 * NG-239 — the one rule for whether an evidence file may leave: its virus scan
 * ended CLEAN. Nothing else downloads: not PENDING (not scanned yet), not ERROR
 * (clamd down, timed out or the object unreadable — fail closed, never "clean
 * by default"), not INFECTED (deleted), and not a value this code does not
 * know (a row written by a newer or older version).
 *
 * Every reader goes through this function: the download route (D1) before it
 * answers, `getPresignedDownloadUrl` before it signs, and the evidence screen
 * to decide whether a download link is shown at all. Pure and import-free, so
 * the client bundle can use it too. Do not copy the check; call this.
 */

export const EVIDENCE_SCAN_STATUSES = ['PENDING', 'CLEAN', 'INFECTED', 'ERROR'] as const;
export type EvidenceScanState = (typeof EVIDENCE_SCAN_STATUSES)[number];

/** Why a file does not download; `null` = it may. */
export type EvidenceScanRefusal = 'scan_pending' | 'scan_infected' | 'scan_error';

export function evidenceScanRefusal(scanStatus: unknown): EvidenceScanRefusal | null {
  switch (scanStatus) {
    case 'CLEAN':
      return null;
    case 'INFECTED':
      return 'scan_infected';
    case 'ERROR':
      return 'scan_error';
    default:
      // PENDING, undefined, null, anything unknown.
      return 'scan_pending';
  }
}

export function isEvidenceDownloadable(scanStatus: unknown): boolean {
  return evidenceScanRefusal(scanStatus) === null;
}

/** The API error code the download route answers with (409), per refusal. */
export const EVIDENCE_SCAN_REFUSAL_CODE: Record<EvidenceScanRefusal, string> = {
  scan_pending: 'EVIDENCE_SCAN_PENDING',
  scan_infected: 'EVIDENCE_SCAN_INFECTED',
  scan_error: 'EVIDENCE_SCAN_ERROR',
};
