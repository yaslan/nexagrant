import subprocess, sys, os, time
W = os.path.dirname(os.path.abspath(__file__)) + '/wt92'
A = 'src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
S = 'src/lib/storage.ts'
LOCK = "        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${confirmLockKey(finalKey)})`;\n"
FF = "        const recorded = await tx.evidence.findFirst({ where: { tenantId, r2ObjectKey: finalKey }, select: { id: true } });\n"
M = {
 'M1 kilit findFirst\'ten SONRA': (A, LOCK + "\n        // D-3 (TASK-MUNTTZ94LJWBC): a key already on a row is not copied again,\n        // so a PUT to the staging key after confirm cannot reach the recorded file.\n" + FF,
        "\n        // D-3 (TASK-MUNTTZ94LJWBC): a key already on a row is not copied again,\n        // so a PUT to the staging key after confirm cannot reach the recorded file.\n" + FF + LOCK),
 'M2 lock_timeout oturum düzeyi (is_local=false)': (A, "${CONFIRM_LOCK_WAIT}, true)", "${CONFIRM_LOCK_WAIT}, false)"),
 'M3 oturum kilidi pg_advisory_lock': (A, "SELECT pg_advisory_xact_lock(", "SELECT pg_advisory_lock("),
 'M4 pg_try_advisory_xact_lock (beklemez)': (A, "SELECT pg_advisory_xact_lock(", "SELECT pg_try_advisory_xact_lock("),
 'M5 kilit anahtarı kiracı geneli': (A, "confirmLockKey(finalKey)", "confirmLockKey(tenantId)"),
 'M6 await yok (PrismaPromise hiç koşmaz)': (A, "        await tx.$executeRaw`SELECT pg_advisory_xact_lock(", "        void tx.$executeRaw`SELECT pg_advisory_xact_lock("),
 'M7 süre sınırı çağrı başına (toplam 60 sn)': (S, "const opts = { abortSignal: AbortSignal.timeout(EVIDENCE_COPY_DEADLINE_MS) };", "const opts = { get abortSignal() { return AbortSignal.timeout(EVIDENCE_COPY_DEADLINE_MS); } };"),
 'M8 HEAD/GET süre sınırsız (yalnız kopya)': (S, "new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: incomingKey }), opts)", "new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: incomingKey }))"),
 'M9 P2002 dalında staging silinmez': (A, "    if (errorCode(error) === 'P2002') {\n      // (tenantId, r2ObjectKey) is unique; the lock makes this unreachable for\n      // confirms, but a row written by another path is still a row.\n      await deleteObjectBytes(objectKey);", "    if (errorCode(error) === 'P2002') {\n      // (tenantId, r2ObjectKey) is unique; the lock makes this unreachable for\n      // confirms, but a row written by another path is still a row.\n"),
 'M10 desende $ yok': (S, "\\.[a-z0-9]{1,10}$/;", "\\.[a-z0-9]{1,10}/;"),
 'M11 iç-içe incoming kontrolü yok': (S, "if (!shape || shape[1] === INCOMING_SEGMENT) return null;", "if (!shape) return null;"),
 'M12 tx süresi = kilit + kopya (payı yok, 25 sn)': (A, "10_000 + EVIDENCE_COPY_DEADLINE_MS + 15_000", "10_000 + EVIDENCE_COPY_DEADLINE_MS"),
}
suites = sys.argv[1:] or ['tests/evidence']
env = dict(os.environ, CI='true')
ONLY = os.environ.get("ONLY", "").split(",")
for name, (f, a, b) in M.items():
    if ONLY != [""] and name.split()[0] not in ONLY: continue
    p = os.path.join(W, f); src = open(p).read()
    assert src.count(a) == 1, (name, src.count(a))
    open(p, 'w').write(src.replace(a, b))
    try:
        t0 = time.time()
        r = subprocess.run(['npx', 'vitest', 'run', *suites], cwd=W, env=env, capture_output=True, text=True, timeout=900)
        out = r.stdout + r.stderr
        summ = [l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
        failed = sorted({l.strip()[:140] for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('FAIL ')})
        verdict = 'KILLED' if r.returncode != 0 else 'SURVIVED'
        print(f"{verdict:8} {name} :: {summ[-1] if summ else '?'} ({int(time.time()-t0)}s)", flush=True)
        for l in failed[:6]: print('         ', l, flush=True)
    finally:
        open(p, 'w').write(src)
    d = subprocess.run(['git', 'status', '--porcelain', '--', 'src'], cwd=W, capture_output=True, text=True).stdout
    assert d == '', ('source not restored', d)
print('restored: git status src clean', flush=True)
