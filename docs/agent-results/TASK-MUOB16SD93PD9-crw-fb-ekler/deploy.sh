#!/bin/bash
# deploy.sh <worktree> <db> [steps]  steps: p=push r=rls-role m=migrate l=db:rls v=verify (default prmlv)
SP=$(cd "$(dirname "$0")" && pwd); cd $SP/$1 && source $SP/envdb $2; steps=${3:-prmlv}
echo "[$1] DATABASE_URL=$(echo $DATABASE_URL | sed -E 's#:[^:@/]+@#:***@#')"
case $steps in *p*) npx prisma db push 2>&1 | tail -1;; esac
case $steps in *r*) npx tsx scripts/setup-rls-role.ts 2>&1 | tail -1;; esac
case $steps in *m*) bash scripts/apply-migrations.sh 2>&1 | tail -1;; esac
case $steps in *l*) npx tsx scripts/apply-rls.ts 2>&1 | tail -1;; esac
case $steps in *v*) npx tsx scripts/check-rls-live.ts 2>&1 | tail -3; echo "verify exit=${PIPESTATUS[0]}";; esac
