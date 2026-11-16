-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-public-lead-transfer-recipient.sql. Order matters: roll the CODE back first
-- (forwardPublicLead reads these columns). After this, the submit cannot bind a consent; with the old
-- code back, the O-A1 gap is open again, so keep LEAD_TRANSFER_CONSENT_ENABLED off.
--
-- What this file does with existing rows (NG-213 review F-1). Two classes, checked in this order:
--   A. Any row with a recorded recipient ("transferConsentTenantId"/"transferConsentOrgName" set): every
--      consented submit since NG-204, so also MOST 'consent_recipient_mismatch' rows (the recipient was
--      stored, the map later named someone else). The file STOPS with an EXCEPTION before any change and
--      reports how many such rows there are and how many of them are marked 'consent_recipient_mismatch'.
--      It never drops the columns while they hold data: they are the only proof of WHO the visitor agreed
--      to send the request to.
--   B. No row with a recipient. Only legacy consents (no recipient recorded) can then be marked
--      'consent_recipient_mismatch'. The file goes on, prints their count as a NOTICE, and drops the columns.
--
-- Two different things, do not mix them up:
--   * the recipient COLUMNS go away with this file, so their values must be exported first and then
--     cleared (only those two columns);
--   * the ROUTE MARK (routeStatus 'unmatched' + routeReason 'consent_recipient_mismatch') stays as it is.
--     Do NOT rewrite it to another reason or to NULL: NULL makes the old code forward the lead to whoever
--     the map names now, which is the O-A1 gap; another reason falsifies the routing history. A deliberate
--     per-row decision, by hand, is the only other way.
-- Those rows only stay valid while add-public-lead-route-consistency.sql keeps 'consent_recipient_mismatch'
-- in its list (NG-213 D-2). apply-migrations re-runs that file on every apply: if the code rollback also
-- reverts it to the pre-NG-204 list (git revert of NG-204), the next apply STOPS there with
-- "N PublicLead row(s) violate the route consistency rule". Nothing is corrupted, but deploys are blocked.
--
-- Procedure, in this order (steps 2-3 as the schema owner, in a session with SET app.system_scope = 'on';
-- PublicLead has FORCE ROW LEVEL SECURITY, so without it the SELECT/UPDATE see 0 rows):
--   1. Count:
--        SELECT "routeStatus", "routeReason", count(*) FROM "PublicLead"
--         WHERE "transferConsentTenantId" IS NOT NULL OR "routeReason" = 'consent_recipient_mismatch'
--         GROUP BY 1, 2;
--   2. Export the recipient of every row that has one, and keep the export with the release record
--      (it is the consent proof once the columns are gone):
--        \copy (SELECT "id", "routeStatus", "routeReason", "transferConsentVersion", "transferConsentAt",
--                      "transferConsentTenantId", "transferConsentOrgName" FROM "PublicLead"
--                 WHERE "transferConsentTenantId" IS NOT NULL OR "transferConsentOrgName" IS NOT NULL)
--              TO 'publiclead-transfer-recipient.csv' CSV HEADER
--   3. Clear ONLY the two recipient columns (both together: PublicLead_transfer_recipient_check):
--        UPDATE "PublicLead" SET "transferConsentTenantId" = NULL, "transferConsentOrgName" = NULL
--         WHERE "transferConsentTenantId" IS NOT NULL OR "transferConsentOrgName" IS NOT NULL;
--      routeStatus / routeReason / routedTenantId / routedAt are NOT in this UPDATE.
--   4. Run this file again. It now reaches class B and prints the 'consent_recipient_mismatch' count.
--   5. That count 0 → nothing more to do. >0 → keep 'consent_recipient_mismatch' in BOTH lists of
--      add-public-lead-route-consistency.sql (preflight and CHECK) when reverting; the old code never
--      writes the reason, the list only allows the rows that exist. Its UI label key
--      (admin/lead-routes reason_consent_recipient_mismatch) and the UnmatchedReason member in
--      src/core/contracts/lead-routing.ts stay with it, or the worklist shows a raw reason.
-- Idempotent: a second run (columns already gone) skips the class-A check instead of failing on them.
DO $$
DECLARE kept integer; kept_mismatch integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'PublicLead' AND column_name = 'transferConsentTenantId') THEN
    EXECUTE 'SELECT count(*), count(*) FILTER (WHERE "routeReason" = ''consent_recipient_mismatch'') FROM "PublicLead"
              WHERE "transferConsentTenantId" IS NOT NULL OR "transferConsentOrgName" IS NOT NULL'
      INTO kept, kept_mismatch;
    IF kept > 0 THEN
      RAISE EXCEPTION 'add-public-lead-transfer-recipient.down: % PublicLead row(s) record a transfer consent recipient (% of them marked consent_recipient_mismatch); the columns would be dropped with that proof', kept, kept_mismatch
        USING HINT = 'Export the recipient columns, then set ONLY "transferConsentTenantId" and "transferConsentOrgName" to NULL and run this file again. Do not change routeStatus/routeReason: consent_recipient_mismatch rows keep their reason. Steps in the header of this file.';
    END IF;
  END IF;
END $$;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "PublicLead" WHERE "routeReason" = 'consent_recipient_mismatch';
  IF n > 0 THEN
    RAISE NOTICE 'add-public-lead-transfer-recipient.down: % PublicLead row(s) keep routeReason consent_recipient_mismatch; keep that reason in add-public-lead-route-consistency.sql (header step 5 of this file)', n;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.province_transfer_org(text);
ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_transfer_recipient_check";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentOrgName";
ALTER TABLE "PublicLead" DROP COLUMN IF EXISTS "transferConsentTenantId";
