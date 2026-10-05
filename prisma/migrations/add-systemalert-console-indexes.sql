-- ─────────────────────────────────────────────────────────────────────────────
-- add-systemalert-console-indexes.sql — TASK-MTQUN8VV6DK8C
--
-- Purpose: /[locale]/admin/alerts lists SystemAlert newest-first and filters by
-- level, source and "unresolved only". The table had no index at all, so every
-- render was a sequential scan plus a sort. These three cover the console's
-- access paths. `level` is low-cardinality (3 values) and is filtered in the
-- same pass, so it gets no index of its own.
--
-- Idempotency: IF NOT EXISTS throughout — purely ADDITIVE, nothing dropped.
-- Rollback: prisma/migrations/add-systemalert-console-indexes.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "SystemAlert_createdAt_idx"            ON "SystemAlert" ("createdAt");
CREATE INDEX IF NOT EXISTS "SystemAlert_source_createdAt_idx"     ON "SystemAlert" ("source", "createdAt");
CREATE INDEX IF NOT EXISTS "SystemAlert_resolvedAt_createdAt_idx" ON "SystemAlert" ("resolvedAt", "createdAt");
