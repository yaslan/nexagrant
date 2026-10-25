-- ─────────────────────────────────────────────────────────────────────────────
-- add-partner-search.sql — FO-58 / TASK-MVCH1YZXDOED (Partner Search K1 data model)
--
-- Purpose: storage for Funding & Tenders Portal partner-search announcements
-- (discovery: docs/agent-results/TASK-MVCGPI6V3RM1F-be-fb.md). Nothing reads or
-- writes these tables yet; the ingestor is K2.
--
-- Shape:
--   • PartnerSearchAnnouncement, PartnerProfileSnapshot, PartnerSearchIngestionRun,
--     UnmatchedOrganization, PartnerSearchTopicStat → global reference data like
--     CORDIS: no tenantId, no policy, SYSTEM_WIDE in scripts/rls-models.ts. RLS is
--     DISABLEd right after each CREATE TABLE (Supabase ensure_rls; CHECK 4c).
--   • Person (Person Profile) announcements are never stored as rows: GDPR, see
--     the discovery report §3. PartnerSearchTopicStat keeps an anonymous count only.
--   • PartnerSearchQuotaUsage → tenant-scoped (Discover queries per month):
--     strict tenant_isolation in this file, in the wording of prisma/rls.sql (CHECK 4b).
--   • CordisOrganization gets three nullable/defaulted columns. ADD COLUMN with a
--     constant default is metadata-only on PG 11+: no row is rewritten, no CORDIS
--     value changes.
--   • FK topicIdentifier → Topic.identifier ON DELETE CASCADE: an announcement
--     only exists for a topic the K1 calls sync knows about.
--
-- No CHECK constraints: a CHECK inside CREATE TABLE IF NOT EXISTS is lost on a
-- database whose table `prisma db push` built first (same note as add-blog-post.sql).
-- The 500-character limit is VARCHAR(500), which Prisma declares too.
--
-- Idempotency: enums in DO … duplicate_object, tables/indexes IF NOT EXISTS,
-- columns ADD COLUMN IF NOT EXISTS, FKs guarded by pg_constraint, policy
-- DROP-then-CREATE. A second run, or a run after `prisma db push`, changes nothing.
-- Index and constraint names are Prisma's own. Purely ADDITIVE.
-- Rollback: prisma/migrations/add-partner-search.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PartnerSearchAnnouncementType" AS ENUM ('EXPERTISE_REQUEST','EXPERTISE_OFFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartnerSearchOrgType" AS ENUM ('HES','REC','PRC','PUB','OTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartnerSearchSource" AS ENUM ('PORTAL_API','TOPIC_HTML');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartnerSearchRunTrigger" AS ENUM ('FULL','INCREMENTAL','MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartnerSearchRunStatus" AS ENUM ('RUNNING','SUCCESS','PARTIAL','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CordisOrganization: additive flags maintained by the partner-search ingestor.
ALTER TABLE "CordisOrganization" ADD COLUMN IF NOT EXISTS "hasActiveAnnouncements" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CordisOrganization" ADD COLUMN IF NOT EXISTS "lastAnnouncementAt" TIMESTAMP(3);
ALTER TABLE "CordisOrganization" ADD COLUMN IF NOT EXISTS "portalProfileFetchedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PartnerSearchAnnouncement" (
  "id"               TEXT NOT NULL,
  "externalId"       TEXT NOT NULL,
  "topicIdentifier"  TEXT NOT NULL,
  "callIdentifier"   TEXT,
  "type"             "PartnerSearchAnnouncementType" NOT NULL,
  "description"      VARCHAR(500),
  "publishedAt"      TIMESTAMP(3),
  "lastSeenAt"       TIMESTAMP(3) NOT NULL,
  "withdrawnAt"      TIMESTAMP(3),
  "organizationPic"  TEXT,
  "organizationName" TEXT NOT NULL,
  "organizationType" "PartnerSearchOrgType" NOT NULL DEFAULT 'OTH',
  "isSme"            BOOLEAN NOT NULL DEFAULT false,
  "country"          TEXT,
  "city"             TEXT,
  "keywords"         JSONB NOT NULL DEFAULT '[]',
  "programmeCodes"   JSONB NOT NULL DEFAULT '[]',
  "source"           "PartnerSearchSource" NOT NULL,
  "raw"              JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerSearchAnnouncement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PartnerSearchAnnouncement" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerSearchAnnouncement_externalId_key" ON "PartnerSearchAnnouncement"("externalId");
CREATE INDEX IF NOT EXISTS "PartnerSearchAnnouncement_topicIdentifier_idx" ON "PartnerSearchAnnouncement"("topicIdentifier");
CREATE INDEX IF NOT EXISTS "PartnerSearchAnnouncement_organizationPic_idx" ON "PartnerSearchAnnouncement"("organizationPic");
CREATE INDEX IF NOT EXISTS "PartnerSearchAnnouncement_country_idx" ON "PartnerSearchAnnouncement"("country");
CREATE INDEX IF NOT EXISTS "PartnerSearchAnnouncement_type_idx" ON "PartnerSearchAnnouncement"("type");
CREATE INDEX IF NOT EXISTS "PartnerSearchAnnouncement_lastSeenAt_idx" ON "PartnerSearchAnnouncement"("lastSeenAt");

CREATE TABLE IF NOT EXISTS "PartnerProfileSnapshot" (
  "pic"               TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "type"              "PartnerSearchOrgType" NOT NULL DEFAULT 'OTH',
  "country"           TEXT,
  "city"              TEXT,
  "description"       TEXT,
  "keywords"          JSONB NOT NULL DEFAULT '[]',
  "projectCount"      INTEGER NOT NULL DEFAULT 0,
  "announcementCount" INTEGER NOT NULL DEFAULT 0,
  "programmes"        JSONB NOT NULL DEFAULT '[]',
  "topCollaborators"  JSONB NOT NULL DEFAULT '[]',
  "fetchedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerProfileSnapshot_pkey" PRIMARY KEY ("pic")
);
ALTER TABLE "PartnerProfileSnapshot" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)
CREATE INDEX IF NOT EXISTS "PartnerProfileSnapshot_country_idx" ON "PartnerProfileSnapshot"("country");

CREATE TABLE IF NOT EXISTS "PartnerSearchIngestionRun" (
  "id"                      TEXT NOT NULL,
  "startedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"              TIMESTAMP(3),
  "trigger"                 "PartnerSearchRunTrigger" NOT NULL,
  "topicsScanned"           INTEGER NOT NULL DEFAULT 0,
  "created"                 INTEGER NOT NULL DEFAULT 0,
  "updated"                 INTEGER NOT NULL DEFAULT 0,
  "withdrawn"               INTEGER NOT NULL DEFAULT 0,
  "personAnnouncementCount" INTEGER NOT NULL DEFAULT 0,
  "status"                  "PartnerSearchRunStatus" NOT NULL DEFAULT 'RUNNING',
  "error"                   TEXT,
  CONSTRAINT "PartnerSearchIngestionRun_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PartnerSearchIngestionRun" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)
CREATE INDEX IF NOT EXISTS "PartnerSearchIngestionRun_startedAt_idx" ON "PartnerSearchIngestionRun"("startedAt");

CREATE TABLE IF NOT EXISTS "UnmatchedOrganization" (
  "id"          TEXT NOT NULL,
  "matchKey"    TEXT NOT NULL,
  "pic"         TEXT,
  "name"        TEXT NOT NULL,
  "country"     TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL,
  "resolvedPic" TEXT,
  CONSTRAINT "UnmatchedOrganization_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UnmatchedOrganization" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)
CREATE UNIQUE INDEX IF NOT EXISTS "UnmatchedOrganization_matchKey_key" ON "UnmatchedOrganization"("matchKey");
CREATE INDEX IF NOT EXISTS "UnmatchedOrganization_pic_idx" ON "UnmatchedOrganization"("pic");
CREATE INDEX IF NOT EXISTS "UnmatchedOrganization_resolvedPic_idx" ON "UnmatchedOrganization"("resolvedPic");

CREATE TABLE IF NOT EXISTS "PartnerSearchTopicStat" (
  "topicIdentifier"         TEXT NOT NULL,
  "personAnnouncementCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerSearchTopicStat_pkey" PRIMARY KEY ("topicIdentifier")
);
ALTER TABLE "PartnerSearchTopicStat" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)

CREATE TABLE IF NOT EXISTS "PartnerSearchQuotaUsage" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "month"     TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerSearchQuotaUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerSearchQuotaUsage_tenantId_month_key" ON "PartnerSearchQuotaUsage"("tenantId", "month");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerSearchAnnouncement_topicIdentifier_fkey') THEN
    ALTER TABLE "PartnerSearchAnnouncement"
      ADD CONSTRAINT "PartnerSearchAnnouncement_topicIdentifier_fkey"
      FOREIGN KEY ("topicIdentifier") REFERENCES "Topic"("identifier")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerSearchTopicStat_topicIdentifier_fkey') THEN
    ALTER TABLE "PartnerSearchTopicStat"
      ADD CONSTRAINT "PartnerSearchTopicStat_topicIdentifier_fkey"
      FOREIGN KEY ("topicIdentifier") REFERENCES "Topic"("identifier")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerSearchQuotaUsage_tenantId_fkey') THEN
    ALTER TABLE "PartnerSearchQuotaUsage"
      ADD CONSTRAINT "PartnerSearchQuotaUsage_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Tenant isolation for the quota counter, same wording as prisma/rls.sql so
-- applying this file alone leaves no window without a policy.
ALTER TABLE "PartnerSearchQuotaUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerSearchQuotaUsage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartnerSearchQuotaUsage";
CREATE POLICY tenant_isolation ON "PartnerSearchQuotaUsage"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Default privileges reach only roles that existed when rls-app-role.sql last
-- ran (same reasoning as add-notification.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "PartnerSearchAnnouncement", "PartnerProfileSnapshot", "PartnerSearchIngestionRun",
      "UnmatchedOrganization", "PartnerSearchTopicStat", "PartnerSearchQuotaUsage"
    TO fabrika_app;
  END IF;
END $$;
