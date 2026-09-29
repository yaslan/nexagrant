/**
 * `RawFetch` writer for the K2 CORDIS paths.
 *
 * CLAUDE.md rule 6 asks that the raw upstream answer be kept before it is
 * normalized, so an import that produced odd rows can be re-read against what
 * the feed actually said. K1 already did this inline
 * (src/lib/jobs/tasks/k1-daily-calls.ts); no CORDIS path did — measured
 * 2026-09-07, `RawFetch` held 0 rows for any CORDIS source.
 *
 * Two rules the CORDIS side needs and K1's inline copy does not:
 *
 *  - **Store on change only.** Keyed on `(source, key)` + a SHA-256 of the
 *    envelope, a re-run that saw the same upstream bytes writes nothing. That
 *    is what makes "run it twice, row counts do not move" true for this table
 *    as well as for the normalized ones.
 *  - **Never store the bytes themselves.** The CORDIS bulk dataset is a
 *    ~500 MB zip. `storageUrl` records where it came from and `payload` holds
 *    a small envelope (size, content type, http status); the archive itself
 *    belongs in object storage, not in a Postgres `Json` column.
 *
 * Never throws: an audit write must not break the job it is auditing.
 */
import crypto from 'crypto';
import { prisma } from '@/lib/db';

export interface RecordRawFetchInput {
  /** Stable feed id, e.g. `cordis_bulk` or `cordis_worker`. */
  source: string;
  /** Natural key inside the feed, e.g. the dataset name or the month. */
  key: string;
  /** Small envelope describing the answer — never the payload bytes. */
  payload: Record<string, unknown>;
  /** Where the bytes live, when they live somewhere addressable. */
  storageUrl?: string;
  /**
   * Content hash, when the caller already computed one over the real bytes
   * (the importer hashes the zip). Otherwise the envelope is hashed.
   */
  hash?: string;
}

export type RawFetchOutcome =
  | { status: 'recorded'; id: string; hash: string }
  | { status: 'unchanged'; hash: string }
  | { status: 'failed'; reason: string };

export async function recordRawFetch(input: RecordRawFetchInput): Promise<RawFetchOutcome> {
  const hash =
    input.hash ??
    crypto.createHash('sha256').update(JSON.stringify(input.payload)).digest('hex');

  try {
    const last = await prisma.rawFetch.findFirst({
      where: { source: input.source, key: input.key },
      orderBy: { fetchedAt: 'desc' },
      select: { hash: true },
    });

    if (last?.hash === hash) return { status: 'unchanged', hash };

    const row = await prisma.rawFetch.create({
      data: {
        source: input.source,
        key: input.key,
        hash,
        payload: input.payload as object,
        storageUrl: input.storageUrl ?? null,
      },
      select: { id: true },
    });

    return { status: 'recorded', id: row.id, hash };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
