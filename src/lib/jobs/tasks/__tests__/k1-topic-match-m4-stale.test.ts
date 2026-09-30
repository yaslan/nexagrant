import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The work itself is pinned against Postgres in tests/topic-match-nightly.live.test.ts and
// tests/stale-relationship-reminder.live.test.ts; here only the two job wrappers: which moment
// they run on, and which SystemAlert a result turns into.
const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const recomputeAllTopicMatches = vi.fn();
vi.mock('@/lib/scoring/topic-match', () => ({ recomputeAllTopicMatches }));
const sendStaleRelationshipReminders = vi.fn();
vi.mock('@/lib/relationships/stale-reminder', () => ({ sendStaleRelationshipReminders }));
const smtpMailer = vi.fn(() => null);
vi.mock('@/lib/email/mailer', () => ({ smtpMailer }));

const { env } = await import('@/lib/env');
const { k1TopicMatchTask } = await import('../k1-topic-match');
const { m4StaleRelationshipsTask } = await import('../m4-stale-relationships');

const infos: string[] = [];
function helpersFor(attempts = 1, maxAttempts = 5): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '9', attempts, max_attempts: maxAttempts } as unknown as JobHelpers['job'],
    logger: { info: (m: string) => infos.push(m), warn: (m: string) => infos.push(m), error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

const TICK = '2026-10-01T07:00:00.000Z';
const topicResult = (over: Record<string, unknown> = {}) => ({
  tenants: 3, done: 1, noProfileEmbedding: 2, pilotExpired: 0, failed: 0, scored: 4, created: 4, updated: 0,
  unchanged: 0, ineligible: 1, topicsWithoutEmbedding: 0, errors: [], durationMs: 5, ...over,
});
const staleResult = (over: Record<string, unknown> = {}) => ({
  tenants: 2, tenantsPilotExpired: 0, tenantsModuleClosed: 0, tenantsFailed: 0, relationshipsDue: 3,
  relationshipsReminded: 3, skippedUnassigned: 0, skippedNeverContacted: 0, skippedAlreadyReminded: 0,
  skippedRecipient: 0, skippedMailedToday: 0, digestsSent: 1, digestsFailed: 0, errors: [], durationMs: 5, ...over,
});

const realNodeEnv = env.NODE_ENV;
beforeEach(() => {
  alerts.length = 0;
  infos.length = 0;
  recomputeAllTopicMatches.mockReset();
  sendStaleRelationshipReminders.mockReset();
});
afterEach(() => {
  env.NODE_ENV = realNodeEnv;
});

describe('k1-topic-match job', () => {
  it('runs on the cron tick and alerts nothing on a clean run', async () => {
    recomputeAllTopicMatches.mockResolvedValue(topicResult());
    await k1TopicMatchTask({ _cron: { ts: TICK } }, helpersFor());
    expect(recomputeAllTopicMatches).toHaveBeenCalledWith({ now: new Date(TICK) });
    expect(alerts).toEqual([]);
    expect(infos.some((m) => m.includes('"success":true') && m.includes('"created":4'))).toBe(true);
  });

  it('a failed tenant is a warn alert with counts and no tenant id', async () => {
    recomputeAllTopicMatches.mockResolvedValue(topicResult({ failed: 1, errors: [{ tenantId: 't-secret', reason: 'boom' }] }));
    await k1TopicMatchTask({}, helpersFor());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'warn', source: 'k1-topic-match' });
    expect(JSON.stringify(alerts)).not.toContain('t-secret');
    expect(infos.join('\n')).not.toContain('t-secret');
  });

  it('"nothing scorable, no embeddings" is reported in production only', async () => {
    recomputeAllTopicMatches.mockResolvedValue(topicResult({ scored: 0, created: 0, topicsWithoutEmbedding: 1200 }));
    env.NODE_ENV = 'development';
    await k1TopicMatchTask({}, helpersFor());
    expect(alerts).toEqual([]);
    env.NODE_ENV = 'production';
    await k1TopicMatchTask({}, helpersFor());
    expect(alerts.map((a) => a.dedupeKey)).toEqual(['k1-topic-match:no-embeddings']);
  });

  it('topics embedded but no tenant profile is: still "nothing scorable", still reported (İNCELEME-51 Y-2)', async () => {
    recomputeAllTopicMatches.mockResolvedValue(topicResult({ scored: 0, created: 0, topicsWithoutEmbedding: 0, noProfileEmbedding: 3 }));
    env.NODE_ENV = 'production';
    await k1TopicMatchTask({}, helpersFor());
    expect(alerts.map((a) => a.dedupeKey)).toEqual(['k1-topic-match:no-embeddings']);
  });

  it('a thrown run is retried and alerted by the wrapper on the last attempt', async () => {
    recomputeAllTopicMatches.mockRejectedValue(new Error('connection reset'));
    await expect(k1TopicMatchTask({}, helpersFor(5, 5))).rejects.toThrow('connection reset');
    expect(alerts.map((a) => a.dedupeKey)).toEqual(['job-queue:k1-topic-match:exhausted']);
  });
});

describe('m4-stale-relationships job', () => {
  it('runs on the cron tick with the SMTP mailer', async () => {
    sendStaleRelationshipReminders.mockResolvedValue(staleResult());
    await m4StaleRelationshipsTask({ _cron: { ts: TICK } }, helpersFor());
    expect(sendStaleRelationshipReminders).toHaveBeenCalledWith(expect.objectContaining({ now: new Date(TICK), mailer: null }));
    expect(alerts).toEqual([]);
  });

  it('no mail provider: an error SystemAlert in production, none elsewhere; output says why', async () => {
    sendStaleRelationshipReminders.mockResolvedValue(staleResult({ reason: 'no_mail_provider', digestsSent: 0, relationshipsReminded: 0 }));
    env.NODE_ENV = 'development';
    await m4StaleRelationshipsTask({}, helpersFor());
    expect(alerts).toEqual([]);
    expect(infos.some((m) => m.includes('"reason":"no_mail_provider"') && m.includes('"success":false'))).toBe(true);
    env.NODE_ENV = 'production';
    await m4StaleRelationshipsTask({}, helpersFor());
    expect(alerts).toEqual([
      expect.objectContaining({ level: 'error', source: 'm4-stale-relationships', dedupeKey: 'm4-stale-relationships:no-mail-provider' }),
    ]);
  });

  it('a failed digest is a warn with counts only; the address never reaches the alert or the log', async () => {
    sendStaleRelationshipReminders.mockResolvedValue(
      staleResult({ digestsFailed: 1, errors: [{ scope: 'digest', reason: 'smtp:EENVELOPE:550 a@b.test' }] })
    );
    await m4StaleRelationshipsTask({}, helpersFor());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'warn', dedupeKey: 'm4-stale-relationships:failed' });
    expect(JSON.stringify(alerts)).not.toContain('@');
    expect(infos.join('\n')).not.toContain('a@b.test');
    expect(infos.some((m) => m.includes('"reason":"send_failed"'))).toBe(true);
  });
});
