#!/bin/bash
# CI-equivalent (ci.yml build-and-test) against isolated pg on 55120
set -o pipefail
cd "$1"
env -i HOME="$HOME" PATH="$PATH" TERM=dumb bash -c '
set -eo pipefail
export DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55120/fabrika
export DATABASE_URL_RLS_TEST=postgresql://fabrika_app:fabrika_app_ci@127.0.0.1:55120/fabrika
export CI=true
echo "DATABASE_URL=$DATABASE_URL"
pnpm install --frozen-lockfile
pnpm exec prisma validate
pnpm db:generate
pnpm exec prisma db push
pnpm db:rls-role
psql --version
scripts/apply-migrations.sh
scripts/apply-migrations.sh
pnpm db:rls
pnpm db:seed
echo "== lint"; pnpm lint
echo "== typecheck"; pnpm typecheck
echo "== test"; echo "DATABASE_URL=$DATABASE_URL"
AUTH_SECRET=ci-vitest-auth-secret-fixture-not-for-any-deployment pnpm exec vitest run --passWithNoTests --reporter=default --reporter=json --outputFile.json=vitest-report.json > vitest.out 2>&1 || { tail -40 vitest.out; exit 1; }
tail -8 vitest.out
echo "== gate"; pnpm exec tsx scripts/check-live-skips.ts vitest-report.json | grep -v "  allowed:"
echo "== i18n"; pnpm i18n:check > i18n.out 2>&1 || { tail -20 i18n.out; exit 1; }; tail -3 i18n.out
echo "== build"; pnpm build > build.out 2>&1 || { tail -30 build.out; exit 1; }; tail -5 build.out
echo "== ALL GREEN"
'
