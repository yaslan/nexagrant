import { TtlCache } from '@/lib/ttl-cache';
import type { SediaSearchResult } from '@/lib/adapters/sedia';

/**
 * SEDIA search pages for `/api/cagrilar`, kept for a few minutes (FO-204). The
 * calls page asks the same question again on every visit and filter toggle;
 * without this each repeat paid for a SEDIA call. Only the English SEDIA page is
 * stored, never the translation: translation is redone per request from its own
 * per-text cache (translation.ts), so a quota outage cannot freeze the list in
 * English. The page holds no user data, so one entry serves every signed-in member.
 */
export const CAGRILAR_CACHE_TTL_MS = 10 * 60_000;
export const CAGRILAR_CACHE_MAX_ENTRIES = 200;

export const cagrilarCache = new TtlCache<SediaSearchResult>(
  CAGRILAR_CACHE_TTL_MS,
  CAGRILAR_CACHE_MAX_ENTRIES
);

/** The parts of a search that decide what SEDIA returns. */
export interface SearchKeyParts {
  text: string;
  page: number;
  pageSize: number;
  lang: string;
  statuses: string[];
  frameworkProgrammes: string[];
  types: string[];
}

/**
 * One key per question. Text is trimmed and lower-cased, and the list filters are
 * sorted and upper-cased, so `Health`, ` health ` and a reordered status list hit
 * the same entry (FO-204 B-2).
 */
export function searchCacheKey(parts: SearchKeyParts): string {
  const list = (values: string[]) => values.map((v) => v.trim().toUpperCase()).sort();
  return JSON.stringify([
    parts.text.trim().toLowerCase(),
    parts.page,
    parts.pageSize,
    parts.lang.trim().toLowerCase(),
    list(parts.statuses),
    list(parts.frameworkProgrammes),
    list(parts.types),
  ]);
}

const inFlight = new Map<string, Promise<SediaSearchResult>>();

/**
 * Concurrent identical searches share one SEDIA call: the first one starts it,
 * the rest await the same promise (FO-204 B-3). It is forgotten once it settles.
 */
export function shareInFlight(
  key: string,
  run: () => Promise<SediaSearchResult>
): Promise<SediaSearchResult> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const started = run().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}
