-- Create M9 MeetingBrief table if not exists
CREATE TABLE IF NOT EXISTS "MeetingBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL UNIQUE,
    "partnerName" TEXT,
    "content" TEXT NOT NULL,
    "meetingScheduledAt" TIMESTAMP(3),
    "meetingScheduledTz" TEXT NOT NULL DEFAULT 'Europe/Brussels',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MeetingBrief_tenantId" ON "MeetingBrief"("tenantId");

-- Row level security, stated here as well as in prisma/rls.sql. prisma/rls.sql
-- stays the source of truth and re-creates this on every `pnpm db:rls`; it is
-- repeated here so applying this file alone leaves no window where the table
-- exists without a policy. This one is folder-shaped, so `prisma migrate
-- deploy` applies it — but `pnpm db:rls` is still a separate step afterwards,
-- and until it runs `MeetingBrief` held one tenant's briefs with row level
-- security not even enabled: measured, a tenant-a connection read tenant-b's
-- brief (TASK-MTVDSSJTZCY4T). Wording is byte-identical to prisma/rls.sql:19-21.
--
-- This file was edited after being applied, so the sha256 recorded for it in
-- `_prisma_migrations` is now stale. Harmless here and re-runnable (the block
-- is idempotent): `prisma migrate deploy` and `migrate status` on 7.10 do not
-- compare the checksum, and `migrate dev` cannot replay this history anyway —
-- add-m10 references `FollowupDoc`, which no migration creates (P3006/P3018,
-- reproducible on an empty database with an untouched tree).
ALTER TABLE "MeetingBrief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingBrief" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MeetingBrief";
CREATE POLICY tenant_isolation ON "MeetingBrief"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
