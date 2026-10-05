\pset footer off
select current_user, current_setting('server_version') v;
\echo '--- 3 fonksiyon: proacl + has_function_privilege'
select p.oid::regprocedure fn, pg_get_userbyid(p.proowner) owner, p.prosecdef definer, p.proacl,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') authd,
  has_function_privilege('service_role', p.oid, 'EXECUTE') svc,
  has_function_privilege('fabrika_app', p.oid, 'EXECUTE') app,
  has_function_privilege('fabrika_jobs', p.oid, 'EXECUTE') jobs
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('lifetime_licence_count','system_scope_sealed','system_scope_open') order by 1;
\echo '--- public şemasında anon/authenticated için EXECUTE taşıyan TÜM fonksiyonlar'
select p.oid::regprocedure fn, p.prosecdef definer, pg_get_userbyid(p.proowner) owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')) order by 1;
\echo '--- şema USAGE'
select r, has_schema_privilege(r,'public','USAGE') usage, has_schema_privilege(r,'public','CREATE') create_ from unnest(array['anon','authenticated','service_role','authenticator','fabrika_app','fabrika_jobs']) r;
select nspacl from pg_namespace where nspname='public';
\echo '--- tablo/sekans/görünüm yetkisi (anon, authenticated)'
select r, count(*) filter (where has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE')) tbl
from unnest(array['anon','authenticated']) r, pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','v','m','S','p','f') group by r;
\echo '--- varsayılan ACL (public şeması / global)'
select pg_get_userbyid(defaclrole) role, coalesce(defaclnamespace::regnamespace::text,'(global)') ns, defaclobjtype t, defaclacl from pg_default_acl order by 1,2,3;
\echo '--- PostgREST (authenticator) ayarı'
select rolname, rolconfig from pg_roles where rolname in ('authenticator','anon','authenticated');
