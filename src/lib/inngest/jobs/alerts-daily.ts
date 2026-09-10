import { inngest } from '../client';
import { env } from '@/lib/env';
import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { Resend } from 'resend';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';
import { AlertsDailyOutputSchema, type AlertsDailyOutput } from '../events';
import { parseSavedSearchFilters } from '@/lib/saved-search-filters';

let resend: Resend | null = null;
function getResend(): Resend | null {
  if (!resend && env.RESEND_API_KEY) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * `SavedSearch` carries a bare `tenantId` scalar and declares no `tenant`
 * relation (prisma/schema.prisma). This job used to ask for
 * `include: { tenant: true }`, which Prisma rejects before it ever reaches the
 * database, so every 8 AM run died with a PrismaClientValidationError and not
 * one alert e-mail was ever sent. Nothing read `search.tenant` anyway.
 *
 * Exported so the unit test can hand these exact arguments to the real Prisma
 * client and prove the schema still accepts them — a mocked client cannot
 * catch this class of bug, which is why it survived.
 */
export const SAVED_SEARCH_ALERT_QUERY = {
  where: { notify: true },
  select: { id: true, tenantId: true, name: true, filters: true, lastRunAt: true, createdAt: true },
} as const;

/**
 * Shaped by hand rather than pulled from `Prisma.TopicWhereInput`: this
 * generated client exposes that namespace as a runtime value but not as an
 * importable type under this repo's `moduleResolution: bundler` (`import
 * type { Prisma }` and `import { Prisma }` both fail with "has no exported
 * member 'Prisma'" — reproduced directly with `tsc`, unrelated to this fix).
 * `prisma.topic.count` still checks this object structurally at the call
 * site, so the query is exactly as type-safe as it would be with the
 * generated type.
 */
interface TopicMatchWhere {
  fetchedAt: { gt: Date };
  status?: { in: Array<'FORTHCOMING' | 'OPEN' | 'CLOSED'> };
  OR?: Array<
    | { title: { contains: string; mode: 'insensitive' } }
    | { description: { contains: string; mode: 'insensitive' } }
  >;
}

/**
 * New-match count for one saved search: Topics first seen (`fetchedAt`) after
 * `since`, narrowed by whatever of `q`/`status` the filters carry. `since` is
 * `lastRunAt`, or `createdAt` on a search's first run — never "the beginning
 * of time" — so a brand-new saved search does not report every historical
 * topic as a "new" match on day one.
 */
export function matchCountQuery(filters: unknown, since: Date): { where: TopicMatchWhere } {
  const parsed = parseSavedSearchFilters(filters);
  const where: TopicMatchWhere = { fetchedAt: { gt: since } };

  if (parsed.status && parsed.status.length > 0) {
    where.status = { in: parsed.status };
  }
  if (parsed.q) {
    where.OR = [
      { title: { contains: parsed.q, mode: 'insensitive' } },
      { description: { contains: parsed.q, mode: 'insensitive' } },
    ];
  }

  return { where };
}

/**
 * The owner lookup, keyed by the scalar `tenantId` — the same "separate query
 * by scalar id" shape M2 uses where no relation exists. Only the address is
 * selected; the job has no use for the rest of the user row.
 */
export function ownerEmailQuery(tenantId: string) {
  return {
    where: { tenantId, role: 'TENANT_OWNER' },
    select: { user: { select: { email: true } } },
  } as const;
}

/**
 * `withTenant`'s shape, injected so a caller can run this loop over a
 * connection other than the singleton. The test needs exactly that: locally
 * `prisma` connects as `fabrika` (SUPERUSER + BYPASSRLS), which sees every
 * tenant's rows no matter what the loop scoped to, so isolation asserted
 * through it proves nothing. `withTenantOn(rlsClient, ...)` (src/lib/db.ts)
 * satisfies this type over the NOBYPASSRLS `fabrika_app` role, where the
 * policies actually apply.
 */
export type TenantRunner = <T>(
  tenantId: string,
  callback: (tx: TenantTx) => Promise<T>
) => Promise<T>;

/**
 * One saved search as `fetch-saved-searches` hands it back. `step.run`
 * memoises through JSON, so on a replay the timestamps arrive as ISO strings
 * rather than `Date`s; `new Date(...)` accepts both.
 */
export interface SavedSearchAlertRow {
  id: string;
  tenantId: string;
  name: string;
  filters: unknown;
  lastRunAt: Date | string | null;
  createdAt: Date | string;
}

export interface SavedSearchAlertResult {
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  errors: Array<{ searchId: string; reason: string }>;
}

/** Advance `lastRunAt` so the next run's `since` starts where this one stopped. */
function touchLastRun(tx: TenantTx, searchId: string) {
  return tx.savedSearch.update({ where: { id: searchId }, data: { lastRunAt: new Date() } });
}

/**
 * The per-search loop, lifted out of the inngest handler so it can be run
 * against a real two-tenant fixture (the pattern `sweepOrphanTenantAlerts`
 * already sets in alerts-sweep.ts).
 *
 * TASK-MTVR8KK92G0GA: every tenant-scoped read and write in here used to go
 * through the bare `prisma` singleton. That is invisible today only because
 * the local role bypasses RLS — under the production `fabrika_app` role the
 * owner lookup returns nothing and both `lastRunAt` writes raise
 * "record not found", and a cron job nobody watches would have gone on
 * reporting `emailsFailed` into the void.
 */
export async function sendSavedSearchAlerts(
  savedSearches: SavedSearchAlertRow[],
  runTenant: TenantRunner = withTenant
): Promise<SavedSearchAlertResult> {
  let emailsSent = 0;
  let emailsFailed = 0;
  let emailsSkipped = 0;
  const errors: Array<{ searchId: string; reason: string }> = [];

  for (const search of savedSearches) {
    // Bound once per iteration and used everywhere below. `for...of` with
    // `const` already gives each iteration its own binding, so this is not a
    // fix — it is a guard against the edit that would break it: reaching for a
    // tenant id that outlived the iteration does not crash here, it writes one
    // tenant's row under another tenant's scope.
    const { id: searchId, tenantId, name } = search;

    try {
      const ownerEmail = await runTenant(tenantId, async (tx) => {
        const owners = await tx.membership.findMany(ownerEmailQuery(tenantId));
        return owners[0]?.user?.email;
      });

      if (!ownerEmail) {
        emailsFailed++;
        errors.push({ searchId, reason: 'no_owner_email' });
        continue;
      }

      const since = new Date(search.lastRunAt ?? search.createdAt);

      // Deliberately NOT tenant-scoped, and the second such exception in this
      // file (the other is the fan-out in `fetch-saved-searches`). `Topic` is
      // the shared CORDIS catalogue: it carries no `tenantId` column and the
      // database has row security switched off on it — 0 policies, measured on
      // the live schema 2026-09-10. Counting one tenant's matches necessarily
      // reads every tenant's topics, because "this tenant's topics" does not
      // exist. Wrapping it would narrow nothing and cost a transaction.
      const matchCount = await prisma.topic.count(matchCountQuery(search.filters, since));

      // No new matches: skip the send entirely rather than mail a "(no new)"
      // notification every morning. `lastRunAt` still advances — this was a
      // real check, not a failure.
      if (matchCount === 0) {
        await runTenant(tenantId, (tx) => touchLastRun(tx, searchId));
        emailsSkipped++;
        continue;
      }

      const subject = `New Call Opportunities: ${name} (${matchCount} new)`;
      const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://app.fabrika.io';
      const html = `
            <h2>FonBridge Saved Search Alert</h2>
            <p>Hi there,</p>
            <p>We checked for new opportunities matching your saved search <strong>${name}</strong>.</p>
            <p>Found <strong>${matchCount} new opportunities</strong>. <a href="${appUrl}/calls?search=${searchId}">View them now</a></p>
            <p>Happy hunting!<br/>FonBridge Team</p>
          `;

      // Outside the tenant transaction on purpose: `runTenant` opens a real
      // Postgres transaction, and holding one across a network round trip to
      // Resend would pin a connection for the length of the send.
      const resendClient = getResend();
      if (resendClient && env.RESEND_API_KEY) {
        await resendClient.emails.send({
          from: env.EMAIL_FROM || 'FonBridge <no-reply@fabrika.app>',
          to: [ownerEmail],
          subject,
          html,
        });
      }

      await runTenant(tenantId, (tx) => touchLastRun(tx, searchId));

      emailsSent++;
    } catch (error) {
      // Covers the owner lookup and the match-count query too: a broken query
      // here must not silently report 0 matches and skip the send as if the
      // check had actually run clean (CLAUDE.md rule 6).
      emailsFailed++;
      errors.push({ searchId, reason: errorMessage(error) });
    }
  }

  return { emailsSent, emailsFailed, emailsSkipped, errors };
}

/**
 * Alerts Daily — 8 AM UTC
 * Sends saved search alerts to subscribed users.
 *
 * Per-search e-mail failures do not stop the run, but they are no longer
 * swallowed: the run ends by writing a `SystemAlert` naming the failed
 * searches (CLAUDE.md rule 6). A failure to read the searches at all is
 * alerted and then re-thrown — reporting `totalSearches: 0` for a query that
 * never ran would be a false success.
 */
export const alertsDaily = inngest.createFunction(
  { id: 'alerts-daily', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }): Promise<AlertsDailyOutput> => {
    const savedSearches = await step.run('fetch-saved-searches', async () => {
      try {
        return await prisma.savedSearch.findMany(SAVED_SEARCH_ALERT_QUERY);
      } catch (error) {
        await recordAlert({
          level: 'error',
          source: 'alerts-daily',
          message: `Saved-search fetch failed: ${errorMessage(error)}`,
        });
        throw error;
      }
    });

    // One step for the whole loop, as in credits-monthly-grant: counters
    // mutated across many memoized steps would replay back to zero.
    const result = await step.run('send-alerts', async () => sendSavedSearchAlerts(savedSearches));

    if (result.errors.length > 0) {
      // `SystemAlert` has no tenant isolation (see system-alert.ts): row ids
      // only, never the tenant id or the address the mail was going to.
      await step.run('record-failure-alert', async () => {
        await recordAlert({
          level: 'warn',
          source: 'alerts-daily',
          message: `${result.emailsFailed} of ${savedSearches.length} saved-search alerts failed`,
          meta: {
            emailsSent: result.emailsSent,
            emailsFailed: result.emailsFailed,
            failures: result.errors,
          },
        });
      });
    }

    const output: AlertsDailyOutput = {
      success: true,
      totalSearches: savedSearches.length,
      emailsSent: result.emailsSent,
      emailsFailed: result.emailsFailed,
      emailsSkipped: result.emailsSkipped,
    };

    if (result.errors.length > 0) {
      output.errors = result.errors;
    }

    return AlertsDailyOutputSchema.parse(output);
  }
);
