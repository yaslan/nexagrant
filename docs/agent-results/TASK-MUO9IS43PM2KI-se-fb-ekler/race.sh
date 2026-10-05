#!/bin/bash
# race.sh <round> <tick>: iki kuyruksuz iş ekle, iki ayrı worker sürecini aynı anda başlat
SP=$(dirname $0); r=$1; t=$2
cd $SP/wt && source $SP/wenv
j1=$($SP/addjob.sh $t none | head -1); j2=$($SP/addjob.sh $t none | head -1)
(nohup npx tsx scripts/jobs-worker.ts > $SP/logs/race$r-w1.log 2>&1 &); (nohup npx tsx scripts/jobs-worker.ts > $SP/logs/race$r-w2.log 2>&1 &)
for i in $(seq 1 180); do n=$($SP/psql -Atc "select count(*) from graphile_worker.jobs where id in ($j1,$j2)"); [ "$n" = 0 ] && break; sleep 1; done
echo "round=$r jobs=$j1,$j2 left=$n"
for w in w1 w2; do echo "$w: $(/usr/bin/grep -oE 'job=[0-9]+|"(digestsSent|skippedMailedToday|digestsFailed)":[0-9]+' $SP/logs/race$r-$w.log | paste -sd' ' -)"; done
for w in w1 w2; do P=$(/usr/bin/grep -o "worker up (pid [0-9]*" $SP/logs/race$r-$w.log | /usr/bin/grep -o "[0-9]*$"); kill -TERM $P; done; sleep 4
echo "shutdown: $(cat $SP/logs/race$r-w*.log | /usr/bin/grep -c 'graceful shutdown complete')"
