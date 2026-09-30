import subprocess, sys, shutil
M = [
 ("M17 matcher→['/api/:path*']", "src/proxy.ts", """  matcher: [
    '/',
    '/(tr|en)/:path*',
    '/((?!api|_next|_vercel|.*\\\\.(?:ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map)$).*)'
  ]""", "  matcher: ['/api/:path*']", "src/lib/security-headers.test.ts"),
 ("Y1-old matcher .*\\\\..*", "src/proxy.ts", ".*\\\\.(?:ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map)$", ".*\\\\..*", "src/lib/security-headers.test.ts"),
 ("matcher drops public exclusion (svg)", "src/proxy.ts", "avif|svg|txt", "avif|txt", "src/lib/security-headers.test.ts"),
 ("proxy: dotted bypass removed (always intl)", "src/proxy.ts", "isLocalelessDottedPath(request.nextUrl.pathname)\n    ?", "false\n    ?", "src/lib/security-headers.test.ts"),
 ("CSP: report-uri dropped", "src/lib/security-headers.ts", "    ['report-uri', [CSP_REPORT_PATH]],\n", "", "src/lib/security-headers.test.ts"),
 ("CSP: report-to added", "src/lib/security-headers.ts", "    ['report-uri', [CSP_REPORT_PATH]],\n", "    ['report-uri', [CSP_REPORT_PATH]],\n    ['report-to', ['csp-endpoint']],\n", "src/lib/security-headers.test.ts"),
 ("csp-report: query kept in page", "src/lib/csp-report.ts", "return new URL(raw).pathname.slice(0, MAX_FIELD);", "return raw;", "src/lib/csp-report.test.ts"),
 ("csp-report: body cap off", "src/lib/csp-report.ts", "if (size > limit) {", "if (false) {", "src/lib/csp-report.test.ts"),
 ("csp-report: global limit off", "src/lib/csp-report.ts", "if (this.total > this.globalLimit) return false;", "", "src/lib/csp-report.test.ts"),
 ("csp-report: control chars kept", "src/lib/csp-report.ts", "value.replace(/[^\\x20-\\x7e]/g, '?')", "value", "src/lib/csp-report.test.ts"),
 ("O-1 M1 requireTestEnv warn only", "tests/helpers/live-db-role.ts", "  skipOrFailInCi(\n    suite,\n    `${name} is not set`,", "  console.warn(\n    suite,\n    `${name} is not set`,", "tests/helpers/live-db-role.test.ts"),
 ("O-1 M2 isCi()→false", "tests/helpers/live-db-role.ts", "  if (isCi()) {", "  if (false) {", "tests/helpers/live-db-role.test.ts"),
 ("O-1 M3 value→undefined", "tests/helpers/live-db-role.ts", "  if (value) return value;", "  if (value) return undefined;", "tests/helpers/live-db-role.test.ts"),
 ("gate: skipped allowed", "scripts/live-skip-gate.ts", "const RAN = new Set(['passed', 'failed']);", "const RAN = new Set(['passed', 'failed', 'skipped']);", "tests/live-skip-gate.test.ts"),
 ("gate: vacuous report passes", "scripts/live-skip-gate.ts", "if (files.length === 0) problems.push", "if (false) problems.push", "tests/live-skip-gate.test.ts"),
 ("ci.yml: gate line removed", ".github/workflows/ci.yml", "        pnpm exec tsx scripts/check-live-skips.ts vitest-report.json\n", "", "tests/live-skip-gate.test.ts"),
 ("ci.yml: back to pnpm test", ".github/workflows/ci.yml", "pnpm exec vitest run --passWithNoTests --reporter=default --reporter=json --outputFile.json=vitest-report.json", "pnpm test", "tests/live-skip-gate.test.ts"),
 ("ci.yml: AUTH_SECRET removed", ".github/workflows/ci.yml", "        AUTH_SECRET: 'ci-vitest-auth-secret-fixture-not-for-any-deployment'\n", "", "tests/live-skip-gate.test.ts"),
 ("O-2: auditevent back to expect(skipReason)", "tests/auditevent-null-system-only.live.test.ts", "    if (!ready || !rls) return ctx.skip(skipReason);\n    expect(await rls.auditEvent.count()).toBe(0);", "    if (!ready || !rls) return expect(skipReason).toBeTruthy();\n    expect(await rls.auditEvent.count()).toBe(0);", "tests/live-skip-gate.test.ts"),
]
for name, f, a, b, t in M:
    s = open(f).read()
    assert s.count(a) == 1, (name, s.count(a))
    shutil.copy(f, f + '.bak')
    open(f, 'w').write(s.replace(a, b))
    r = subprocess.run(['npx', 'vitest', 'run', t], capture_output=True, text=True)
    shutil.move(f + '.bak', f)
    tail = [l for l in (r.stdout + r.stderr).splitlines() if l.strip().startswith('Tests ')]
    print(f"{'KILLED' if r.returncode else 'SURVIVED'}  {name}  [{t}] {tail[-1].strip() if tail else ''}", flush=True)
