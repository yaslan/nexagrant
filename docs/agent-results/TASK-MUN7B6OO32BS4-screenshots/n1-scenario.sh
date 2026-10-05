#!/bin/bash
# usage: n1.sh <period> <migration-file-for-reapply>
S=/private/tmp/claude-501/-Users-macbook-alan/f412c0a6-ab33-45e6-b35f-1774412b4489/scratchpad
P=$1; F=$2
q(){ docker exec -i crwfb-i50 psql -U fabrika -d crwfb50 -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }
sumP(){ q "select count(*)||' rows, sum='||coalesce(sum(delta),0)||', stamped='||count(\"grantPeriod\") from \"CreditLedger\" where reason='monthly_grant' and \"refId\"='monthly_grant:$P'"; }
waitjob(){ for i in $(seq 1 60); do n=$(q "select count(*) from graphile_worker.jobs where task_identifier='credits-monthly-grant'" 2>/dev/null || q "select count(*) from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id=j.task_id where t.identifier='credits-monthly-grant'"); [ "$n" = "0" ] && return 0; sleep 1; done; echo TIMEOUT; }
cd $S/wt
echo "== period $P, reapply file $(shasum -a 256 $F | cut -c1-12)"
echo "F1 before: $(sumP)"
pnpm -s jobs:enqueue -- credits-monthly-grant --period $P 2>&1 | grep '\[jobs\]'; waitjob
echo "R1 after first run: $(sumP)"
echo "G rollback (header SQL)"; q 'DROP INDEX IF EXISTS "CreditLedger_tenantId_grantPeriod_key"; ALTER TABLE "CreditLedger" DROP COLUMN IF EXISTS "grantPeriod";'
echo "F2 re-apply:"; docker exec -i crwfb-i50 psql -U fabrika -d crwfb50 -X -v ON_ERROR_STOP=1 < $F 2>&1 | tr '\n' ' '; echo
echo "   after re-apply: $(sumP)"
pnpm -s jobs:enqueue -- credits-monthly-grant --period $P --force 2>&1 | grep '\[jobs\]'; waitjob
echo "R2 same month again: $(sumP)"
q "select \"tenantId\", sum(delta), count(*) from \"CreditLedger\" where reason='monthly_grant' and \"refId\"='monthly_grant:$P' group by 1 having count(*)>1" | head -3 | sed 's/^/   DUP /'
