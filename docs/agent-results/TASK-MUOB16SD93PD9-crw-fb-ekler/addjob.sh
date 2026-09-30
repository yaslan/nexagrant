#!/bin/bash
docker exec -i crwfb102-pg psql -U fabrika -d "$1" -Atc "select id from graphile_worker.add_job('m4-stale-relationships', json_build_object('_cron', json_build_object('ts','$2')), queue_name => 'm4-stale-relationships', max_attempts => 1)"
