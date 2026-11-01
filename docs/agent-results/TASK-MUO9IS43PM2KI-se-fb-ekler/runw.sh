#!/bin/bash
# runw.sh <log> <tick>... : worker'ı başlat, her tick için bir iş, bitince SIGTERM
SP=$(dirname $0); log=$SP/logs/$1; shift
cd $SP/wt && source $SP/wenv
(nohup npx tsx scripts/jobs-worker.ts > $log 2>&1 &)
for i in $(seq 1 60); do /usr/bin/grep -q "worker up" $log && break; sleep 1; done
for t in "$@"; do
  id=$($SP/addjob.sh $t | head -1)
  for i in $(seq 1 120); do n=$($SP/psql -Atc "select count(*) from graphile_worker.jobs where id=$id"); [ "$n" = 0 ] && break; sleep 1; done
  echo "tick=$t job=$id left=$n"
done
/usr/bin/grep -oE '"(digestsSent|digestsFailed|skippedMailedToday|tenantsFailed|tenantsPilotExpired|tenantsModuleClosed|relationshipsReminded)":[0-9]+' $log | paste -sd' ' -
P=$(/usr/bin/grep -o "worker up (pid [0-9]*" $log | /usr/bin/grep -o "[0-9]*$"); kill -TERM $P
for i in $(seq 1 15); do kill -0 $P 2>/dev/null || break; sleep 1; done
echo "shutdown: $(/usr/bin/grep -c 'graceful shutdown complete' $log)"
