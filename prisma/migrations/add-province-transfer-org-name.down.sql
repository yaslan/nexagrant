-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-province-transfer-org-name.sql: drops the function only. No data is changed.
-- After this the transfer box (NG-179) finds no organisation and stays hidden; ProvinceLeadRoute's
-- policy (NG-175 D-1) is not touched.
DROP FUNCTION IF EXISTS public.province_transfer_org_name(text);
