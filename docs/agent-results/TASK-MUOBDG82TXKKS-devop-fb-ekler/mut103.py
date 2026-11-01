import subprocess, sys, os, time
W = os.environ['W']
A = 'src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
S = 'src/lib/storage.ts'
D = 'src/lib/db.ts'
COPY_SEND = "        MetadataDirective: 'COPY',\n      }), opts);"
M = {
 'Q1 idle_in_transaction oturum düzeyi (is_local=false)': (A, "set_config('idle_in_transaction_session_timeout', ${`${CONFIRM_IDLE_MS}ms`}, true)", "set_config('idle_in_transaction_session_timeout', ${`${CONFIRM_IDLE_MS}ms`}, false)"),
 'Q2 statement_timeout oturum düzeyi (is_local=false)': (A, "set_config('statement_timeout', ${`${CONFIRM_STATEMENT_MS}ms`}, true)", "set_config('statement_timeout', ${`${CONFIRM_STATEMENT_MS}ms`}, false)"),
 'Q3 CopyObject süre sınırsız': (S, COPY_SEND, "        MetadataDirective: 'COPY',\n      }));"),
 'Q4 geri-okuma HEAD süre sınırsız': (S, "new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: finalKey }), opts)", "new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: finalKey }))"),
 'Q5 withTenantLockPool maxWait yok (Prisma varsayılanı 2 sn)': (D, "{ maxWait: LOCK_POOL_QUEUE_MS, ...options }", "options"),
 'Q6 kilit havuzu connectionTimeoutMillis yok (1 sn)': (D, "  connectionTimeoutMillis: LOCK_POOL_QUEUE_MS,\n  application_name", "  application_name"),
 'Q7 CONFIRM_IDLE_MS 20 sn → 60 sn': (A, "const CONFIRM_IDLE_MS = 20_000;", "const CONFIRM_IDLE_MS = 60_000;"),
 'Q8 CONFIRM_MARGIN_MS 2 sn → 0': (A, "const CONFIRM_MARGIN_MS = 2_000;", "const CONFIRM_MARGIN_MS = 0;"),
 'Q9 kalan < 1 sn kontrolü yok': (A, "        if (timeLeft < CONFIRM_MIN_COPY_MS) return { kind: 'not_copied' as const, error: 'storage_unavailable' as const };\n", ""),
 'Q10 txStartedAt kilitten SONRA ölçülüyor': (A, "        const txStartedAt = Date.now();\n        await tx.$executeRaw`SELECT set_config('lock_timeout'", "        await tx.$executeRaw`SELECT set_config('lock_timeout'"),
 'Q11 statement_timeout 5 sn → 50 sn': (A, "const CONFIRM_STATEMENT_MS = 5_000;", "const CONFIRM_STATEMENT_MS = 50_000;"),
 'Q12 kilit havuzu application_name yok': (D, "  application_name: LOCK_POOL_NAME,\n};", "};"),
}
# Q10 needs the declaration moved after the lock:
Q10_EXTRA = ("        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${confirmLockKey(finalKey)})`;\n", "        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${confirmLockKey(finalKey)})`;\n        const txStartedAt = Date.now();\n")
suites = sys.argv[1:] or ['tests/evidence', 'tests/lock-pool']
env = dict(os.environ, CI='true')
ONLY = os.environ.get("ONLY", "").split(",")
for name, (f, a, b) in M.items():
    if ONLY != [""] and name.split()[0] not in ONLY: continue
    p = os.path.join(W, f); src = open(p).read()
    assert src.count(a) == 1, (name, src.count(a))
    new = src.replace(a, b)
    if name.startswith('Q10 '):
        assert new.count(Q10_EXTRA[0]) == 1
        new = new.replace(*Q10_EXTRA)
    open(p, 'w').write(new)
    try:
        t0 = time.time()
        r = subprocess.run(['npx', 'vitest', 'run', *suites], cwd=W, env=env, capture_output=True, text=True, timeout=1500)
        out = r.stdout + r.stderr
        summ = [l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
        failed = sorted({l.strip()[:150] for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('FAIL ')})
        verdict = 'KILLED' if r.returncode != 0 else 'SURVIVED'
        print(f"{verdict:8} {name} :: {summ[-1] if summ else '?'} ({int(time.time()-t0)}s)", flush=True)
        for l in failed[:6]: print('         ', l, flush=True)
    finally:
        open(p, 'w').write(src)
    d = subprocess.run(['git', 'status', '--porcelain', '--', 'src'], cwd=W, capture_output=True, text=True).stdout
    assert d == '', ('source not restored', d)
print('restored: git status src clean', flush=True)
