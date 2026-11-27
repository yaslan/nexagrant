#!/bin/bash
# Run 2 (starts after >1 min with no worker up): backfill of missed ticks,
# jobKey dedupe on the manual path, queue=k2 serialisation across A and B.
cd "$(dirname "$0")/../.."
S="${JOBQ_OUT:-${TMPDIR:-/tmp}/jobq}"; mkdir -p "$S"
export SPIKE_WORKER_URL=http://127.0.0.1:18077
MOCK_DELAY_MS=5000 pnpm exec tsx scripts/spike-jobq/mock-cordis-worker.ts > $S/mock2.log 2>&1 &
M=$!
sleep 2
echo "workers start $(date -u +%H:%M:%S)"
pnpm exec tsx scripts/spike-jobq/worker.ts A > $S/A2.log 2>&1 &
A=$!
pnpm exec tsx scripts/spike-jobq/worker.ts B > $S/B2.log 2>&1 &
B=$!
sleep 6
pnpm exec tsx scripts/spike-jobq/enqueue.ts 2026-08 > $S/enq.log 2>&1
pnpm exec tsx scripts/spike-jobq/enqueue.ts 2026-07 >> $S/enq.log 2>&1
sleep 60
kill -TERM $A $B; sleep 8; kill $M; wait
echo done
