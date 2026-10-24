import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Global switch for the partner-search ingestor (FO-60 / TASK-MVCH2J271U5VY).
 *
 * Stored as a row in `PlatformSetting` (migration add-platform-setting.sql), not in
 * the environment: an operator flips it without a deploy. Default OFF — a missing
 * row, a non-boolean value, or a failed read all mean OFF. The ingestor is a no-op
 * while this returns false.
 */
export const PARTNER_SEARCH_FLAG_KEY = 'partner_search_ingestion_enabled';

export async function isPartnerSearchIngestionEnabled(): Promise<boolean> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: PARTNER_SEARCH_FLAG_KEY },
      select: { value: true },
    });
    return row?.value === true;
  } catch (error) {
    // A flag we cannot read is a flag that is off: never ingest on a guess.
    logger.error('[partner-search] could not read ingestion flag; treating as OFF', error);
    return false;
  }
}
