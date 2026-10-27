'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { errorCode, errorMessage } from '@/lib/errors';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { logger } from '@/lib/logger';
import { withSystemScope } from '@/lib/system-scope';
import { requirePlatformAdmin } from '@/lib/tenant';
import {
  isPartnerSearchIngestionEnabled,
  setPartnerSearchIngestionFlag,
} from '@/modules/m1/server/partner-search/flag';
import {
  refreshOrganisationFlags,
  runPartnerSearchIngestion,
} from '@/modules/m1/server/partner-search/ingestor';
import { announcementsOfUnmatched, parsePic } from './linking';

/**
 * Partner Search ingestion console (FO-64 / PS-K6).
 *
 * The ingestor is called, never re-implemented here: a full run is the same
 * `partner-search` job the 03:00 UTC schedule queues, and a topic re-fetch is
 * `runPartnerSearchIngestion` restricted to one topic. The admin layout 404s a
 * non-platform-admin, but each action is its own HTTP entry point, so the role
 * is checked again. Every refusal is a literal code: the result goes back to
 * the browser (tests/api/api-error-body-guard.test.ts).
 */

const PAGE = '/[locale]/admin/partner-search';

// SEDIA topic identifiers: "HORIZON-CL4-2027-01-MAT-PROD-22", "LIFE-2026-SAP-ENV".
const TopicSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

const FlagSchema = z.object({ enabled: z.boolean() });
const ResolveSchema = z.object({ id: z.string().min(1).max(200), pic: z.string().max(40) });

export type RunNowResult =
  | { ok: true; added: boolean }
  | { ok: false; error: 'flag_off' | 'enqueue_failed' };

export type RefetchResult =
  | { ok: true; runId: string; status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; created: number; updated: number; withdrawn: number }
  | { ok: false; error: 'validation_failed' | 'flag_off' | 'topic_not_found' | 'run_failed' };

export type FlagResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: 'validation_failed' | 'owner_connection_required' | 'save_failed' };

export type ResolveResult =
  | { ok: true; pic: string; linkedAnnouncements: number }
  | {
      ok: false;
      error: 'validation_failed' | 'invalid_pic' | 'organization_not_found' | 'not_found' | 'already_resolved' | 'save_failed';
    };

/** Platform-admin audit row: tenantId NULL, so it is written under system scope. */
async function audit(actorId: string, type: string, target: string, data: Record<string, unknown>) {
  await withSystemScope('platform-admin', `admin-partner-search.${type}`, (tx) =>
    tx.auditEvent.create({ data: { actorId, type, target, data: data as object } })
  );
}

/** "Run now": queue one full run on the job queue; the worker writes the IngestionRun row. */
export async function runPartnerSearchNow(): Promise<RunNowResult> {
  const { userId } = await requirePlatformAdmin();
  // With the flag off the job is a no-op that writes no run row; say so instead of queueing it.
  if (!(await isPartnerSearchIngestionEnabled())) return { ok: false, error: 'flag_off' };
  try {
    const { added } = await enqueueJob('partner-search', {});
    await audit(userId, 'partner_search.run.requested', 'partner-search', { added });
    revalidatePath(PAGE, 'page');
    return { ok: true, added };
  } catch (error) {
    logger.error('[admin-partner-search] enqueue failed', error);
    return { ok: false, error: 'enqueue_failed' };
  }
}

/** Topic re-fetch: one OPEN/FORTHCOMING topic, run in the request (one topic is a few calls). */
export async function refetchPartnerSearchTopic(input: unknown): Promise<RefetchResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = TopicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation_failed' };
  const topicIdentifier = parsed.data;

  const topic = await prisma.topic.findFirst({
    where: { identifier: topicIdentifier, status: { in: ['OPEN', 'FORTHCOMING'] } },
    select: { identifier: true },
  });
  if (!topic) return { ok: false, error: 'topic_not_found' };

  try {
    const outcome = await runPartnerSearchIngestion({ trigger: 'MANUAL', topicIdentifiers: [topic.identifier] });
    if (outcome.kind === 'skipped') return { ok: false, error: 'flag_off' };
    await audit(userId, 'partner_search.topic.refetched', topic.identifier, { runId: outcome.runId, status: outcome.status });
    revalidatePath(PAGE, 'page');
    const { created, updated, withdrawn } = outcome.summary;
    return { ok: true, runId: outcome.runId, status: outcome.status, created, updated, withdrawn };
  } catch (error) {
    logger.error('[admin-partner-search] topic re-fetch failed', error, { topicIdentifier });
    return { ok: false, error: 'run_failed' };
  }
}

/**
 * The global flag. `set_platform_setting` re-checks that the actor is a live platform
 * admin and writes the AuditEvent in the same call, so this action writes no audit row
 * of its own. It needs the owner connection: on a `fabrika_app` DATABASE_URL it fails
 * closed with 42501 and the flag stays as it was.
 */
export async function setPartnerSearchFlag(input: unknown): Promise<FlagResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = FlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation_failed' };
  try {
    await setPartnerSearchIngestionFlag(prisma, parsed.data.enabled, userId);
  } catch (error) {
    logger.error('[admin-partner-search] flag write failed', error);
    // Postgres 42501: not the owner connection. The driver adapter puts the SQLSTATE in the message.
    if (errorCode(error) === '42501' || /42501|permission denied/i.test(errorMessage(error, ''))) {
      return { ok: false, error: 'owner_connection_required' };
    }
    return { ok: false, error: 'save_failed' };
  }
  revalidatePath(PAGE, 'page');
  return { ok: true, enabled: await isPartnerSearchIngestionEnabled() };
}

class ResolveRefusal extends Error {
  constructor(readonly code: 'not_found' | 'already_resolved') {
    super(code);
  }
}

/**
 * Manual PIC link for one unmatched organisation: sets `resolvedPic`, links its
 * stored announcements to the CORDIS organisation and writes the AuditEvent, in one
 * transaction. The organisation's announcement flags are then recomputed by the
 * ingestor's own `refreshOrganisationFlags`.
 */
export async function resolveUnmatchedOrganization(input: unknown): Promise<ResolveResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = ResolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation_failed' };
  const pic = parsePic(parsed.data.pic);
  if (!pic) return { ok: false, error: 'invalid_pic' };

  const organisation = await prisma.cordisOrganization.findUnique({
    where: { organisationId: pic },
    select: { organisationId: true, name: true },
  });
  if (!organisation) return { ok: false, error: 'organization_not_found' };

  let linked: number;
  try {
    linked = await withSystemScope('platform-admin', 'admin-partner-search.resolve', async (tx) => {
      const unmatched = await tx.unmatchedOrganization.findUnique({ where: { id: parsed.data.id } });
      if (!unmatched) throw new ResolveRefusal('not_found');
      if (unmatched.resolvedPic) throw new ResolveRefusal('already_resolved');

      const candidates = await tx.partnerSearchAnnouncement.findMany({
        where: { organizationPic: null, country: unmatched.country },
        select: { id: true, organizationName: true, country: true },
      });
      const ids = announcementsOfUnmatched(unmatched, candidates).map((a) => a.id);

      // Conditional claim: two admins linking the same row at once must not both win.
      const claimed = await tx.unmatchedOrganization.updateMany({
        where: { id: unmatched.id, resolvedPic: null },
        data: { resolvedPic: pic },
      });
      if (claimed.count === 0) throw new ResolveRefusal('already_resolved');
      if (ids.length > 0) {
        await tx.partnerSearchAnnouncement.updateMany({
          where: { id: { in: ids }, organizationPic: null },
          data: { organizationPic: pic },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          type: 'partner_search.unmatched.resolved',
          target: unmatched.id,
          data: {
            matchKey: unmatched.matchKey,
            name: unmatched.name,
            portalPic: unmatched.pic,
            resolvedPic: pic,
            cordisName: organisation.name,
            linkedAnnouncements: ids.length,
          },
        },
      });
      return ids.length;
    });
  } catch (error) {
    if (error instanceof ResolveRefusal) {
      if (error.code === 'not_found') return { ok: false, error: 'not_found' };
      return { ok: false, error: 'already_resolved' };
    }
    logger.error('[admin-partner-search] manual PIC link failed', error);
    return { ok: false, error: 'save_failed' };
  }

  await refreshOrganisationFlags(new Set([pic]));
  revalidatePath(PAGE, 'page');
  return { ok: true, pic, linkedAnnouncements: linked };
}
