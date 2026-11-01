#!/usr/bin/env bash
# CI sırası (.github/workflows/ci.yml), izole pg 127.0.0.1:55225, süper kullanıcı fabrika / DB fabrika.
set -uo pipefail
export DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55225/fabrika
export DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@127.0.0.1:55225/fabrika
export CI=true AUTH_SECRET=ci-vitest-auth-secret-fixture-not-for-any-deployment
L=$1; mkdir -p $L
echo "DATABASE_URL=${DATABASE_URL/***/***}"
st() { echo "$1 exit=$2"; }
pnpm -s db:generate >$L/generate.log 2>&1; st "db:generate" $?
node_modules/.bin/prisma db push >$L/prep.log 2>&1; st "db push" $?
pnpm -s db:rls-role >>$L/prep.log 2>&1; st "db:rls-role" $?
scripts/apply-migrations.sh >$L/mig1.log 2>&1; st "apply-migrations #1 ($(tail -1 $L/mig1.log))" $?
scripts/apply-migrations.sh >$L/mig2.log 2>&1; st "apply-migrations #2 ($(tail -1 $L/mig2.log))" $?
pnpm -s db:rls >$L/rls.log 2>&1; st "db:rls ($(tail -1 $L/rls.log))" $?
pnpm -s db:seed >$L/seed.log 2>&1; st "db:seed" $?
pnpm -s lint >$L/lint.log 2>&1; st "lint" $?
pnpm -s typecheck >$L/tsc.log 2>&1; st "typecheck" $?
pnpm exec vitest run --passWithNoTests --reporter=default --reporter=json --outputFile.json=$L/vitest-report.json >$L/vitest.log 2>&1; st "vitest ($(grep -E '^ +(Test Files|Tests) ' $L/vitest.log | tr -s ' ' | tr '\n' ' '))" $?
pnpm exec tsx scripts/check-live-skips.ts $L/vitest-report.json >$L/live-skips.log 2>&1; st "check-live-skips" $?
pnpm -s rls:check >$L/rls-check.log 2>&1; st "rls:check" $?
pnpm -s rls:bypass-check >$L/rls-bypass.log 2>&1; st "rls:bypass-check" $?
pnpm -s rls:verify >$L/rls-verify.log 2>&1; st "rls:verify ($(tail -1 $L/rls-verify.log))" $?
pnpm -s build >$L/build.log 2>&1; st "build" $?
