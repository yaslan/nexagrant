import subprocess, re, sys, shutil, os
W=os.path.dirname(os.path.abspath(__file__))+'/wt'; F=W+'/src/lib/relationships/stale-reminder.ts'
orig=open(F).read()
M={
 'K1 claim <= (aynı gün yeniden claim)': ('o.prev < ${today}::date', 'o.prev <= ${today}::date'),
 'K2 claim her zaman kazanılmış': ('rows.length === 1 ? { previous: rows[0]!.previous }', 'rows.length >= 0 ? { previous: rows[0]?.previous ?? null }'),
 'K3 gün yerel saatle (toLocaleDateString)': ("dayStartUtc(now).toISOString().slice(0, 10)", "now.toLocaleDateString('en-CA')"),
 'K4 claim günü Date olarak bağlanır': ('SET "staleDigestOn" = ${today}::date', 'SET "staleDigestOn" = ${dayStartUtc(now)}::date'),
 'K5 release koşulsuz': ('WHERE id = ${userId} AND "staleDigestOn" = ${utcDay(now)}::date', 'WHERE id = ${userId}'),
 'K7 claimedToday gte->gt': ("staleDigestOn: { gte: dayStartUtc(now) } },\n      select: { id: true }", "staleDigestOn: { gt: dayStartUtc(now) } },\n      select: { id: true }"),
 'K10 alt sorguda WHERE id yok (tüm User)': ('FROM "User" WHERE id = ${userId} FOR UPDATE', 'FROM "User" FOR UPDATE'),
 'K11 release previous yerine NULL': ('SET "staleDigestOn" = ${previous}::date', 'SET "staleDigestOn" = NULL'),
}
only=sys.argv[1:] 
env=dict(os.environ, CI='true')
try:
  for name,(a,b) in M.items():
    if only and not any(name.startswith(o) for o in only): continue
    assert orig.count(a)==1, (name, orig.count(a))
    open(F,'w').write(orig.replace(a,b))
    r=subprocess.run(['npx','vitest','run','tests/stale-relationship-reminder.live.test.ts'],cwd=W,env=env,capture_output=True,text=True)
    out=r.stdout+r.stderr
    fails=sorted(set(re.findall(r'(?:×|FAIL)\s+.*?>\s*(.+?)(?:\s+\d+ms)?$',out,re.M)))
    tl=[l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
    print(f'{name}: exit={r.returncode} {tl[-1] if tl else "?"}')
    for f in fails[:6]: print('   ×',f[:150])
finally:
  open(F,'w').write(orig)
