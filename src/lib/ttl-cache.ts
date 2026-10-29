/**
 * In-process cache whose entries expire `ttlMs` after they were written and
 * which holds at most `maxEntries` keys (FO-204). When it is full the oldest
 * key goes first: Map keeps insertion order, and a rewrite moves the key to
 * the back.
 *
 * Like {@link UserWindowLimiter}, the state lives in one process, so every
 * instance keeps its own copy and a restart empties it. That is fine for data
 * that is public and cheap to refetch.
 */
export class TtlCache<V> {
  private entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
