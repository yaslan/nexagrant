import subprocess, os, sys
W = sys.argv[1]
F = 'src/lib/leads/public-lead.ts'
C = 'docker-compose.yml'
M = [
 ('P1 /64 -> /128 (full IPv6 address)', F, "return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;", "return groups.map((g) => g.toString(16)).join(':');"),
 ('P2 unset TRUSTED_PROXY_HOPS -> 0', F, "if (raw === undefined || raw.trim() === '') return 1;", "if (raw === undefined || raw.trim() === '') return 0;"),
 ('P3 invalid hops fallback 1 -> 0', F, "  return 1;\n}\n\n/**\n * The client address", "  return 0;\n}\n\n/**\n * The client address"),
 ('P4 clientIpFrom ignores hops (last entry)', F, "return chain[Math.max(0, chain.length - hops)] ?? null;", "return chain[chain.length - 1] ?? null;"),
 ('P5 clientIpFrom reads first entry', F, "return chain[Math.max(0, chain.length - hops)] ?? null;", "return chain[0] ?? null;"),
 ('P6 zone id not stripped', F, ".replace(/%.*$/, '')", ""),
 ('P7 brackets not stripped', F, ".replace(/^\\[(.*)\\]$/, '$1')", ""),
 ('P8 mapped check ignores ::ffff marker', F, "&& groups[5] === 0xffff", "&& groups[5] !== 1"),
 ('P9 hashClientIp hashes raw ip', F, ".update(ipBucket(ip))", ".update(ip)"),
 ('P10 hops<1 guard removed', F, "  if (hops < 1) return null;\n", ""),
 ('P11 lower-case removed', F, "expandIPv6(bare.toLowerCase())", "expandIPv6(bare)"),
 ('P12 hops regex unanchored end', F, "/^\\d+$/.test(value)", "/^\\d+/.test(value)"),
 ('P13 ipBucket trim removed', F, "const bare = ip.trim()", "const bare = ip"),
 ('P14 /64 -> /56 (mask 4th group)', F, "groups.slice(0, 4).map((g) => g.toString(16))", "groups.slice(0, 4).map((g, i) => (i === 3 ? g & 0xff00 : g).toString(16))"),
 ('C1 compose web port back on 0.0.0.0', C, '"127.0.0.1:${FABRIKA_WEB_PORT:-3000}:3000"', '"${FABRIKA_WEB_PORT:-3000}:3000"'),
 ('C2 compose TRUSTED_PROXY_HOPS default 0', C, "TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}", "TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-0}"),
 ('C3 compose TRUSTED_PROXY_HOPS line removed', C, "      - TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}\n", ""),
]
tests = ['src/lib/leads/public-lead.test.ts', 'tests/public-lead.live.test.ts', 'tests/teardown-where-guard.test.ts']
for name, f, old, new in M:
    p = os.path.join(W, f); src = open(p).read()
    if src.count(old) != 1: print(f'{name:48} NOT APPLIED (count={src.count(old)})'); continue
    open(p, 'w').write(src.replace(old, new))
    r = subprocess.run(['npx', 'vitest', 'run', *tests], cwd=W, capture_output=True, text=True)
    out = r.stdout + r.stderr
    failed = [l.strip() for l in out.splitlines() if 'Tests' in l and ('failed' in l or 'passed' in l)]
    subprocess.run(['git', 'checkout', '--', f], cwd=W)
    print(f'{name:48} {"KILLED" if r.returncode else "SURVIVED"}  {failed[-1] if failed else ""}', flush=True)
st = subprocess.run(['git', 'status', '--porcelain', '--', 'src', 'docker-compose.yml'], cwd=W, capture_output=True, text=True).stdout
print('tree clean (src+compose, excluding probe):', [l for l in st.splitlines() if 'zz-probe' not in l] == [])
