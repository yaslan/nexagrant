cd <wt>
export CI=true AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment' DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55580/fabrika DATABASE_URL_RLS_TEST=postgresql://fabrika_app:fabrika_app_ci@127.0.0.1:55580/fabrika
for r in 1 2; do
  echo "== run $r start $(date +%T) load $(sysctl -n vm.loadavg)"
  npx vitest run --passWithNoTests --reporter=default --reporter=json --outputFile.json=<wt>/../out/vitest-report-$r.json > <wt>/../out/fullrun-$r.log 2>&1; echo "EXIT=$?"
  npx tsx scripts/check-live-skips.ts <wt>/../out/vitest-report-$r.json 2>&1 | tail -2; echo "LIVESKIP_EXIT=$?"
  echo "== run $r end $(date +%T) load $(sysctl -n vm.loadavg)"
  grep -E "Test Files|Tests  " <wt>/../out/fullrun-$r.log
done
