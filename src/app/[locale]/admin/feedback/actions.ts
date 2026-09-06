'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Triage actions for the platform-admin feedback board.
 *
 * The layout above already gates the route on platform admin, but a server
 * action is its own HTTP entry point — anyone who can guess the action id can
 * call it. The check is repeated here on purpose.
 */
async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  // auth.ts adds isPlatformAdmin/role in its session callback; next-auth's own
  // Session type does not declare them.
  const claims = session as unknown as
    | { isPlatformAdmin?: boolean; role?: string; user?: { isPlatformAdmin?: boolean } }
    | null;
  const isPlatformAdmin = Boolean(
    claims?.isPlatformAdmin ||
      claims?.user?.isPlatformAdmin ||
      claims?.role === 'SUPER_ADMIN' ||
      claims?.role === 'PLATFORM_ADMIN'
  );
  if (!session?.user?.id || !isPlatformAdmin) {
    throw new Error('Unauthorized: platform admin required.');
  }
  return { userId: session.user.id };
}

const TriageSchema = z.object({
  id: z.string().min(1),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  status: z.enum(['NEW', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX']),
  note: z.string().trim().max(1000).optional(),
});

export interface TriageActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Apply a human triage decision. `autoPriority` is never touched — the gap
 * between it and `priority` is how the rule engine gets calibrated.
 */
export async function triageFeedbackEntry(input: unknown): Promise<TriageActionResult> {
  const { userId } = await requirePlatformAdmin();

  const parsed = TriageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed' };
  }

  const { id, priority, status, note } = parsed.data;

  try {
    await prisma.feedback.update({
      where: { id },
      data: {
        priority: priority as never,
        status: status as never,
        triageNote: note && note.length > 0 ? note : null,
        triagedById: userId,
        triagedAt: new Date(),
        resolvedAt: status === 'RESOLVED' || status === 'WONT_FIX' ? new Date() : null,
      },
    });
  } catch (error) {
    logger.error('feedback triage update failed', error, { feedbackId: id });
    return { ok: false, error: 'update_failed' };
  }

  revalidatePath('/[locale]/admin/feedback', 'page');
  return { ok: true };
}
