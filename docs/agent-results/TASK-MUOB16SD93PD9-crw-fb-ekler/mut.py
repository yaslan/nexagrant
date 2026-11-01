import subprocess, sys, os, re
SP=os.path.dirname(os.path.abspath(__file__)); WT=SP+'/wt'
F='src/lib/relationships/stale-reminder.ts'
M=[
 ('CM1 legacyClaims yalnız vadeli sahibi olan kiracıda (ilk taslak)',
  "    await legacyClaims(tx, tenantId, now, legacy);\n    if ((await getPilotState", "    if ((await getPilotState",
  "    return due.byOwner.size > 0 ? due : null;", "    if (due.byOwner.size > 0) await legacyClaims(tx, tenantId, now, legacy);\n    return due.byOwner.size > 0 ? due : null;"),
 ('CM2 legacy gte -> lt (dünkü claim tutar, bugünkü tutmaz)',
  "where: { tenantId, staleDigestOn: { gte: dayStartUtc(now) } },", "where: { tenantId, staleDigestOn: { lt: dayStartUtc(now) } },"),
 ('CM3 legacy günü now yerine duvar saati',
  "where: { tenantId, staleDigestOn: { gte: dayStartUtc(now) } },", "where: { tenantId, staleDigestOn: { gte: dayStartUtc(new Date()) } },"),
 ('CM4 legacy set, filtre döngüsünden SONRA mailedToday\'e eklenir',
  "  for (const userId of legacy) mailedToday.add(userId);\n  const mailedTodayDue = new Set<string>();", "  const mailedTodayDue = new Set<string>();",
  "  // 3 —", "  for (const userId of legacy) mailedToday.add(userId);\n  // 3 —"),
 ('CM5 legacyClaims tenantId filtresi yok (RLS\'e güven)',
  "where: { tenantId, staleDigestOn: { gte: dayStartUtc(now) } },", "where: { staleDigestOn: { gte: dayStartUtc(now) } },"),
 ('CM6 legacyClaims yalnız ilk tenant sayfası (legacy her sayfada sıfırlanır)',
  "        const due = await collectTenant(tenantId, now, pageSize, runTenant, out, legacy);", "        const due = await collectTenant(tenantId, now, pageSize, runTenant, out, legacy);\n        if (out.tenants > 1) legacy.clear();"),
]
env=dict(os.environ)
env.update(CI='true', PATH=SP+'/bin:'+env['PATH'], PGDB='fabci',
  DATABASE_URL='postgresql://fabrika:<yerel-fikstür>@127.0.0.1:55102/fabci',
  DATABASE_URL_RLS_TEST='postgresql://fabrika_app:<yerel-fikstür>@127.0.0.1:55102/fabci', AUTH_SECRET='crwfb102-fixture')
if len(sys.argv)>1 and sys.argv[1]=='tz': env['TZ']='UTC'
src0=open(WT+'/'+F).read()
for m in M:
  name,pairs=m[0],m[1:]
  s=src0
  ok=True
  for i in range(0,len(pairs),2):
    if pairs[i] not in s: print(name,'!! kalıp yok:',pairs[i][:50]); ok=False; break
    s=s.replace(pairs[i],pairs[i+1],1)
  if not ok: continue
  open(WT+'/'+F,'w').write(s)
  p=subprocess.run(['npx','vitest','run','tests/stale-relationship-reminder.live.test.ts'],cwd=WT,env=env,capture_output=True,text=True)
  out=p.stdout+p.stderr
  t=re.findall(r'Tests\s+(.*)',out); fails=re.findall(r'(?:×|FAIL).*?> (.*?)$',out,re.M)
  print(f'{name}: exit={p.returncode} Tests {t[-1] if t else "?"}')
  for f in sorted(set(fails))[:6]: print('    -',f[:140])
  subprocess.run(['git','checkout','--',F],cwd=WT)
  subprocess.run(['docker','exec','crwfb102-pg','psql','-U','fabrika','-d','fabci','-qAtc','alter table "Membership" force row level security'])
print('git status:',subprocess.run(['git','status','--porcelain'],cwd=WT,capture_output=True,text=True).stdout.strip() or 'temiz')
