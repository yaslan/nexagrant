#!/bin/bash
# addjob.sh <tick-iso> [none] -> cron gibi iş ekle (none: kuyruksuz, paralel koşabilir)
q="'m4-stale-relationships'"; [ "$2" = none ] && q=NULL
$(dirname $0)/psql -Atc "select id from graphile_worker.add_job('m4-stale-relationships', json_build_object('_cron', json_build_object('ts','$1')), queue_name => $q, max_attempts => 1)"
