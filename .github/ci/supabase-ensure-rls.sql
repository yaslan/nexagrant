-- Supabase's `ensure_rls` event trigger, reproduced for CI (TASK-MUWDA86A7U4LK).
--
-- The live Supabase project ENABLEs row level security on every table created
-- in `public` (ddl_command_end → public.rls_auto_enable(), owned by the
-- platform). For a table designed policy-less (policylessSystemWide() in
-- scripts/rls-models.ts) that is RLS on with zero policies: fabrika_app reads 0
-- rows and every INSERT fails. No CI or local database had the trigger, so
-- every suite stayed green while BlogPost broke on live (TASK-MUTP1R1C13GE3).
-- With this installed before `prisma db push`, CI is as strict as live: every
-- table starts locked, and only the DISABLE loop in prisma/rls.sql and the
-- DISABLE line in each migration make the policy-less ones reachable again.
--
-- The function body is the live definition word for word (pg_get_functiondef,
-- read-only, 06.10.2026: docs/agent-results/TASK-MUTP1R1C13GE3-devop-fb-2-evidence/
-- live-rls_auto_enable-def.sql). CI only: CREATE EVENT TRIGGER needs a
-- superuser, and production already has its own. Never apply this to live.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();
