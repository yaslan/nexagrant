'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/tenant';
import { logger } from '@/lib/logger';

/**
 * Resolve / reopen an operator alert.
 *
 * The admin layout already 404s a non-platform-admin, but a server action is its
 * own HTTP entry point — anyone who can guess the action id can POST to it — so
 * the role is checked again here. Same pattern as the feedback triage actions.
 */

const ResolveSchema = z.object({
  id: z.string().min(1).max(200),
  resolved: z.boolean(),
});

export interface AlertActionResult {
  ok: boolean;
  error?: string;
  /** ISO timestamp when the alert is now resolved, null when reopened. */
  resolvedAt?: string | null;
}

export async function setAlertResolved(input: unknown): Promise<AlertActionResult> {
  await requirePlatformAdmin();

  const parsed = ResolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation_failed' };

  const { id, resolved } = parsed.data;
  const resolvedAt = resolved ? new Date() : null;

  try {
    await prisma.systemAlert.update({ where: { id }, data: { resolvedAt } });
  } catch (error) {
    logger.error('system alert resolve failed', error, { alertId: id });
    return { ok: false, error: 'update_failed' };
  }

  revalidatePath('/[locale]/admin/alerts', 'page');
  return { ok: true, resolvedAt: resolvedAt ? resolvedAt.toISOString() : null };
}
