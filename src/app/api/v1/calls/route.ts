import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { z } from 'zod';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { isEuroCurrency, toDecimalString } from '@/lib/money';

/**
 * One row of GET /api/v1/calls.
 *
 * The published field *names* are unchanged; what changed is that they now
 * carry real data. This route used to select `topicId`, `programme`,
 * `deadlineAt`, `deadlineTz`, `budgetTotalEur` and `fundingType` off
 * `prisma.topic` — none of which are columns on `model Topic` in
 * prisma/schema.prisma. The query therefore threw on every request, the
 * try/catch swallowed the throw, and the endpoint answered 200 OK with four
 * hard-coded demo calls (a €180m "EIC Accelerator", a TÜBİTAK 1707 row) that no
 * database ever produced. That is exactly what CLAUDE.md rule 7 forbids. The
 * demo array is gone: rows come from Topic → Call → Programme, and a query
 * failure is reported as a failure.
 */
interface CallApiRow {
  /** `Topic.id` — the cuid, stable across re-imports of the same topic. */
  id: string;
  /** `Topic.identifier` — the published topic code, e.g. HORIZON-CL5-2026-D4-01. */
  topicId: string;
  title: string;
  /** `Programme.name` reached through the topic's call. */
  programme: string | null;
  /** `Call.callIdentifier` — the call the topic belongs to. */
  callId: string | null;
  /** `Topic.nextDeadlineAt`, ISO-8601 in UTC (CLAUDE.md rule 10). */
  deadlineAt: string | null;
  /** The IANA zone the deadline is published in, read out of `Topic.deadlines`. */
  deadlineTz: string | null;
  /** `Call.budgetCents` in euro — the whole call's budget. `null` when `Call.currency` is not euro (NG-163). */
  budgetTotalEur: number | null;
  /**
   * `Topic.budgetPerProjectCents` in euro — the indicative grant per project. `null` when the
   * topic's call is not in euro (`Call.currency`, e.g. TRY for TR agency calls): the amount is
   * never reported as euro and never converted (NG-163).
   */
  budgetPerProjectEur: number | null;
  /**
   * No column in prisma/schema.prisma carries a grant *range*; only the demo
   * rows ever had one ("€4,000,000 - €6,000,000"). The key stays so the
   * response shape does not change, the value says "not recorded" rather than
   * inventing a band. Use `budgetPerProjectEur` for the real figure.
   */
  expectedGrantRangeEur: string | null;
  /** `Topic.typeOfAction` — RIA / IA / CSA. */
  fundingType: string | null;
  /** `Topic.status` — OPEN | FORTHCOMING | CLOSED. */
  status: string;
}

/** The Topic columns this endpoint reads, with its call and programme. */
interface TopicWithCall {
  id: string;
  identifier: string;
  title: string;
  status: string;
  typeOfAction: string | null;
  nextDeadlineAt: Date | null;
  deadlines: unknown;
  budgetPerProjectCents: bigint | null;
  call: {
    callIdentifier: string;
    budgetCents: bigint | null;
    currency: string | null;
    programme: { name: string } | null;
  } | null;
}

/** `Topic.status` is an enum; anything else is a client error, not an empty page. */
const StatusSchema = z.enum(['OPEN', 'FORTHCOMING', 'CLOSED']);

/**
 * The zone a topic's deadline is published in.
 *
 * `Topic.deadlines` is `[{ stage, at, tz }]`; `nextDeadlineAt` is one of those
 * `at` values hoisted into a column for indexing. Match on the instant so a
 * two-stage topic reports the zone of the stage that is actually next, and fall
 * back to the first stage that names one. Never defaults to "Europe/Brussels":
 * a guessed timezone silently moves a deadline by an hour.
 */
function deadlineTimezone(deadlines: unknown, nextDeadlineAt: Date | null): string | null {
  if (!Array.isArray(deadlines)) return null;
  const stages = deadlines.filter(
    (d): d is { at?: unknown; tz?: unknown } => typeof d === 'object' && d !== null
  );
  const target = nextDeadlineAt?.getTime();
  const matched =
    target === undefined
      ? undefined
      : stages.find((d) => typeof d.at === 'string' && new Date(d.at).getTime() === target);
  const withTz = matched ?? stages.find((d) => typeof d.tz === 'string' && d.tz.trim() !== '');
  const tz = withTz?.tz;
  return typeof tz === 'string' && tz.trim() !== '' ? tz.trim() : null;
}

/**
 * Minor units → euro, through src/lib/money.ts (CLAUDE.md rule 9): no ad-hoc
 * `/ 100` on an amount. `null` for an amount too large to be an exact JSON
 * number — better absent than silently rounded.
 */
function centsToEur(cents: bigint | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (cents > limit || cents < -limit) return null;
  return Number(toDecimalString(Number(cents), 'EUR'));
}

function toApiRow(topic: TopicWithCall): CallApiRow {
  return {
    id: topic.id,
    topicId: topic.identifier,
    title: topic.title,
    programme: topic.call?.programme?.name ?? null,
    callId: topic.call?.callIdentifier ?? null,
    // DB is UTC (CLAUDE.md rule 10); `deadlineTz` says which local clock the
    // published cut-off is quoted on.
    deadlineAt: topic.nextDeadlineAt ? new Date(topic.nextDeadlineAt).toISOString() : null,
    deadlineTz: deadlineTimezone(topic.deadlines, topic.nextDeadlineAt),
    budgetTotalEur: isEuroCurrency(topic.call?.currency) ? centsToEur(topic.call?.budgetCents ?? null) : null,
    budgetPerProjectEur: isEuroCurrency(topic.call?.currency) ? centsToEur(topic.budgetPerProjectCents) : null,
    expectedGrantRangeEur: null,
    fundingType: topic.typeOfAction,
    status: topic.status,
  };
}

export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req, { action: 'search_calls', feature: 'call_search' });
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const programme = searchParams.get('programme')?.trim(); // "Horizon Europe", "HE", "Eurostars", "TUBITAK"
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

  const statusParam = searchParams.get('status')?.trim().toUpperCase() || 'OPEN';
  const parsedStatus = StatusSchema.safeParse(statusParam);
  if (!parsedStatus.success) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: `Unknown status "${statusParam}". Expected one of: ${StatusSchema.options.join(', ')}.`,
        code: 'CALLS_INVALID_STATUS',
      },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = { status: parsedStatus.data };
  if (programme) {
    // The programme lives on the topic's call, not on the topic. Accept either
    // the short id ("HE") or a fragment of the display name ("Horizon").
    where.call = {
      programme: {
        OR: [
          { id: programme.toUpperCase() },
          { name: { contains: programme, mode: 'insensitive' } },
        ],
      },
    };
  }

  let topics: TopicWithCall[];
  try {
    // Call / Topic / Programme are shared reference data: none of them carries
    // a `tenantId` (Call and Topic are listed as SYSTEM_WIDE in
    // scripts/rls-models.ts), so no tenant_isolation policy applies and
    // `withTenant` would have nothing to scope. The API key decides *who may
    // ask*; `meta.authenticatedTenant` records the caller.
    topics = await prisma.topic.findMany({
      where,
      take: limit,
      orderBy: { nextDeadlineAt: 'asc' },
      select: {
        id: true,
        identifier: true,
        title: true,
        status: true,
        typeOfAction: true,
        nextDeadlineAt: true,
        deadlines: true,
        budgetPerProjectCents: true,
        call: {
          select: {
            callIdentifier: true,
            budgetCents: true,
            currency: true,
            programme: { select: { name: true } },
          },
        },
      },
    });
  } catch (e) {
    // Reported, not replaced with invented rows. The old catch fell through to
    // a demo array, which is how a permanently broken query shipped unnoticed.
    console.error(`[/api/v1/calls] query failed: ${errorMessage(e)}`);
    return internalError({
      error: 'Internal Server Error',
      message: 'Call lookup failed.',
      code: 'CALLS_QUERY_FAILED',
    });
  }

  const calls = topics.map(toApiRow);

  return NextResponse.json({
    success: true,
    meta: {
      // The number of rows in `data`, not the number of matches in the database.
      total: calls.length,
      limit,
      statusFilter: parsedStatus.data,
      programmeFilter: programme || null,
      queriedAt: new Date().toISOString(),
      authenticatedTenant: authRes.data.tenantId,
    },
    data: calls,
  });
}
