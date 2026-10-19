import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { FOUNDER_SEAT_LIMIT } from './constants';

/**
 * How many founder numbers are still free: the limit minus the highest number
 * given, never below zero. The same source as the verification's next number
 * (verify.ts), so the strip and the numbering cannot disagree. FO-19
 * (TASK-MVBIXPP33UK1B); the landing page's seat strip reads it.
 */
export async function getRemainingFounderSeats(db: PrismaClient = prisma): Promise<number> {
  // A count, not a row: the one answer the landing page may see from this table (FO-45).
  const top = await withSystemScopeOn(db, 'platform-aggregate', 'expert-prereg.seats', (tx) =>
    tx.expertPreRegistration.aggregate({ _max: { founderNumber: true } })
  );
  return Math.max(0, FOUNDER_SEAT_LIMIT - (top._max.founderNumber ?? 0));
}
