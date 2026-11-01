#!/bin/bash
# runw.sh <log> <tick-iso>...  : start worker, run one job per tick in order, stop worker
SP=$(dirname $0); log=$SP/logs/$1; shift; mkdir -p $SP/logs
cd $SP/wt && source $SP/wenv
(nohup npx tsx scripts/jobs-worker.ts > $log 2>&1 &)
for i in $(seq 1 60); do /usr/bin/grep -q "worker up" $log && break; sleep 1; done
for t in "$@"; do
  id=$($SP/addjob.sh $t | head -1)
  for i in $(seq 1 90); do
    n=$($SP/psql -Atc "select count(*) from graphile_worker.jobs where id=$id")
    [ "$n" = 0 ] && break; sleep 1
  done
  echo "tick=$t job=$id left=$n"
done
/usr/bin/grep -E "m4-stale" $log | /usr/bin/grep -vE "^\s*$" | tail -n $(( $# * 2 )) | cut -c1-400
P=$(/usr/bin/grep -o "worker up (pid [0-9]*" $log | /usr/bin/grep -o "[0-9]*$"); kill -TERM $P
for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 $P 2>/dev/null || break; sleep 1; done
echo "shutdown: $(/usr/bin/grep -c 'graceful shutdown complete' $log)"
