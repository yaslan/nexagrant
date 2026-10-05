import subprocess, sys, hashlib
M = [
 ("N1 email window gte→gt (edge exclusive)", "src/lib/leads/public-lead.ts", "where: { email: data.email, createdAt: { gte:", "where: { email: data.email, createdAt: { gt:"),
 ("N2 ip window gte→gt (edge exclusive)", "src/lib/leads/public-lead.ts", "where: { ipHash, createdAt: { gte:", "where: { ipHash, createdAt: { gt:"),
 ("N3 EMAIL_WINDOW 24h→24h30m", "src/lib/leads/public-lead.ts", "const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;", "const EMAIL_WINDOW_MS = 24.5 * 60 * 60 * 1000;"),
 ("N4 IP_WINDOW 60→60.5 min", "src/lib/leads/public-lead.ts", "const IP_WINDOW_MS = 60 * 60 * 1000;", "const IP_WINDOW_MS = 60.5 * 60 * 1000;"),
 ("N5 clientIpFrom ignores hops (always last)", "src/lib/leads/public-lead.ts", "return chain[Math.max(0, chain.length - hops)] ?? null;", "return chain[chain.length - 1] ?? null;"),
 ("N6 short-chain clamp removed", "src/lib/leads/public-lead.ts", "return chain[Math.max(0, chain.length - hops)] ?? null;", "return chain[chain.length - hops] ?? null;"),
 ("N7 negative hops accepted", "src/lib/leads/public-lead.ts", "return Number.isInteger(n) && n >= 0 ? n : 1;", "return Number.isInteger(n) ? n : 1;"),
 ("N8 invalid env → 0 instead of 1", "src/lib/leads/public-lead.ts", "return Number.isInteger(n) && n >= 0 ? n : 1;", "return Number.isInteger(n) && n >= 0 ? n : 0;"),
 ("N9 unset env → 2", "src/lib/leads/public-lead.ts", "if (raw === undefined || raw.trim() === '') return 1;", "if (raw === undefined || raw.trim() === '') return 2;"),
 ("N10 hop entries not trimmed", "src/lib/leads/public-lead.ts", ".map((hop) => hop.trim())", ".map((hop) => hop)"),
 ("N11 empty hops kept", "src/lib/leads/public-lead.ts", "    .filter(Boolean);\n  if (chain.length === 0) return null;", "    ;\n  if (chain.length === 0) return null;"),
 ("N12 tr consent text changed, version same", "messages/tr.json", "ay saklanmasına açık rıza veriyorum.", "ay saklanmasına açıkça rıza veriyorum."),
 ("N13 retention 365→380 days (text still 12 months), version same", "src/lib/leads/public-lead-policy.ts", "export const PUBLIC_LEAD_RETENTION_DAYS = 365;", "export const PUBLIC_LEAD_RETENTION_DAYS = 380;"),
 ("N14 consent_withdraw text changed, version same", "messages/tr.json", None, None),
 ("N15 X-Real-IP preferred over XFF", "src/lib/leads/public-lead.ts", "  if (hops < 1) return null;\n  const chain", "  if (hops < 1) return null;\n  const xr = headers.get('x-real-ip'); if (xr) return xr;\n  const chain"),
]
def md5(p): return hashlib.md5(open(p,'rb').read()).hexdigest()
for name, f, a, b in M:
    s = open(f, encoding='utf8').read(); before = md5(f)
    if a is None:
        import re, json
        m = re.search(r'"consent_withdraw": "([^"]*)"', s); a = m.group(0); b = a[:-1] + ' (değişti)"'
    assert s.count(a) == 1, (name, s.count(a))
    open(f, 'w', encoding='utf8').write(s.replace(a, b))
    r = subprocess.run("npx vitest run src/lib/leads/public-lead.test.ts tests/public-lead.live.test.ts 2>&1 | grep -E 'Tests  '", shell=True, capture_output=True, text=True)
    open(f, 'w', encoding='utf8').write(s)
    assert md5(f) == before
    res = r.stdout.strip().replace('Tests  ', '')
    print(f"{name:66} {res:32} {'ÖLDÜ' if 'failed' in res else 'YAŞADI'}  (restored md5 ok)")
