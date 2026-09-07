-- CalendarConnection: tenant-scoped calendar provider tokens and sync state

CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL, -- 'google' | 'outlook' | 'ics'
    "externalId" TEXT,
    "accessToken" TEXT, -- TODO: encrypt in production with CALENDAR_ENCRYPTION_KEY
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("tenantId", "userId", "provider")
);

CREATE INDEX "CalendarConnection_tenantId" ON "CalendarConnection"("tenantId");
CREATE INDEX "CalendarConnection_userId" ON "CalendarConnection"("userId");

-- RLS policy: users see only their own connections within their tenant
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "CalendarConnection" AS RESTRICTIVE
    USING (
        (current_setting('app.tenant_id')::text != '' AND "tenantId" = current_setting('app.tenant_id')::text)
        OR (SELECT current_setting('is_system')::boolean)
    );
