-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-close-own-province-routes.sql: drops the function only. No data is changed.
-- Deploy the code rollback FIRST: the tenant settings and the billing webhooks call this function in
-- the same transaction as their ModuleState write, so with the function gone those writes fail
-- (nothing half-written). Routes already closed by it stay closed (re-set them in /admin/lead-routes).
DROP FUNCTION IF EXISTS public.close_own_province_routes(text, text);
