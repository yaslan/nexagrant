cd /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89
export CI=true AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment' DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55589/fabrika DATABASE_URL_RLS_TEST=postgresql://fabrika_app:fabrika_app_ci@127.0.0.1:55589/fabrika
echo "== vitest start $(date +%T) load $(sysctl -n vm.loadavg)"
npx vitest run --reporter=default --reporter=json --outputFile.json=/private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/vitest-report.json > /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/fullrun.log 2>&1; echo "VITEST_EXIT=$?"
npx tsx scripts/check-live-skips.ts /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/vitest-report.json 2>&1 | tail -2; echo "LIVESKIP_EXIT=$?"
echo "== vitest end $(date +%T) load $(sysctl -n vm.loadavg)"
grep -E "Test Files|Tests  |Duration" /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/fullrun.log
grep -E "server-action-rbac" /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/fullrun.log | head -4
npx tsc --noEmit > /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/tsc.txt 2>&1; echo "TSC_EXIT=$?"
npx eslint . > /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/lint.txt 2>&1; echo "LINT_EXIT=$?"; tail -3 /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/lint.txt
rm -rf .next; npx next build > /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/build.txt 2>&1; echo "BUILD_EXIT=$?"; grep -E "Compiled" /private/tmp/claude-501/-Users-macbook-alan/67c0c7c6-41e5-4acf-97e7-b606e117466b/scratchpad/wt89/../out89/build.txt
echo "== end $(date +%T) load $(sysctl -n vm.loadavg)"
git status --short
