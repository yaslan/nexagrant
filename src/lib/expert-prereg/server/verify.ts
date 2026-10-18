import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { hashSecretToken } from '@/lib/secret-token';
import { EXPERT_PREREG_LOCK_KEY, FOUNDER_SEAT_LIMIT } from './constants';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — the link in the verification mail. Verifies the
 * expert and, for the first {@link FOUNDER_SEAT_LIMIT} verified experts, gives
 * the founder number ("Kurucu Uzman").
 *
 * The number is taken under the same advisory lock as the registration, and the
 * column is unique, so two verifications cannot share a number. A second click on
 * a link that already verified the expert changes nothing and answers the same
 * way: the number does not move.
 */

export type VerifyResult =
  | { ok: true; founderNumber: number | null; locale: string }
  | { ok: false; error: 'expired' | 'invalid'; locale: string };

const SHAPE = /^[0-9a-f]{64}$/;

export async function verifyExpertPreRegistration(
  rawToken: string | null,
  options: { now?: Date; db?: PrismaClient } = {}
): Promise<VerifyResult> {
  if (!rawToken || !SHAPE.test(rawToken)) return { ok: false, error: 'invalid', locale: 'tr' };

  const now = options.now ?? new Date();
  const db = options.db ?? prisma;
  const tokenHash = hashSecretToken(rawToken);

  // FO-45: the table is RLS-on with the system_scope policy only, so the lookup and the write run in the 'public-intake' scope.
  return withSystemScopeOn(db, 'public-intake', 'expert-prereg.verify', async (tx): Promise<VerifyResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXPERT_PREREG_LOCK_KEY})`;

    const row = await tx.expertPreRegistration.findUnique({
      where: { verifyTokenHash: tokenHash },
      select: {
        id: true,
        locale: true,
        status: true,
        emailVerifiedAt: true,
        founderNumber: true,
        verifyTokenExpiresAt: true,
      },
    });
    if (!row || row.status === 'disabled') return { ok: false, error: 'invalid', locale: 'tr' };

    // Already verified: answer as the first click did, change nothing.
    if (row.emailVerifiedAt) return { ok: true, founderNumber: row.founderNumber, locale: row.locale };

    if (!row.verifyTokenExpiresAt || row.verifyTokenExpiresAt <= now) {
      return { ok: false, error: 'expired', locale: row.locale };
    }

    const top = await tx.expertPreRegistration.aggregate({ _max: { founderNumber: true } });
    const next = (top._max.founderNumber ?? 0) + 1;
    const founderNumber = next <= FOUNDER_SEAT_LIMIT ? next : null;

    await tx.expertPreRegistration.update({
      where: { id: row.id },
      data: { emailVerifiedAt: now, status: 'verified', founderNumber },
    });
    return { ok: true, founderNumber, locale: row.locale };
  });
}
