\echo === P1 caller SAVEPOINT, error after scope on, caller LOCAL value 'off'
BEGIN;
SELECT set_config('app.system_scope','off',true) AS set_off;
SAVEPOINT s1;
SET LOCAL zz.probe = 'boom';
SELECT note_agency_invite_rejection(repeat('a',64));
ROLLBACK TO s1;
SELECT 'P1 after ROLLBACK TO' AS k, current_setting('app.system_scope',true) AS v;
COMMIT;
SELECT 'P1 after COMMIT' AS k, current_setting('app.system_scope',true) AS v;
\echo === P2 PL/pgSQL EXCEPTION block in caller (DO), caller value unset in this tx
BEGIN;
DO $$
BEGIN
  BEGIN
    PERFORM set_config('zz.probe','boom',true);
    PERFORM note_agency_invite_rejection(repeat('b',64));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'P2 caught: % | scope in handler=[%]', SQLERRM, current_setting('app.system_scope',true);
  END;
  RAISE NOTICE 'P2 after inner block scope=[%]', current_setting('app.system_scope',true);
END $$;
SELECT 'P2 after DO' AS k, current_setting('app.system_scope',true) AS v;
COMMIT;
\echo === P3 autocommit, caller SESSION value 'xyz'
SET app.system_scope = 'xyz';
SELECT redeem_agency_invite(repeat('c',64)) AS redeem;
SELECT 'P3 after redeem' AS k, current_setting('app.system_scope',true) AS v;
SELECT count(*) AS funnel_rows FROM agency_funnel_counts(NULL);
SELECT 'P3 after funnel' AS k, current_setting('app.system_scope',true) AS v;
SELECT note_agency_invite_rejection('bad');
SELECT 'P3 after note' AS k, current_setting('app.system_scope',true) AS v;
RESET app.system_scope;
\echo === P4 sealed scope, app sets flag 'off' (token kept), calls definers, then reads Membership
BEGIN;
SELECT enter_system_scope('platform-aggregate') AS entered;
SELECT count(*) AS sealed_on_rows FROM "Membership";
SELECT set_config('app.system_scope','off',true) AS off;
SELECT count(*) AS off_rows_before FROM "Membership";
SELECT redeem_agency_invite(repeat('d',64)), note_agency_invite_rejection(repeat('d',64));
SELECT count(*) AS funnel_rows FROM agency_funnel_counts_by_province(NULL);
SELECT current_setting('app.system_scope',true) AS flag_after, count(*) AS off_rows_after FROM "Membership";
ROLLBACK;
\echo === P5 fabrika_app plain SET (no seal) opens nothing
BEGIN; SET LOCAL app.system_scope='on'; SELECT count(*) AS plain_set_rows FROM "Membership"; ROLLBACK;
\echo === P6 fabrika_app cannot create a function with SET app.system_scope
SELECT has_parameter_privilege('app.system_scope','SET') AS app_can_set_param;
CREATE FUNCTION pg_temp.zz_x() RETURNS int LANGUAGE sql SET app.system_scope='on' AS 'select 1';
