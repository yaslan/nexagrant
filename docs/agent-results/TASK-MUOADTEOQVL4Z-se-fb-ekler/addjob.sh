#!/bin/bash
# addjob.sh <db> <tick-iso> -> enqueue one m4 job as the cron would (queue m4-stale-relationships)
docker exec -i sefbad-pg psql -U fabrika -d "$1" -Atc "select id from graphile_worker.add_job('m4-stale-relationships', json_build_object('_cron', json_build_object('ts','$2')), queue_name => 'm4-stale-relationships', max_attempts => 1)"
