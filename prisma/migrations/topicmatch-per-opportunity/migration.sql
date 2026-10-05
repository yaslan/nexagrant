-- TASK-MTQ63RR8Z0G8E — TopicMatch carries the opportunity its G0 evidence belongs to.
--
-- The defect (measured, docs/agent-results/TASK-MTQ63RR8Z0G8E-geli-tirici.md):
--   `TopicMatch` was keyed `@@unique([tenantId, topicId])`, but a G0 score is not a property of
--   a topic. `budgetRoleEconomy` (weight 10) reads `Opportunity.intendedRole` and
--   `researchAndEndUser` (weight 12) reads that opportunity's `ConsortiumSeat` rows, and
--   `Opportunity.topicId` is not unique — so two opportunities on one topic produce two different
--   scores that were written to one row. Measured: coordinator 44.9 and partner 48.23 on the same
--   topic left a single row holding 48.23; the pipeline board (which reads this record) drew
--   "48.23" on BOTH cards while the coordinator's own detail page said 44.9. Same opportunity,
--   two screens, two numbers — CLAUDE.md §7.
--
-- Shape after this migration:
--   • `opportunityId IS NULL`  → the K1 match for a tenant × topic. `fitScore` is topic-level and
--     stays here; this row never carries a G0 score.
--   • `opportunityId` set      → the G0 evidence record for exactly one opportunity: `g0Score` +
--     the per-criterion `breakdown`.
--
-- Uniqueness is `NULLS NOT DISTINCT` (Postgres >= 15, this database runs 16.15), so the K1 row is
-- still one-per-pair even though its `opportunityId` is NULL. Prisma cannot express that, which is
-- why src/lib/scoring/g0-compute.ts reads/writes the K1 row with findFirst/create instead of an
-- upsert on the compound key.
--
-- RLS: no new table. `TopicMatch` already carries the `tenant_isolation` policy from
-- prisma/rls.sql (it is in the tenant-scoped array), and the new column is not a tenant key, so
-- the policy is unchanged. Re-run `pnpm db:rls` + `pnpm rls:check` after applying, as usual.
--
-- Additive and idempotent: every statement is IF NOT EXISTS / IF EXISTS guarded and the backfill
-- only matches rows it has not already converted, so a second run is a no-op. Rollback: down.sql.

-- ── 1. the column ────────────────────────────────────────────────────────────
ALTER TABLE "TopicMatch" ADD COLUMN IF NOT EXISTS "opportunityId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TopicMatch_opportunityId_fkey') THEN
    ALTER TABLE "TopicMatch"
      ADD CONSTRAINT "TopicMatch_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 2. backfill ──────────────────────────────────────────────────────────────
-- A legacy row is a G0 evidence row when its breakdown carries `scoringVersion` (that payload is
-- written by persistG0 and by nothing else). Such a row belongs to *some* opportunity; the only
-- ones that can be attributed honestly are those where the tenant has exactly one live
-- opportunity on that topic. `Opportunity.topicId` holds either a `Topic.id` or a portal
-- identifier, so both are matched — the same rule loadG0Snapshot follows.
-- Each statement below re-derives `legacy` from the current table state, so the four are
-- independent and the file needs no temporary objects (nothing to leak if a run is interrupted).

-- 2a. Pure scorer artifact (fitScore is the placeholder 0, so the row holds no K1 information)
--     with exactly one candidate: the row simply becomes that opportunity's evidence row.
WITH legacy AS (
  SELECT
    tm.id,
    tm."g0Score",
    tm.breakdown,
    COALESCE((tm.breakdown ->> 'g0ScorerPlaceholderFitScore') = 'true', false) AS is_scorer_artifact,
    (
      SELECT array_agg(o.id)
      FROM "Opportunity" o
      WHERE o."tenantId" = tm."tenantId"
        AND o."deletedAt" IS NULL
        AND (o."topicId" = tm."topicId" OR o."topicId" = t.identifier)
    ) AS candidates
  FROM "TopicMatch" tm
  JOIN "Topic" t ON t.id = tm."topicId"
  WHERE tm."opportunityId" IS NULL
    AND tm."g0Score" IS NOT NULL
    AND tm.breakdown ? 'scoringVersion'
)
UPDATE "TopicMatch" tm
SET "opportunityId" = l.candidates[1]
FROM legacy l
WHERE tm.id = l.id AND l.is_scorer_artifact AND array_length(l.candidates, 1) = 1;

-- 2b. A real K1 row (its `fitScore` is a measured match) that also picked up a G0 score: the two
--     are separated — the score moves to a new per-opportunity row, the K1 fit stays topic-level.
--     The new row's id is derived from the old one, so a re-run conflicts on the primary key and
--     inserts nothing.
WITH legacy AS (
  SELECT
    tm.id,
    tm."g0Score",
    tm.breakdown,
    COALESCE((tm.breakdown ->> 'g0ScorerPlaceholderFitScore') = 'true', false) AS is_scorer_artifact,
    (
      SELECT array_agg(o.id)
      FROM "Opportunity" o
      WHERE o."tenantId" = tm."tenantId"
        AND o."deletedAt" IS NULL
        AND (o."topicId" = tm."topicId" OR o."topicId" = t.identifier)
    ) AS candidates
  FROM "TopicMatch" tm
  JOIN "Topic" t ON t.id = tm."topicId"
  WHERE tm."opportunityId" IS NULL
    AND tm."g0Score" IS NOT NULL
    AND tm.breakdown ? 'scoringVersion'
)
INSERT INTO "TopicMatch" ("id", "tenantId", "topicId", "opportunityId", "fitScore", "g0Score", "breakdown", "computedAt")
SELECT
  md5(tm.id || ':' || l.candidates[1]),
  tm."tenantId",
  tm."topicId",
  l.candidates[1],
  0,
  tm."g0Score",
  tm.breakdown,
  tm."computedAt"
FROM "TopicMatch" tm
JOIN legacy l ON l.id = tm.id
WHERE NOT l.is_scorer_artifact AND array_length(l.candidates, 1) = 1
ON CONFLICT DO NOTHING;

WITH legacy AS (
  SELECT
    tm.id,
    tm."g0Score",
    tm.breakdown,
    COALESCE((tm.breakdown ->> 'g0ScorerPlaceholderFitScore') = 'true', false) AS is_scorer_artifact,
    (
      SELECT array_agg(o.id)
      FROM "Opportunity" o
      WHERE o."tenantId" = tm."tenantId"
        AND o."deletedAt" IS NULL
        AND (o."topicId" = tm."topicId" OR o."topicId" = t.identifier)
    ) AS candidates
  FROM "TopicMatch" tm
  JOIN "Topic" t ON t.id = tm."topicId"
  WHERE tm."opportunityId" IS NULL
    AND tm."g0Score" IS NOT NULL
    AND tm.breakdown ? 'scoringVersion'
)
UPDATE "TopicMatch" tm
SET "g0Score" = NULL,
    breakdown = jsonb_build_object(
      'note', 'K1 match row; its G0 score moved to the per-opportunity row (migration topicmatch-per-opportunity)'
    )
FROM legacy l
WHERE tm.id = l.id AND NOT l.is_scorer_artifact AND array_length(l.candidates, 1) = 1;

-- 2c. Not attributable (no live opportunity on that topic, or more than one): the score cannot be
--     said to belong to any opportunity, so it is cleared rather than left on screen under a
--     guess. The row itself is kept — deleting evidence is not this migration's job — and the
--     score is recomputed per opportunity by `pnpm jobs:g0-rescore`.
WITH legacy AS (
  SELECT
    tm.id,
    tm."g0Score",
    tm.breakdown,
    COALESCE((tm.breakdown ->> 'g0ScorerPlaceholderFitScore') = 'true', false) AS is_scorer_artifact,
    (
      SELECT array_agg(o.id)
      FROM "Opportunity" o
      WHERE o."tenantId" = tm."tenantId"
        AND o."deletedAt" IS NULL
        AND (o."topicId" = tm."topicId" OR o."topicId" = t.identifier)
    ) AS candidates
  FROM "TopicMatch" tm
  JOIN "Topic" t ON t.id = tm."topicId"
  WHERE tm."opportunityId" IS NULL
    AND tm."g0Score" IS NOT NULL
    AND tm.breakdown ? 'scoringVersion'
)
UPDATE "TopicMatch" tm
SET "g0Score" = NULL,
    breakdown = tm.breakdown || jsonb_build_object(
      'unattributableG0Score', tm."g0Score",
      'unattributableReason', 'migration topicmatch-per-opportunity: the tenant has ' ||
        COALESCE(array_length(l.candidates, 1), 0) ||
        ' live opportunities on this topic, so the score cannot be attributed to one'
    )
FROM legacy l
WHERE tm.id = l.id AND COALESCE(array_length(l.candidates, 1), 0) <> 1;

-- ── 3. the new key ───────────────────────────────────────────────────────────
-- NULLS NOT DISTINCT keeps "one K1 row per tenant × topic" enforced by the database even though
-- `opportunityId` is NULL on those rows.
DROP INDEX IF EXISTS "TopicMatch_tenantId_topicId_key";

--
-- TASK-MUOEY2GBFHY7U: `prisma db push` runs before this file (ci.yml, RELEASE_CHECKLIST §1) and
-- builds the same-named key from schema.prisma, which cannot say NULLS NOT DISTINCT. `IF NOT
-- EXISTS` then kept that NULLS DISTINCT key and two overlapping K1 recomputes wrote a second
-- (tenant, topic, NULL) row (measured: tests/k1-embeddings.live.test.ts, 9 rows for 6). A key
-- without NULLS NOT DISTINCT is swapped for the right one in one statement, so a failure (existing
-- duplicate pairs) leaves the old key in place and stops the run under ON_ERROR_STOP.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.oid = to_regclass('"TopicMatch_tenantId_topicId_opportunityId_key"') AND NOT i.indnullsnotdistinct
  ) THEN
    DROP INDEX "TopicMatch_tenantId_topicId_opportunityId_key";
    CREATE UNIQUE INDEX "TopicMatch_tenantId_topicId_opportunityId_key"
      ON "TopicMatch" ("tenantId", "topicId", "opportunityId") NULLS NOT DISTINCT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "TopicMatch_tenantId_topicId_opportunityId_key"
  ON "TopicMatch" ("tenantId", "topicId", "opportunityId") NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "TopicMatch_tenantId_opportunityId_idx"
  ON "TopicMatch" ("tenantId", "opportunityId");
