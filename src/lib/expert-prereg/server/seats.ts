import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { FOUNDER_SEAT_LIMIT } from './constants';
import { lastFounderNumberGiven } from './founder-counter';

/**
 * How many founder numbers are still free: the limit minus the last number
 * given (the founder counter, FO-50), never below zero. The same source as the
 * verification's next number (verify.ts), so the strip and the numbering cannot
 * disagree, and the one-year purge does not move it. FO-19
 * (TASK-MVBIXPP33UK1B); the landing page's seat strip reads it.
 */
export async function getRemainingFounderSeats(db: PrismaClient = prisma): Promise<number> {
  // A count, not a row: the one answer the landing page may see from this table (FO-45).
  const given = await withSystemScopeOn(db, 'platform-aggregate', 'expert-prereg.seats', lastFounderNumberGiven);
  return Math.max(0, FOUNDER_SEAT_LIMIT - given);
}
