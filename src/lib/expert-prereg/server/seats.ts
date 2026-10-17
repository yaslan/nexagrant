import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { FOUNDER_SEAT_LIMIT } from './constants';

/**
 * How many founder numbers are still free: the limit minus the verified experts
 * who already hold one, never below zero. FO-19 (TASK-MVBIXPP33UK1B); the
 * landing page's seat strip reads it.
 */
export async function getRemainingFounderSeats(db: PrismaClient = prisma): Promise<number> {
  const taken = await db.expertPreRegistration.count({ where: { founderNumber: { not: null } } });
  return Math.max(0, FOUNDER_SEAT_LIMIT - taken);
}
