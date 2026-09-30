#!/bin/bash
# deploy.sh <db> : RELEASE_CHECKLIST §3.1 steps 1-5 with the NEW release's files (branch worktree)
SP=$(dirname $0); cd $SP/wt && source $SP/envdb $1
npx prisma db push 2>&1 | tail -1
npx tsx scripts/setup-rls-role.ts 2>&1 | tail -1
bash scripts/apply-migrations.sh 2>&1 | tail -1
npx tsx scripts/apply-rls.ts 2>&1 | tail -1
npx tsx scripts/check-rls-live.ts 2>&1 | tail -1
