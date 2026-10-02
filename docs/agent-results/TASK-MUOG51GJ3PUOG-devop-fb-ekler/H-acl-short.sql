\pset footer off
select current_user, now()::timestamptz(0) at time zone 'Europe/Istanbul' as ts;
select p.oid::regprocedure fn, p.proacl,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') authd,
  has_function_privilege('fabrika_app', p.oid, 'EXECUTE') app,
  has_function_privilege('fabrika_jobs', p.oid, 'EXECUTE') jobs
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('lifetime_licence_count','system_scope_sealed','system_scope_open') order by 1;
select count(*) as sahip_fonk_toplam,
       count(*) filter (where has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')) as api_cagirabilir
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proowner='fabrika_migrate'::regrole;
