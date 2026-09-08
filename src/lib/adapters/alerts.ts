import type { JsonObject } from '@/types/json';
import { prisma } from '../db';
import { logger } from '../logger';

/**
 * SystemAlert helpers shared by the K1 adapters.
 *
 * Per `docs/ARCHITECTURE.md` §4 and CLAUDE.md rule 6, an upstream contract change
 * raises an alert but never breaks the job — writing the alert is best-effort.
 */
export async function createAdapterAlert(
  source: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: JsonObject
): Promise<void> {
  await prisma.systemAlert
    .create({ data: { level, source: `${source}_adapter`, message, meta: meta ?? undefined } })
    .catch(() => {});
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
    { drift: unique.slice(0, 10) }
  );
}
