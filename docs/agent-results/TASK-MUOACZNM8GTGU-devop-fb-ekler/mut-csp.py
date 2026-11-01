# usage: mut-csp.py <worktree> [ids...] — each mutant alone, `vitest run src/lib/security-headers.test.ts`
# X2–X4: crw-fb's (TASK-MUO9VDM7OXZ83 mutants.py). P1–P7: this change (proxy matcher / proxy()).
import subprocess, sys, pathlib, re
W = pathlib.Path(sys.argv[1]); ONLY = sys.argv[2:]
SH = 'src/lib/security-headers.ts'; PX = 'src/proxy.ts'
CLS = '[-a-z0-9_./]'
M = [
 ('X2 header: _next/image$ -> _next/image (prefix)', SH, "'_next/image$',", "'_next/image',"),
 ('X3 header: _next/static/ -> _next/static (no slash)', SH, "'_next/static/',", "'_next/static',"),
 ('X4 static CSP gets script-src-elem unsafe-inline', SH, "\"font-src 'self'\",", "\"font-src 'self'\",\n  \"script-src-elem 'unsafe-inline'\","),
 ('P1 matcher ext: lowercase class -> .* (old matcher)', PX, CLS + "*\\\\.(?:", ".*\\\\.(?:"),
 ('P2 matcher ext: lowercase class -> [^A-Z] (misses non-ASCII fold)', PX, CLS + "*\\\\.(?:", "[^A-Z]*\\\\.(?:"),
 ('P3 matcher: _next lowercase-only -> any _next (old)', PX, "_next(?:/" + CLS + "*)?$", "_next(?:/.*)?$"),
 ('P4 matcher: class gains A-Z', PX, "_next(?:/" + CLS + "*)?$|" + CLS, "_next(?:/[-a-zA-Z0-9_./]*)?$|[-a-zA-Z0-9_./]"),
 ('P5 matcher: drop _next/static/ skip', PX, "_next/static/|", ""),
 ('P6 proxy(): no _next/_vercel pass-through', PX, "  if (/^\\/_(?:next|vercel)(?:\\/|$)/i.test(pathname)) return true;\n", ""),
 ('P7 proxy(): _next pass-through case-sensitive', PX, "(?:\\/|$)/i.test(pathname)) return true;", "(?:\\/|$)/.test(pathname)) return true;"),
]
for name, f, old, new in M:
    if ONLY and name.split()[0] not in ONLY: continue
    p = W / f; src = p.read_text()
    if src.count(old) != 1:
        print(f'N/A       {name}  (pattern count {src.count(old)})', flush=True); continue
    p.write_text(src.replace(old, new))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', 'src/lib/security-headers.test.ts'], cwd=W, capture_output=True, text=True)
        t = [l.strip() for l in r.stdout.splitlines() if re.match(r'\s*Tests\s', l)]
        print(('KILLED  ' if r.returncode else 'SURVIVED') + f'  {name}  :: {t[-1] if t else r.returncode}', flush=True)
    finally:
        p.write_text(src)
