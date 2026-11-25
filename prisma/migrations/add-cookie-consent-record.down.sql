-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-cookie-consent-record.down.sql — rollback for add-cookie-consent-record.sql
--
-- LOSSY: every stored cookie consent record is dropped (the proof of consent with it).
-- Roll the application code back in the same deploy, or /api/cookie-consent writes to
-- a table that is gone (it answers 500; the banner still works from localStorage).
-- Idempotent: DROP TABLE IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "CookieConsentRecord";
