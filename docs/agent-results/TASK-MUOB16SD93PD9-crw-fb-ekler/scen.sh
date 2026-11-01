#!/bin/bash
# scen.sh <name> <deploy-before|none> then pairs: <wt> <tick>
SP=$(cd "$(dirname "$0")" && pwd); name=$1; shift
curl -s -X DELETE http://127.0.0.1:18102/api/v1/messages >/dev/null
docker exec crwfb102-pg psql -U fabrika -c "drop database if exists $name" -c "create database $name template relbase" >/dev/null
while [ $# -gt 0 ]; do
  case $1 in
    DEPLOY) $SP/deploy.sh wt $name prmlv; shift;;
    PUSHROLE) $SP/deploy.sh wt $name pr; shift;;
    MIGRATE) echo '(2a: eski worker durdu — runw SIGTERM sonrası)'; $SP/deploy.sh wt $name mlv; shift;;
    *) $SP/runw.sh $1 $name $name-$1-$(echo $2|tr -d ':').log $2; shift 2;;
  esac
done
$SP/mails.sh
docker exec crwfb102-pg psql -U fabrika -d $name -Atc "select 'Membership|'||\"tenantId\"||'/'||\"userId\"||'|'||coalesce(\"staleDigestOn\"::text,'') from \"Membership\" where \"userId\" like 'u_' order by 1" -c "select 'User|'||id||'|'||coalesce(\"staleDigestOn\"::text,'') from \"User\" where id like 'u_' order by 1" 2>&1
