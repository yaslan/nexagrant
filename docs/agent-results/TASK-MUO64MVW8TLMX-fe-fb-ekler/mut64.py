import subprocess, shutil, sys, os
W=os.environ['WT']; A='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'; S='src/lib/storage.ts'
M=[
 ('K1 kilit yok (advisory lock satırı silinir)',A,"        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${confirmLockKey(finalKey)})`;\n",""),
 ('K2 lock_timeout yok (sınırsız bekleme)',A,"        await tx.$executeRaw`SELECT set_config('lock_timeout', ${CONFIRM_LOCK_WAIT}, true)`;\n",""),
 ('K3 tx süresi varsayılan 5 sn',A,"      { timeout: CONFIRM_TX_TIMEOUT_MS }\n","      undefined\n"),
 ('K4 kopya süre sınırı yok',S,"const opts = { abortSignal: AbortSignal.timeout(EVIDENCE_COPY_DEADLINE_MS) };","const opts = {};"),
 ('K5 ön-kontrol DB hatası yutulur (N5)',A,"const recorded = await tx.evidence.findFirst({ where: { tenantId, r2ObjectKey: finalKey }, select: { id: true } });","const recorded = await tx.evidence.findFirst({ where: { tenantId, r2ObjectKey: finalKey }, select: { id: true } }).catch(() => null);"),
 ('K6 dev deposu staging taşır (N9)',S,"    await copyFile(from, partial);","    await rename(from, partial);"),
 ('K7 desende ^ yok (N7)',S,"const INCOMING_KEY_SHAPE = /^incoming","const INCOMING_KEY_SHAPE = /incoming"),
 ('K8 kilit anahtarı sabit değil (her çağrıda farklı)',A,"update(`evidence-confirm:${finalKey}`)","update(`evidence-confirm:${finalKey}:${Math.random()}`)"),
 ('K9 kaydedilmişse staging silinmez',A,"  if (outcome.kind === 'recorded') {\n    await deleteObjectBytes(objectKey);","  if (outcome.kind === 'recorded') {"),
 ('K10 kayıt yoksa bile already_confirmed değil kopya (recorded dalı yok)',A,"        if (recorded) return { kind: 'recorded' as const };\n",""),
]
only=sys.argv[1:] 
for name,f,old,new in M:
  if only and name.split()[0] not in only: continue
  p=os.path.join(W,f); src=open(p).read(); assert src.count(old)==1,(name,src.count(old))
  open(p,'w').write(src.replace(old,new))
  try:
    r=subprocess.run(['npx','vitest','run','tests/evidence-'],cwd=W,capture_output=True,text=True,timeout=900)
    out=r.stdout+r.stderr
    tl=[l for l in out.splitlines() if l.strip().startswith('Tests ')]
    fails=sorted(set(l.strip() for l in out.splitlines() if l.strip().startswith('×') or ' FAIL ' in l))[:6]
    print(('KILLED  ' if r.returncode else 'SURVIVED'),name,'|',tl[-1].strip() if tl else '?',flush=True)
    for x in fails: print('     ',x[:170],flush=True)
  finally:
    open(p,'w').write(src)
