/**
 * In-process, per-user fixed-window limiter (İNCELEME-75 D-3, TASK-MUNY0O53ITDU4).
 *
 * `/api/cagrilar` turns one request into up to five SEDIA calls and, for
 * `lang=tr`, a translation call per title against a quota that belongs to the
 * server's outbound address — so one signed-in client in a loop could switch
 * Turkish translation off for every tenant. This caps each user.
 *
 * Interim by design: the counters live in one process, so N instances allow N
 * times the limit, and a restart forgets them. That bound is known and finite,
 * which unbounded is not. The durable version is a DB window per user (the
 * ApiKey rate window in src/lib/api-auth.ts is the pattern), which needs a
 * migration and is its own card.
 */
export class UserWindowLimiter {
  private windowStart = -Infinity;
  private counts = new Map<string, number>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000
  ) {}

  /**
   * Counts one request for `userId`. Returns null when it may proceed, or the
   * whole seconds until the window resets when it may not. All counters reset
   * together, so the map never outgrows one window's users.
   */
  take(userId: string, now = Date.now()): number | null {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.counts.clear();
    }
    const n = (this.counts.get(userId) ?? 0) + 1;
    this.counts.set(userId, n);
    if (n <= this.limit) return null;
    return Math.max(1, Math.ceil((this.windowStart + this.windowMs - now) / 1000));
  }
}
