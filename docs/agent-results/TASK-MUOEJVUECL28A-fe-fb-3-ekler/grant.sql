\set ON_ERROR_STOP 0
-- compose ile aynı: POSTGRES_USER=fabrika (web'in DATABASE_URL rolü)
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
CREATE ROLE fabrika_migrate LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE fabrika_app LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE fb_edge_sync LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT CREATE ON SCHEMA public TO fabrika_migrate;
SET ROLE fabrika_migrate;
CREATE TABLE "AgencyDomainEdgeState" (hostname text PRIMARY KEY, "syncedGeneration" int, "edgeError" text);
-- rev. 4 §4.1 GRANT kısıtı (migrasyonda, tablo sahibi yazar)
REVOKE ALL ON "AgencyDomainEdgeState" FROM PUBLIC;
GRANT SELECT ON "AgencyDomainEdgeState" TO fabrika_app;
GRANT SELECT, INSERT, UPDATE ON "AgencyDomainEdgeState" TO fb_edge_sync;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "AgencyDomainEdgeState" FROM fabrika;
RESET ROLE;
\echo '--- fb_edge_sync yazar'
SET ROLE fb_edge_sync; INSERT INTO "AgencyDomainEdgeState" VALUES ('panel.oka.org.tr', 1, null); RESET ROLE;
\echo '--- fabrika_app (NOSUPERUSER) yazamaz, okur'
SET ROLE fabrika_app; INSERT INTO "AgencyDomainEdgeState" VALUES ('x.org.tr', 9, null); SELECT count(*) AS app_okur FROM "AgencyDomainEdgeState"; RESET ROLE;
\echo '--- fabrika (SUPERUSER, bugünkü web bağlantısı): REVOKE sonrası'
UPDATE "AgencyDomainEdgeState" SET "syncedGeneration" = 999, "edgeError" = NULL WHERE hostname = 'panel.oka.org.tr';
SELECT hostname, "syncedGeneration" FROM "AgencyDomainEdgeState";
