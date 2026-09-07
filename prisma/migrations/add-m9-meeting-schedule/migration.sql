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
