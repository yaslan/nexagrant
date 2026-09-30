#!/bin/bash
# runw.sh <worktree> <db> <log> <tick>... : start that worktree's real worker on <db>, one job per tick, SIGTERM when done
SP=$(dirname $0); wt=$1; export DB=$2; log=$SP/logs/$3; shift 3
cd $SP/$wt && source $SP/wenv
(nohup npx tsx scripts/jobs-worker.ts > $log 2>&1 &)
for i in $(seq 1 90); do /usr/bin/grep -q "worker up" $log && break; sleep 1; done
for t in "$@"; do
  id=$($SP/addjob.sh $DB $t | head -1)
  for i in $(seq 1 120); do n=$(docker exec sefbad-pg psql -U fabrika -d $DB -Atc "select count(*) from graphile_worker.jobs where id=$id"); [ "$n" = 0 ] && break; sleep 1; done
  echo "[$wt] tick=$t job=$id left=$n"
done
/usr/bin/grep -oE '"(digestsSent|digestsFailed|skippedMailedToday|tenantsFailed)":[0-9]+' $log | paste -sd' ' -
P=$(/usr/bin/grep -o "worker up (pid [0-9]*" $log | /usr/bin/grep -o "[0-9]*$"); kill -TERM $P
for i in $(seq 1 20); do kill -0 $P 2>/dev/null || break; sleep 1; done
echo "shutdown: $(/usr/bin/grep -c 'graceful shutdown complete' $log)"
