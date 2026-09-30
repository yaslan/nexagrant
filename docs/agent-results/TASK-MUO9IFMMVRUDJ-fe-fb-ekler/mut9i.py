import subprocess, sys, shutil, os
WT=os.path.dirname(os.path.abspath(__file__))+'/../wt'
A='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
S='src/lib/storage.ts'
D='src/lib/db.ts'
FS='tests/evidence-confirm-store-faults.live.test.ts'
LP='tests/lock-pool.live.test.ts'
M=[
 ('N1  confirm uygulama havuzunda (withTenant)', A, 'outcome = await withTenantLockPool(', 'outcome = await withTenant(', FS, 'B-1: ten confirms'),
 ('N2  idle_in_transaction_session_timeout yok', A, ",\n          set_config('idle_in_transaction_session_timeout', ${`${CONFIRM_IDLE_MS}ms`}, true)", '', FS, 'Y-2'),
 ('N3  statement_timeout yok', A, "        await tx.$executeRaw`SELECT set_config('statement_timeout', ${`${CONFIRM_STATEMENT_MS}ms`}, true)`;\n", '', FS, 'statement_timeout'),
 ('N4  kopya süresi boşta-kalma payını saymıyor', A, '    lastSentAt + CONFIRM_IDLE_MS - CONFIRM_MARGIN_MS - now,', '    EVIDENCE_COPY_DEADLINE_MS,', FS, 'idle through it'),
 ('N5  boşta saati findFirst DÖNÜNCE ölçülüyor', A, 'copyTimeLeft(txStartedAt, readSentAt)', 'copyTimeLeft(txStartedAt, Date.now())', FS, 'idle through it'),
 ('N6  lock_timeout oturum düzeyi (sızar) [eski M2]', A, "${`${CONFIRM_LOCK_WAIT_MS}ms`}, true)", "${`${CONFIRM_LOCK_WAIT_MS}ms`}, false)", FS, 'T-3'),
 ('N7  kilit anahtarı kiracı geneli [eski M5]', A, 'confirmLockKey(finalKey)', 'confirmLockKey(tenantId)', FS, 'T-4'),
 ('N8  HEAD/GET süre sınırsız [eski M8]', S, "new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: incomingKey }), opts)", "new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: incomingKey }))", FS, 'T-5: a store that holds the HEAD'),
 ('N8b ranged GET süre sınırsız [eski M8]', S, "IfMatch: etag }), opts)", "IfMatch: etag }))", FS, 'T-5: a store that holds the GET'),
 ('N9  kopya çağıranın süresini yok sayıyor', S, 'Math.min(deadlineMs, EVIDENCE_COPY_DEADLINE_MS)', 'EVIDENCE_COPY_DEADLINE_MS', FS, 'idle through it'),
 ('N10 kopya süresi tx kalanını saymıyor', A, '    txStartedAt + CONFIRM_TX_TIMEOUT_MS - CONFIRM_STATEMENT_MS - CONFIRM_MARGIN_MS - now', '    EVIDENCE_COPY_DEADLINE_MS', FS, 'own timeout'),
 ('N11 tx süresi = kilit + kopya, pay yok [eski M12]', A, 'CONFIRM_LOCK_WAIT_MS + CONFIRM_STATEMENT_MS + EVIDENCE_COPY_DEADLINE_MS + CONFIRM_STATEMENT_MS + 5_000;', 'CONFIRM_LOCK_WAIT_MS + EVIDENCE_COPY_DEADLINE_MS;', FS, 'own timeout'),
 ('N12 statement_timeout kilitten ÖNCE (kilit beklemesi 5 sn)', A, "        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${confirmLockKey(finalKey)})`;\n        // After the lock: the wait for it has its own limit above.\n        await tx.$executeRaw`SELECT set_config('statement_timeout', ${`${CONFIRM_STATEMENT_MS}ms`}, true)`;", "        await tx.$executeRaw`SELECT set_config('statement_timeout', ${`${CONFIRM_STATEMENT_MS}ms`}, true)`;\n        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${confirmLockKey(finalKey)})`;", FS, 'waits for the one ahead'),
 ('N13 kilit havuzu sınırsız (max 20)', D, '  max: LOCK_POOL_MAX,\n', '  max: 20,\n', FS+' '+LP, 'B-1: ten confirms|never holds more'),
 ('N14 withTenantLockPool uygulama havuzunu kullanıyor', D, 'return withTenantOn(lockPoolClient(), tenantId', 'return withTenantOn(prisma, tenantId', LP, 'runs on the lock pool'),
]
env=dict(os.environ)
only=sys.argv[1:] 
for name,f,old,new,tests,pat in M:
    if only and not any(name.startswith(o) for o in only): continue
    p=os.path.join(WT,f); src=open(p).read()
    if src.count(old)!=1: print(f'BADPATTERN {name} count={src.count(old)}', flush=True); continue
    shutil.copy(p,p+'.orig')
    try:
        open(p,'w').write(src.replace(old,new))
        r=subprocess.run(['npx','vitest','run',*tests.split(),'-t',pat],cwd=WT,env=env,capture_output=True,text=True,timeout=900)
        out=r.stdout+r.stderr
        summ=[l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
        fails=[l.strip()[:150] for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('FAIL ')][:2]
        print(f"{'KILLED  ' if r.returncode!=0 else 'SURVIVED'} {name} | -t '{pat}' | {summ[-1] if summ else '?'} | {' ; '.join(fails)}", flush=True)
    finally:
        shutil.move(p+'.orig',p)
r=subprocess.run(['git','status','--short','src'],cwd=WT,capture_output=True,text=True)
print('restored: git status src →', r.stdout.strip().replace('\n',' ; '))
