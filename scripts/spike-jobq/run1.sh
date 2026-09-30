#!/bin/bash
# Run 1: mock (first call 503) + two worker instances for ~150 s (two cron ticks).
cd /Users/macbook/alan/FONBRIDGE-wt-jobq
S=/private/tmp/claude-501/-Users-macbook-alan/5250a185-2af2-461f-95d1-f43e03d095c5/scratchpad/jobq
export SPIKE_WORKER_URL=http://127.0.0.1:18077
MOCK_FAIL_FIRST=1 pnpm exec tsx scripts/spike-jobq/mock-cordis-worker.ts > $S/mock.log 2>&1 &
M=$!
sleep 2
pnpm exec tsx scripts/spike-jobq/worker.ts A > $S/A.log 2>&1 &
A=$!
pnpm exec tsx scripts/spike-jobq/worker.ts B > $S/B.log 2>&1 &
B=$!
echo "pids mock=$M A=$A B=$B"
sleep 150
kill -TERM $A $B; sleep 8; kill $M; wait
echo done
