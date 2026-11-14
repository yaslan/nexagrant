-- ─────────────────────────────────────────────────────────────────────────────
-- add-public-lead-transfer-consent.sql — NG-138 (M18-F4, round 2)
--
-- Purpose: the readiness scorecard's own consent (PublicLead.consentVersion) lets the
-- PLATFORM contact the visitor. Passing the request to a consultancy needs a separate,
-- explicit field; the intake producer forwards a lead only when it is true.
-- No form box writes it yet (text/version are an open owner/legal decision), so every
-- existing and new row stays false and nothing is forwarded.
--
-- Additive: three columns, defaults keep every existing row valid. PublicLead is SYSTEM_WIDE
-- (no RLS), so no policy change.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- Rollback: add-public-lead-transfer-consent.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "transferConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "transferConsentVersion" TEXT;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "transferConsentAt" TIMESTAMP(3);
