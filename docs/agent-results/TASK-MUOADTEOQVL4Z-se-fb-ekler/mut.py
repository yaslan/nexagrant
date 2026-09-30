import subprocess, sys, os
WT=sys.argv[1]
SR='src/lib/relationships/stale-reminder.ts'; MG='prisma/migrations/m4-stale-digest-user-claim.sql'
M=[
 ('K3 utcDay yerel gün (toLocaleDateString)', SR, "return dayStartUtc(now).toISOString().slice(0, 10);", "return now.toLocaleDateString('en-CA');", 1),
 ('K5 releaseDigest koşulsuz', SR, ' AND "staleDigestOn" = ${utcDay(now)}::date`;', '`;', 1),
 ('SQL-M1 backfill max→min', MG, 'max("staleDigestOn")', 'min("staleDigestOn")', 1),
 ('SQL-M2 FORCE geri konmuyor', MG, '  IF forced THEN\n    ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;\n  END IF;\n', '', 1),
 ('SQL-M3 backfill yalnız yükseltmiyor', MG, '\n     AND (u."staleDigestOn" IS NULL OR u."staleDigestOn" < m.day);', ';', 1),
 ('B1-M1 eski claim yok sayılıyor', SR, '  for (const userId of legacy) mailedToday.add(userId);\n', '', 1),
 ('B1-M2 eski claim günsüz (her eski claim engeller)', SR, 'where: { tenantId, staleDigestOn: { gte: dayStartUtc(now) } }', 'where: { tenantId, staleDigestOn: { not: null } }', 1),
 ('B1-M3 eski claim yalnız kapılardan sonra okunuyor', SR, "    await legacyClaims(tx, tenantId, now, legacy);\n    if ((await getPilotState(tenantId, tx, now)).kind === 'expired') {", "    if ((await getPilotState(tenantId, tx, now)).kind === 'expired') {", 1),
]
only=sys.argv[2:] 
for name,f,a,b,_ in M:
    if only and not any(name.startswith(o) for o in only): continue
    p=os.path.join(WT,f); s=open(p).read(); assert s.count(a)==1,(name,s.count(a))
    open(p,'w').write(s.replace(a,b))
    r=subprocess.run('npx vitest run tests/stale-relationship-reminder.live.test.ts 2>&1',shell=True,cwd=WT,capture_output=True,text=True)
    subprocess.run(['git','checkout','--',f],cwd=WT)
    subprocess.run('docker exec sefbad-pg psql -U fabrika -d fabrika_ci -qc \'ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY\'',shell=True)
    out=r.stdout
    tl=[l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
    failed=[l.strip()[2:].strip() for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('✗')]
    fl=[l for l in out.splitlines() if 'FAIL ' in l and '>' in l]
    print(f'{name}: {tl[-1] if tl else "?"}')
    for l in fl[:8]: print('    ', l.strip()[:170])
