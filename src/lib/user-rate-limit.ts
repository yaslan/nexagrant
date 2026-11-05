/**
 * In-process, per-user sliding-window limiter (İNCELEME-75 D-3, TASK-MUNY0O53ITDU4; FO-389).
 *
 * `/api/cagrilar` turns one request into up to five SEDIA calls and, for
 * `lang=tr`, a translation call per title against a quota that belongs to the
 * server's outbound address — so one signed-in client in a loop could switch
 * Turkish translation off for every tenant. This caps each user.
 *
 * Sliding, not fixed (FO-389, FO-386 finding 2): a fixed window lets a user spend
 * `limit` at the end of one window and `limit` more at the start of the next, twice
 * the limit in a second. Each user's last `limit` request times are kept instead, and
 * a request passes only if fewer than `limit` fall inside the last `windowMs`, at
 * any moment. A refused request is not recorded, so a loop against the limit does
 * not push its own release further out.
 *
 * Interim by design: the counters live in one process, so N instances allow N
 * times the limit, and a restart forgets them. That bound is known and finite,
 * which unbounded is not. Where an attacker can multiply the limit by opening accounts,
 * a database total stands behind it (src/lib/pic-budget.ts, FO-389).
 */
export class UserWindowLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = -Infinity;

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000
  ) {}

  /**
   * Counts one request for `userId`. Returns null when it may proceed, or the
   * whole seconds until the oldest counted request leaves the window when it may not.
   */
  take(userId: string, now = Date.now()): number | null {
    this.sweep(now);
    const since = now - this.windowMs;
    const live = (this.hits.get(userId) ?? []).filter((t) => t > since);
    if (live.length >= this.limit) {
      this.hits.set(userId, live);
      const oldest = live[0] ?? now;
      return Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
    }
    live.push(now);
    this.hits.set(userId, live);
    return null;
  }

  /**
   * Gives back the request `take` counted for `userId` at `at`. For a request that failed on our side
   * before it did what it was counted for: the user did nothing wrong and must not lose the allowance.
   * No effect when the request already left the window (or the process restarted).
   */
  refund(userId: string, at: number): void {
    const times = this.hits.get(userId);
    const i = times ? times.lastIndexOf(at) : -1;
    if (times && i >= 0) times.splice(i, 1);
  }

  /** At most once a window, drops users whose newest request has left it, so the map stays one window wide. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const since = now - this.windowMs;
    for (const [id, times] of this.hits) {
      if ((times[times.length - 1] ?? -Infinity) <= since) this.hits.delete(id);
    }
  }
}
