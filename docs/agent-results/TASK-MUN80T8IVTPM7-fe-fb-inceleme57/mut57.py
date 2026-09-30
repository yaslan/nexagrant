import subprocess, sys
W = sys.argv[1]
M = [
 ("M1 HSTS dropped", "src/lib/security-headers.ts", "  { key: 'Strict-Transport-Security', value: HSTS_VALUE },\n", ""),
 ("M2 HSTS preload added", "src/lib/security-headers.ts", "'max-age=31536000; includeSubDomains'", "'max-age=31536000; includeSubDomains; preload'"),
 ("M3 poweredByHeader true", "next.config.ts", "poweredByHeader: false", "poweredByHeader: true"),
 ("M4 proxy: no CSP on request", "src/proxy.ts", "  requestHeaders.set('Content-Security-Policy', csp);\n", ""),
 ("M5 proxy: no CSP on response", "src/proxy.ts", "  response.headers.set(cspHeaderName(), csp);\n", ""),
 ("M6 frame-ancestors none->*", "src/lib/security-headers.ts", "['frame-ancestors', [\"'none'\"]]", "['frame-ancestors', ['*']]"),
 ("M7 constant nonce", "src/lib/security-headers.ts", "  crypto.getRandomValues(bytes);\n", ""),
 ("M8 unsafe-inline in script-src", "src/lib/security-headers.ts", "\"'strict-dynamic'\", ...(opts.isDev", "\"'strict-dynamic'\", \"'unsafe-inline'\", ...(opts.isDev"),
 ("M9 /api CSP entry removed", "next.config.ts", "headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }]", "headers: []"),
 ("M10 Permissions-Policy camera=(self)", "src/lib/security-headers.ts", "'camera=(), ", "'camera=(self), "),
 ("M11 report-only switch ignored", "src/lib/security-headers.ts", "? 'Content-Security-Policy-Report-Only'", "? 'Content-Security-Policy'"),
 ("M12 X-Frame-Options SAMEORIGIN", "src/lib/security-headers.ts", "{ key: 'X-Frame-Options', value: 'DENY' }", "{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }"),
 ("M13 nosniff dropped", "src/lib/security-headers.ts", "  { key: 'X-Content-Type-Options', value: 'nosniff' },\n", ""),
 ("M14 object-src none->self", "src/lib/security-headers.ts", "['object-src', [\"'none'\"]]", "['object-src', [\"'self'\"]]"),
 ("M15 connect-src wildcard https:", "src/lib/security-headers.ts", "['connect-src', [\"'self'\", ", "['connect-src', [\"'self'\", 'https:', "),
 ("M16 proxy matcher also skips /tr", "src/proxy.ts", "    '/(tr|en)/:path*',\n", ""),
]
for name, f, a, b in M:
    p = f"{W}/{f}"; s = open(p).read()
    if a not in s: print(f"{name}: PATTERN NOT FOUND"); continue
    open(p, 'w').write(s.replace(a, b, 1))
    r = subprocess.run(["npx", "vitest", "run", "src/lib/security-headers.test.ts"], cwd=W, capture_output=True, text=True)
    out = r.stdout + r.stderr
    line = [l for l in out.splitlines() if l.strip().startswith("Tests")]
    print(f"{name}: {'KILLED' if r.returncode else 'SURVIVED'} | {line[-1].strip() if line else out[-200:]}")
    subprocess.run(["git", "checkout", "--", f], cwd=W)
