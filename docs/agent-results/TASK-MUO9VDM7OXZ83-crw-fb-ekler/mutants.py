import subprocess, sys, pathlib
W = pathlib.Path(sys.argv[1])
SH = 'src/lib/security-headers.ts'; NC = 'next.config.ts'
ONLY = sys.argv[2:]
M = [
 ('X1 served-file exclusion without trailing $ (prefix)', SH, "`(?:${served.join('|')})$`", "`(?:${served.join('|')})`"),
 ('X2 _next/image$ -> _next/image (prefix)', SH, "'_next/image$',", "'_next/image',"),
 ('X3 _next/static/ -> _next/static (no slash)', SH, "'_next/static/',", "'_next/static',"),
 ('X4 static CSP gets script-src-elem unsafe-inline', SH, "\"font-src 'self'\",", "\"font-src 'self'\",\n  \"script-src-elem 'unsafe-inline'\","),
 ('X5 static CSP img-src *', SH, "\"style-src 'self' 'unsafe-inline'\",\n  \"img-src 'self' data:\",\n  \"font-src", "\"style-src 'self' 'unsafe-inline'\",\n  \"img-src *\",\n  \"font-src"),
 ('X6 public/ not recursive', NC, "{ recursive: true, withFileTypes: true }", "{ withFileTypes: true }"),
 ('X7 static rule value = API policy', NC, "headers: [{ key: 'Content-Security-Policy', value: STATIC_FILE_CONTENT_SECURITY_POLICY }],", "headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }],"),
 ('X8 covered _next(?:/.*)? -> _next/.*', SH, "|_next(?:/.*)?|", "|_next/.*|"),
]
for name, f, old, new in M:
    if ONLY and name.split()[0] not in ONLY: continue
    p = W / f; src = p.read_text()
    assert src.count(old) == 1, (name, src.count(old))
    p.write_text(src.replace(old, new))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', 'src/lib/security-headers.test.ts'], cwd=W, capture_output=True, text=True)
        failed = [l for l in r.stdout.splitlines() if 'Tests' in l and ('failed' in l or 'passed' in l)]
        print(('KILLED  ' if r.returncode else 'SURVIVED') + f'  {name}  :: {failed[-1].strip() if failed else r.returncode}', flush=True)
    finally:
        p.write_text(src)
