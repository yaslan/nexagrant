-- ─────────────────────────────────────────────────────────────────────────────
-- add-interreg-f2-result.sql — FO-188 / TASK-MVRIVTHH6IEGK (M17 Interreg pre-assessment, F2)
--
-- Purpose: two columns the F2 writer (src/modules/m17/server/evaluate.ts) needs and
-- add-interreg-review.sql did not have:
--   • InterregAnalysisResult.programChecks — the programme rules outside the grid
--     (RCO87, CMA, partnership, budget, duration…), one {key, status, note} each.
--   • InterregCriterionMark.evidence — every {quote, location} behind a mark; the
--     existing evidenceQuote / evidenceLocator keep the first one for list views.
--
-- Additive: ADD COLUMN IF NOT EXISTS with a constant default, so existing rows read
-- '[]' and a second run is a no-op. No RLS change: both tables already have their
-- tenant_isolation policy (add-interreg-review.sql, prisma/rls.sql).
-- Rollback: add-interreg-f2-result.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "InterregAnalysisResult" ADD COLUMN IF NOT EXISTS "programChecks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "InterregCriterionMark" ADD COLUMN IF NOT EXISTS "evidence" JSONB NOT NULL DEFAULT '[]';
