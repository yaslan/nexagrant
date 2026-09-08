import { inngest } from '../client';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
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
    const result = await step.run('send-alerts', async () => {
      let emailsSent = 0;
      let emailsFailed = 0;
      let emailsSkipped = 0;
      const errors: Array<{ searchId: string; reason: string }> = [];

      for (const search of savedSearches) {
        try {
          const owners = await prisma.membership.findMany(ownerEmailQuery(search.tenantId));

          const ownerEmail = owners[0]?.user?.email;
          if (!ownerEmail) {
            emailsFailed++;
            errors.push({ searchId: search.id, reason: 'no_owner_email' });
            continue;
          }

          // `step.run` hands back the JSON it memoised, so the two timestamps
          // arrive as ISO strings, not `Date`s — re-hydrate before the query.
          const since = new Date(search.lastRunAt ?? search.createdAt);
          const matchCount = await prisma.topic.count(matchCountQuery(search.filters, since));

          // No new matches: skip the send entirely rather than mail a "(no new)"
          // notification every morning. `lastRunAt` still advances below — this
          // was a real check, not a failure.
          if (matchCount === 0) {
            await prisma.savedSearch.update({
              where: { id: search.id },
              data: { lastRunAt: new Date() },
            });
            emailsSkipped++;
            continue;
          }

          const subject = `New Call Opportunities: ${search.name} (${matchCount} new)`;
          const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://app.fabrika.io';
          const html = `
            <h2>Fabrika Saved Search Alert</h2>
            <p>Hi there,</p>
            <p>We checked for new opportunities matching your saved search <strong>${search.name}</strong>.</p>
            <p>Found <strong>${matchCount} new opportunities</strong>. <a href="${appUrl}/calls?search=${search.id}">View them now</a></p>
            <p>Happy hunting!<br/>Fabrika Team</p>
          `;

          const resendClient = getResend();
          if (resendClient && env.RESEND_API_KEY) {
            await resendClient.emails.send({
              from: env.EMAIL_FROM || 'Fabrika <no-reply@fabrika.app>',
              to: [ownerEmail],
              subject,
              html,
            });
          }

          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { lastRunAt: new Date() },
          });

          emailsSent++;
        } catch (error) {
          // Covers the owner lookup and the match-count query too: a broken
          // query here must not silently report 0 matches and skip the send
          // as if the check had actually run clean (CLAUDE.md rule 6).
          emailsFailed++;
          errors.push({ searchId: search.id, reason: errorMessage(error) });
        }
      }

      return { emailsSent, emailsFailed, emailsSkipped, errors };
    });

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
