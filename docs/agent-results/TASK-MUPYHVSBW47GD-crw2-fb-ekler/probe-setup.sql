CREATE OR REPLACE FUNCTION public.zz_probe_raise() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('zz.probe', true) = 'boom' THEN
    RAISE EXCEPTION 'probe inside: scope=%', current_setting('app.system_scope', true);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_probe ON "AuditEvent";
CREATE TRIGGER zz_probe BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION public.zz_probe_raise();
DROP TRIGGER IF EXISTS zz_probe ON "SystemAlert";
CREATE TRIGGER zz_probe BEFORE INSERT OR UPDATE ON "SystemAlert" FOR EACH ROW EXECUTE FUNCTION public.zz_probe_raise();
