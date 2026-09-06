---
name: k1-adapter-pattern
description: K1 adapter implementation pattern — pagination, validation, schema drift detection
metadata:
  type: project
---

# K1 Adapter Pattern — Implementation Notes

**Completed:** 2026-09-06 (TASK-MTPVBDRYNYM0C)

## Adapter Architecture

Each K1 adapter (SEDIA, Eurostars, TÜBİTAK) follows a standard pattern:

```ts
export class XyzAdapter {
  async fetchTopics(): Promise<XyzTopic[]>
}
```

### Key Decisions Made

1. **Pagination Loop** — fetch multiple pages up to `maxPages` limit
   - SEDIA: API supports `pageNumber` and `pageSize` parameters
   - Eurostars/TÜBİTAK: HTML parsing (multi-pattern regex for resilience)
   - Continue pagination until empty result or max pages

2. **Enrichment API Calls** — fetch additional details per topic
   - SEDIA topicDetails: `https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/{id}.json`
   - Use 5-second timeout to avoid blocking; non-blocking failure (return null on timeout)
   - Fallback: use base search API data if enrichment fails

3. **Eligibility Detection** — "EU/EEA/CH only" → `eligibility.restricted: 'EU_EEA_CH_ONLY'`
   - Regex patterns for text-based detection: `/EU\/EEA\/CH only/i`, `/restricted to European/i`
   - Check in both API search results + enrichment data
   - Set `eligibility.notes` to detected text for audit trail

4. **Error Handling**
   - Network errors: log, create SystemAlert, return empty array (don't crash job)
   - Per-item parse errors: log, skip item, continue with others
   - Zero-result warnings: create SystemAlert for debugging

5. **Zod Validation** — SediaTopicSchema, EurostarsTopicSchema, TubitakTopicSchema
   - safeParse() to validate; if schema fails, fallback to raw object as SediaTopic
   - This tolerates minor field shifts without breaking the job

## K1 Daily Job Integration

**File:** `src/lib/inngest/jobs/k1-daily-calls.ts`

### Schema Drift Detection

**Implementation:** SHA256 hash comparison
```ts
const rawHash = crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex');
const lastFetch = await prisma.rawFetch.findFirst({
  where: { source, key: t.identifier },
  orderBy: { fetchedAt: 'desc' }
});
if (lastFetch && lastFetch.hash !== rawHash) {
  // Alert: API schema likely changed
  await prisma.systemAlert.create({ ... });
}
```

**Why:** If API adds/removes fields or changes data types, hash will differ. Alerts ops team to investigate raw payload in RawFetch table.

**Note:** Hash detects *total data* changes; doesn't directly detect type mutations (that's Zod's job via safeParse fallback).

### Storage Pattern

Every topic is stored in RawFetch for audit:
```ts
await prisma.rawFetch.create({
  data: {
    source: 'sedia' | 'eurostars' | 'tubitak',
    key: t.identifier,
    hash: rawHash,
    payload: t,  // raw JSON for forensics
  }
});
```

Retention: keep all (no purge currently) or add TTL in future.

## HTML Parsing Resilience

Eurostars and TÜBİTAK rely on HTML parsing (no public API). Risks:

- **Site structure changes:** Regex patterns break; return 0 topics
- **Mitigation:** 
  1. Multiple regex patterns per call ID format (EUROSTARS-2024-01, EUREKA-2024, etc.)
  2. SystemAlert when 0 calls returned
  3. Fallback mechanism: if parsing fails 3 days in a row, escalate to manual review

## Pagination Best Practice

**Loop structure:**
```ts
let pageNumber = 1;
const maxPages = 10;  // Limit to prevent infinite loops
while (pageNumber <= maxPages) {
  const data = await fetch(...pageNumber...);
  if (data.results.length === 0) break;  // No more data
  topics.push(...data.results);
  pageNumber++;
}
```

**Why maxPages:** API may have pagination bugs or return identical pages forever; protect with upper limit.

## Next Adapters (K2–K6)

- **K2 (CORDIS):** Uses DuckDB + Parquet; different pattern (worker-based, not Inngest)
- **K3 (Horizon Dashboard):** Imports pre-computed stats (no live API); flat file or CSV upload
- **K4 (TBD):** Follow same pattern as K1 if live API exists
- **K5 (TBD):** Follow same pattern as K1 if live API exists
- **K6 (AI):** Not a data adapter; LLM integration pattern (separate)

**Reuse:** `src/lib/adapters/sedia.ts` structure → template for new adapters
