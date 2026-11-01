#!/bin/bash
# addjob69.sh <tick-iso> [queue|none]
q="'m4-stale-relationships'"; [ "$2" = none ] && q=NULL
$(dirname $0)/psql69 x -Atc "select id from graphile_worker.add_job('m4-stale-relationships', json_build_object('_cron', json_build_object('ts','$1')), queue_name => $q, max_attempts => 1)"
