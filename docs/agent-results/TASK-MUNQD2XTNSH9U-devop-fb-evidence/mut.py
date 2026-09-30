# devop-fb İNCELEME-61 re-check: mutants against the new tests. Each is applied, the two
# public-lead suites run on the isolated DB, then the file is restored with `git checkout --`.
import subprocess, sys
L = 'src/lib/leads/public-lead.ts'
M = [
  ('Q1 ipBucket off (full address again)', L, "  if (!isIPv6(bare)) return ip;", "  if (bare || !isIPv6(bare)) return ip;"),
  ('Q2 IPv6 bucket /48 instead of /64', L, "groups.slice(0, 4).map", "groups.slice(0, 3).map"),
  ('Q3 IPv4-mapped not unwrapped', L, "groups[5] === 0xffff) {", "groups[5] === 0xfffe) {"),
  ('Q4 email window gte->gt', L, "where: { email: data.email, createdAt: { gte:", "where: { email: data.email, createdAt: { gt:"),
  ('Q5 ip window gte->gt', L, "where: { ipHash, createdAt: { gte:", "where: { ipHash, createdAt: { gt:"),
  ('Q6 IP window 60 -> 60.5 min', L, "const IP_WINDOW_MS = 60 * 60 * 1000;", "const IP_WINDOW_MS = 60.5 * 60 * 1000;"),
  ('Q7 no upper bound on hops', L, "Number(value) <= MAX_TRUSTED_PROXY_HOPS", "Number(value) >= 0"),
  ('Q8 no warn on fallback', L, "    logger.warn('TRUSTED_PROXY_HOPS", "    void ('TRUSTED_PROXY_HOPS"),
  ('Q9 consent_withdraw text changed, version same', 'messages/tr.json', "Rızanızı dilediğiniz zaman geri alabilirsiniz.", "Rızanızı her zaman geri alabilirsiniz."),
]
for name, path, a, b in M:
    s = open(path, encoding='utf8').read()
    assert s.count(a) == 1, (name, s.count(a))
    open(path, 'w', encoding='utf8').write(s.replace(a, b))
    r = subprocess.run(['pnpm', 'exec', 'vitest', 'run', 'src/lib/leads/public-lead.test.ts', 'tests/public-lead.live.test.ts'], capture_output=True, text=True)
    subprocess.run(['git', 'checkout', '--', path], check=True)
    line = [l for l in r.stdout.splitlines() if 'Tests ' in l]
    print(f"{name:52s} {line[-1].strip() if line else r.stdout[-200:]}  {'KILLED' if r.returncode else 'SURVIVED'}")
print('tree clean:', subprocess.run(['git', 'status', '--porcelain', '--', 'src', 'messages', 'tests'], capture_output=True, text=True).stdout == '')
