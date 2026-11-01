import type { PrismaClient } from '@prisma/client';
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

/** The one method the writer needs; a full PrismaClient satisfies it. */
export type PlatformSettingOwnerDb = Pick<PrismaClient, '$executeRaw'>;

/**
 * The only write path for the flag (FO-65 F2). `set_platform_setting`
 * (platform-setting-write-guard.sql) writes the row and an AuditEvent in one call,
 * and only its owner may call it: `ownerDb` is a client on the owner connection
 * (`createDbClient(<owner url>)`), never the app's `prisma` — as `fabrika_app` the
 * call fails with 42501. `actorId` is the signed-in admin's User id from the session
 * (`requirePlatformAdmin()`); the function refuses a blank one and any id that is
 * not a live platform admin, so the audit row cannot name someone made up.
 */
export async function setPartnerSearchIngestionFlag(
  ownerDb: PlatformSettingOwnerDb,
  enabled: boolean,
  actorId: string
): Promise<void> {
  if (actorId.trim() === '') throw new Error('setPartnerSearchIngestionFlag: actorId is required');
  await ownerDb.$executeRaw`SELECT public.set_platform_setting(${PARTNER_SEARCH_FLAG_KEY}, ${JSON.stringify(enabled)}::jsonb, ${actorId})`;
}
