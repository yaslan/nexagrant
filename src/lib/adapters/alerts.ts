import type { JsonObject } from '@/types/json';
import { logger } from '../logger';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * SystemAlert helpers shared by the K1 adapters.
 *
 * Per `docs/ARCHITECTURE.md` §4 and CLAUDE.md rule 6, an upstream contract change
 * raises an alert but never breaks the job — writing the alert is best-effort.
 *
 * These used to call `prisma.systemAlert.create` directly, which meant the K1
 * adapters were writing operator-visible alerts *around* the single writer in
 * src/lib/observability/system-alert.ts: no deduplication of any kind and no
 * meta sanitising. Going through `recordAlert` restores both. `recordAlert`
 * keeps the same best-effort contract — it never throws — so the `.catch`
 * this replaced is not needed.
 */
export async function createAdapterAlert(
  source: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: JsonObject,
  /**
   * Stable identity within this adapter's alert source. The `source` column
   * already separates `sedia_adapter` from `tubitak_adapter`, so a key only
   * has to say *which* of that adapter's alerts this is — never which run or
   * which attempt raised it.
   */
  dedupeKey?: string
): Promise<void> {
  await recordAlert({
    level,
    source: `${source}_adapter`,
    message,
    meta,
    dedupeKey,
  });
}

/** Raise a SystemAlert when an upstream payload no longer matches its contract. */
export async function reportSchemaDrift(source: string, drift: string[]): Promise<void> {
  if (drift.length === 0) return;
  const unique = Array.from(new Set(drift));
  logger.warn(`[${source}] schema drift detected`, {
    count: unique.length,
    sample: unique.slice(0, 3),
  });
  await createAdapterAlert(
    source,
    'warn',
    `API schema change detected for ${source}: ${unique.length} distinct issue(s). First: ${unique
      .slice(0, 3)
      .join(' | ')}`,
    { drift: unique.slice(0, 10) },
    // The message carries a count and a three-item sample, and `meta` carries
    // a ten-item one; all three move as the upstream payload keeps changing,
    // so this alert re-opened rather than folded. That this adapter's contract
    // has drifted is one standing item until it is mapped and resolved.
    `${source}:schema-drift`
  );
}
