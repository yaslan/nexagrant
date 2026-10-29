import { TtlCache } from '@/lib/ttl-cache';

/**
 * Answers to `/api/cagrilar` searches, kept for a few minutes (FO-204). The
 * calls page asks the same question again on every visit and filter toggle;
 * without this each repeat paid for a SEDIA call and a translation batch. An
 * answer holds no user data, so one entry serves every signed-in member.
 */
export const CAGRILAR_CACHE_TTL_MS = 10 * 60_000;
export const CAGRILAR_CACHE_MAX_ENTRIES = 200;

export const cagrilarCache = new TtlCache<Record<string, unknown>>(
  CAGRILAR_CACHE_TTL_MS,
  CAGRILAR_CACHE_MAX_ENTRIES
);
