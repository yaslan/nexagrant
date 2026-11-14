-- ─────────────────────────────────────────────────────────────────────────────
-- add-consent-purpose-lead-intake.sql — NG-138 (M18-F4)
--
-- Purpose: a readiness-funnel visitor who agrees to have their contact request passed
-- to a consultancy / agency tenant needs a `Consent` row of its own purpose. The form's
-- own consent (PublicLead.consentVersion) lets the PLATFORM contact them; it does not
-- cover a third party receiving the data, so it cannot stand in for this one.
--
-- Additive: one enum value. No table, column or policy changes; `Consent` keeps its
-- `tenant_isolation` policy from add-consent-record.sql.
-- Idempotent: ADD VALUE IF NOT EXISTS. (A value added here cannot be used in the same
-- transaction; nothing in this file uses it.)
-- Rollback: add-consent-purpose-lead-intake.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE "ConsentPurpose" ADD VALUE IF NOT EXISTS 'LEAD_INTAKE';
