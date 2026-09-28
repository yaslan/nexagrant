-- CalendarConnection: tenant-scoped calendar provider tokens and sync state
--
-- Idempotent (TASK-MULU7SAA4EPP8): re-running this file, or running it on a
-- database whose table `prisma db push` already built, is a no-op.

CREATE TABLE IF NOT EXISTS "CalendarConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL, -- 'google' | 'outlook' | 'ics'
    "externalId" TEXT,
    "accessToken" TEXT, -- Plaintext, unpopulated today (no OAuth writer yet). Must be encrypted
                         -- before Google/Outlook OAuth ships — docs/ROADMAP.md open decision #12.
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("tenantId", "userId", "provider")
);

CREATE INDEX IF NOT EXISTS "CalendarConnection_tenantId" ON "CalendarConnection"("tenantId");
CREATE INDEX IF NOT EXISTS "CalendarConnection_userId" ON "CalendarConnection"("userId");

-- RLS policy: users see only their own connections within their tenant
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarConnection" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "CalendarConnection";

CREATE POLICY tenant_isolation ON "CalendarConnection"
    USING ("tenantId" = current_setting('app.tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
