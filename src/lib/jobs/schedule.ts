import { parseCronItem, type ParsedCronItem, type TimestampDigest } from 'graphile-worker';

/**
 * The one list of scheduled jobs (ADR-0008 §2, §6.5).
 *
 * The crontab the worker registers, the task list it serves and the missed-tick
 * check of `job-queue-health` are all derived from this table, so a job cannot
 * be scheduled without being checked, or checked under a different schedule.
 *
 * Cron expressions are UTC and are the ones the old hosted scheduler used, unchanged.
 * `maxAttempts: 5` keeps the old scheduler's default (1 try + 4 retries); graphile-worker
 * backs off exponentially between them (`exp(min(attempt, 10))` seconds).
 * `fill` is how far back a tick missed while no worker was up is still run
 * (once, with its own tick time in `payload._cron.ts`); a tick older than that
 * is not run, and `job-queue-health` reports it (ADR-0008 Ö-3).
 * `queue` serialises a job across every worker instance — the old
 * `concurrency: { limit: 1 }`.
 */
export const JOB_IDS = [
  'k1-daily-calls',
  'k2-monthly-cordis',
  'alerts-daily',
  'credits-monthly-grant',
  'm4-weekly-summary',
  'users-scheduled-deletion',
  'feedback-weekly-digest',
  'alerts-sweep',
  'stripe-event-cleanup',
  'agency-monthly-report',
  'invitation-cleanup',
  'public-lead-cleanup',
  'public-lead-stuck',
  'expert-prereg-cleanup',
  'k1-topic-match',
  'k1-embeddings',
  'm4-stale-relationships',
  'job-queue-health',
  'alerts-ops-digest',
  'notifications-retention',
  'evidence-expiring',
  'partner-search',
  'partner-search-retention',
  'm17-text-retention',
  'm17-stale-runs',
  'notification-email-instant',
  'notification-email-weekly',
  // FO-384 B2: queued by a PIC change, never on a cron. Not in SCHEDULE (no tick, no missed-tick check).
  'g0-rescore-tenant',
  // FO-396: queued by a PIC lookup that failed to reach the EU register, never on a cron.
  'pic-registry-retry',
] as const;

export type JobId = (typeof JOB_IDS)[number];

export interface ScheduledJob {
  id: JobId;
  cron: string;
  maxAttempts: number;
  /** graphile-worker backfill window (`6h`, `1d`); undefined = never backfill. */
  fill?: string;
  queue?: string;
  /** False for the health check itself: a missed health tick hides nothing. */
  missedTickAlert: boolean;
}

export const SCHEDULE: readonly ScheduledJob[] = [
  { id: 'k1-daily-calls', cron: '0 2 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  { id: 'k2-monthly-cordis', cron: '0 4 1 * *', maxAttempts: 5, fill: '1d', missedTickAlert: true },
  { id: 'alerts-daily', cron: '0 8 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  { id: 'credits-monthly-grant', cron: '0 6 1 * *', maxAttempts: 5, fill: '1d', missedTickAlert: true },
  { id: 'm4-weekly-summary', cron: '0 9 * * 1', maxAttempts: 5, fill: '1d', missedTickAlert: true },
  { id: 'users-scheduled-deletion', cron: '0 3 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  { id: 'feedback-weekly-digest', cron: '0 6 * * 1', maxAttempts: 5, fill: '1d', missedTickAlert: true },
  { id: 'alerts-sweep', cron: '15 4 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  { id: 'stripe-event-cleanup', cron: '0 2 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  {
    id: 'agency-monthly-report',
    cron: '0 6 1 * *',
    maxAttempts: 5,
    fill: '1d',
    queue: 'agency',
    missedTickAlert: true,
  },
  { id: 'invitation-cleanup', cron: '30 3 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  { id: 'public-lead-cleanup', cron: '45 3 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  // FO-50: pre-registrations older than EXPERT_PREREG_RETENTION_DAYS (365).
  { id: 'expert-prereg-cleanup', cron: '55 3 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  // ADR-0011 §3.4: notifications older than 90 days.
  { id: 'notifications-retention', cron: '50 3 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  // FO-195: M17 document text, 30 days from each slot's own upload (ADR-0010 §M17).
  { id: 'm17-text-retention', cron: '35 3 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  // ADR-0011 §2.2: 08:20 Istanbul, verified documents within the badge's EXPIRING_SOON window.
  { id: 'evidence-expiring', cron: '20 5 * * *', maxAttempts: 5, fill: '6h', missedTickAlert: true },
  // Between k1-daily-calls (02:00) and k1-topic-match (02:30): embeds the topics
  // that landed or changed and the profiles that changed. Own queue: a profile
  // save queued by hand waits for the sweep instead of paying for the same row.
  {
    id: 'k1-embeddings',
    cron: '15 2 * * *',
    maxAttempts: 5,
    fill: '6h',
    queue: 'k1-embeddings',
    missedTickAlert: true,
  },
  // After k1-daily-calls (02:00) has landed the day's topics. Own queue: a job
  // added by hand waits for the cron's run instead of racing it on the same rows.
  {
    id: 'k1-topic-match',
    cron: '30 2 * * *',
    maxAttempts: 5,
    fill: '6h',
    queue: 'k1-topic-match',
    missedTickAlert: true,
  },
  // 10:00 Istanbul. Own queue for the same reason: two overlapping runs could
  // both mail one owner before either stamped the rows.
  {
    id: 'm4-stale-relationships',
    cron: '0 7 * * *',
    maxAttempts: 5,
    fill: '6h',
    queue: 'm4-stale-relationships',
    missedTickAlert: true,
  },
  // FO-60: after k1-topic-match (02:30), so the topics are final. Own queue; the
  // flag `partner_search_ingestion_enabled` (default OFF) makes the run a no-op.
  {
    id: 'partner-search',
    cron: '0 3 * * *',
    maxAttempts: 5,
    fill: '6h',
    queue: 'partner-search',
    missedTickAlert: true,
  },
  // FO-65 F4: 15 minutes after the ingestion. Same queue, so the two never overlap.
  {
    id: 'partner-search-retention',
    cron: '15 3 * * *',
    maxAttempts: 5,
    fill: '6h',
    queue: 'partner-search',
    missedTickAlert: true,
  },
  { id: 'job-queue-health', cron: '5 * * * *', maxAttempts: 3, missedTickAlert: false },
  // FO-246: hourly at :20, after job-queue-health (:05) has written its alerts. Own
  // queue: two overlapping runs would both mail the same rows before either stamped them.
  // No missed-tick alert and no backfill, like job-queue-health: the digest catches up on
  // its own (the next tick mails every row still unstamped), so a missed tick loses nothing.
  {
    id: 'alerts-ops-digest',
    cron: '20 * * * *',
    maxAttempts: 3,
    queue: 'alerts-ops-digest',
    missedTickAlert: false,
  },
  // FO-317: every 15 minutes, gives back the credit reservation of an M17 run whose process
  // died while ANALYZING (src/modules/m17/server/stale-runs.ts). Own queue, so a job added by
  // hand waits for the cron's run. No missed-tick alert and no backfill: the next tick releases
  // every run still stale, so a missed tick loses nothing.
  {
    id: 'm17-stale-runs',
    cron: '*/15 * * * *',
    maxAttempts: 3,
    queue: 'm17-stale-runs',
    missedTickAlert: false,
  },
  // NG-182: every 15 minutes, one SystemAlert per routed PublicLead that has no copy in its tenant
  // after PUBLIC_LEAD_STUCK_AFTER_MINUTES (src/lib/leads/stuck-leads.ts). Read-only on the leads. Own
  // queue, so a job added by hand waits for the cron's run. No missed-tick alert and no backfill: the
  // next tick finds every lead still stuck, so a missed tick loses nothing.
  {
    id: 'public-lead-stuck',
    cron: '*/15 * * * *',
    maxAttempts: 3,
    queue: 'public-lead-stuck',
    missedTickAlert: false,
  },
  // NG-131 (NG-43 Ö-1): the notification e-mail outbox. Both modes share one queue, so a cron
  // run and a job added by hand never overlap on a worker, and the outbox claims its rows besides
  // (src/lib/notifications/email-outbox.ts), which also holds across two queues or two databases'
  // workers. INSTANT every 5 minutes, no missed-tick alert and no backfill: the next tick sends
  // every row still queued. WEEKLY Mondays 07:00 UTC (10:00 Istanbul), backfilled one day.
  {
    id: 'notification-email-instant',
    cron: '*/5 * * * *',
    maxAttempts: 3,
    queue: 'notification-email',
    missedTickAlert: false,
  },
  {
    id: 'notification-email-weekly',
    cron: '0 7 * * 1',
    maxAttempts: 5,
    fill: '1d',
    queue: 'notification-email',
    missedTickAlert: true,
  },
];

/** The queue a job runs in (also used for jobs added by hand, so they serialise with the cron's). */
export function queueFor(id: JobId): string | undefined {
  return SCHEDULE.find((j) => j.id === id)?.queue;
}

/** graphile-worker crontab text for {@link SCHEDULE}. The identifier is the job id. */
export function crontab(schedule: readonly ScheduledJob[] = SCHEDULE): string {
  return (
    schedule
      .map((j) => {
        const opts = [`id=${j.id}`, `max=${j.maxAttempts}`];
        if (j.fill) opts.push(`fill=${j.fill}`);
        if (j.queue) opts.push(`queue=${j.queue}`);
        return `${j.cron} ${j.id} ?${opts.join('&')}`;
      })
      .join('\n') + '\n'
  );
}

/** Same digest graphile-worker's scheduler uses (UTC fields). */
function digest(ts: Date): TimestampDigest {
  return {
    min: ts.getUTCMinutes(),
    hour: ts.getUTCHours(),
    date: ts.getUTCDate(),
    month: ts.getUTCMonth() + 1,
    dow: ts.getUTCDay(),
  };
}

const MINUTE = 60_000;
/** Longest gap between two ticks in {@link SCHEDULE} is a month; look back a little further. */
const LOOKBACK_MINUTES = 32 * 24 * 60;

function matcherFor(job: ScheduledJob): ParsedCronItem['match'] {
  return parseCronItem({ task: job.id, identifier: job.id, match: job.cron }).match;
}

/**
 * The latest tick of `job` at or before `at` (whole minutes, UTC), or null when
 * there is none in the look-back window.
 */
export function previousTick(job: ScheduledJob, at: Date): Date | null {
  const match = matcherFor(job);
  const t = new Date(Math.floor(at.getTime() / MINUTE) * MINUTE);
  for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
    if (match(digest(t))) return new Date(t);
    t.setTime(t.getTime() - MINUTE);
  }
  return null;
}

/** A row of `graphile_worker._private_known_crontabs`. */
export interface KnownCrontab {
  identifier: string;
  known_since: Date;
  last_execution: Date | null;
}

export interface MissedTick {
  id: JobId;
  tick: Date;
  lastExecution: Date | null;
}

/**
 * Ticks that should have run and did not (ADR-0008 Ö-3).
 *
 * graphile-worker writes `last_execution` when it *schedules* a tick, live or
 * backfilled. So when the latest due tick (older than `graceMinutes`, which
 * covers a scheduler that is a few seconds late) is after `last_execution`, no
 * worker scheduled it — the worker was down for longer than the job's `fill`
 * window, or the cron was switched off. A tick before `known_since` is not
 * counted: the crontab did not exist yet.
 */
export function findMissedTicks(
  known: readonly KnownCrontab[],
  now: Date,
  graceMinutes = 10,
  schedule: readonly ScheduledJob[] = SCHEDULE
): MissedTick[] {
  const byId = new Map(known.map((k) => [k.identifier, k]));
  const cutoff = new Date(now.getTime() - graceMinutes * MINUTE);
  const missed: MissedTick[] = [];
  for (const job of schedule) {
    if (!job.missedTickAlert) continue;
    const row = byId.get(job.id);
    if (!row) continue; // never registered here: nothing was expected of it yet
    const tick = previousTick(job, cutoff);
    if (!tick || tick <= new Date(row.known_since)) continue;
    const last = row.last_execution ? new Date(row.last_execution) : null;
    if (!last || last < tick) missed.push({ id: job.id, tick, lastExecution: last });
  }
  return missed;
}
