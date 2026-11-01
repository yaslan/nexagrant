#!/bin/bash
# runw69.sh <log> <tick> : start worker, run one job, stop worker
SP=$(dirname $0); cd $SP/wt69 && source $SP/wenv69
(nohup npx tsx scripts/jobs-worker.ts > $SP/$1 2>&1 &)
for i in $(seq 1 40); do /usr/bin/grep -q "worker up" $SP/$1 && break; perl -e 'select(undef,undef,undef,1)'; done
$SP/addjob69.sh $2 >/dev/null && $SP/waitjobs69.sh
/usr/bin/grep -E "DONE|FAIL" $SP/$1 | tail -1 | /usr/bin/grep -o 'job=.*'
P=$(/usr/bin/grep -o "worker up (pid [0-9]*" $SP/$1 | /usr/bin/grep -o "[0-9]*$"); kill -TERM $P
for i in 1 2 3 4 5 6 7 8; do kill -0 $P 2>/dev/null || break; perl -e 'select(undef,undef,undef,1)'; done
/usr/bin/grep -c "graceful shutdown complete" $SP/$1
