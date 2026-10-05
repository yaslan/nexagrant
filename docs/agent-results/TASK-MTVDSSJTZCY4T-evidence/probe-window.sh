#!/usr/bin/env bash
# TASK-MTVDSSJTZCY4T — the window this card closes, measured rather than argued.
#
# Applies three migrations to a CLEAN database and never runs `pnpm db:rls`,
# which is exactly the state docs/RELEASE_CHECKLIST.md §1 describes: a human has
# applied the flat .sql files, the separate db:rls step has not happened yet.
#
# Run BEFORE the fix with `git stash` (or `git show <pre-fix>:<file>`) and AFTER
# with the working tree; the difference is the point.
#
#   bash docs/agent-results/TASK-MTVDSSJTZCY4T-evidence/probe-window.sh fabrika_win_after
#
# Needs the local pgvector container (no psql binary on this machine):
#   docker exec postgres-vector psql -U fabrika …
set -euo pipefail
DB="${1:-fabrika_win_after}"
C="docker exec -i postgres-vector psql -U fabrika"

$C -d postgres -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"
$C -d "$DB" -q -c 'CREATE TABLE "Tenant"(id text primary key);'
for f in add-invoice.sql add-invoice-write-path.sql add-m9-meeting-schedule/migration.sql; do
  $C -d "$DB" -q -v ON_ERROR_STOP=1 < "prisma/migrations/$f"
done

echo "== is row level security on, and is there a policy? (db:rls NOT run)"
$C -d "$DB" -c "
select c.relname as table, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as forced,
       (select string_agg(p.policyname,',') from pg_policies p where p.tablename=c.relname) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('Invoice','TenantBillingIdentity','MeetingBrief')
order by 1;"

echo "== what one tenant's connection can actually read"
$C -d "$DB" -q <<'SQL'
DROP ROLE IF EXISTS app_probe;
CREATE ROLE app_probe NOLOGIN NOBYPASSRLS;
GRANT SELECT ON "MeetingBrief" TO app_probe;
INSERT INTO "Tenant"(id) VALUES ('tenant-a'),('tenant-b') ON CONFLICT DO NOTHING;
INSERT INTO "MeetingBrief"(id,"tenantId","interactionId",content)
  VALUES ('mb-a','tenant-a','ix-a','A brief that belongs to tenant A'),
         ('mb-b','tenant-b','ix-b','B brief that belongs to tenant B');
SET ROLE app_probe;
SET app.tenant_id = 'tenant-a';
SELECT current_user AS reading_as, current_setting('app.tenant_id') AS tenant,
       count(*) AS rows_visible, string_agg(id, ',' ORDER BY id) AS ids
FROM "MeetingBrief";
RESET ROLE;
SQL
