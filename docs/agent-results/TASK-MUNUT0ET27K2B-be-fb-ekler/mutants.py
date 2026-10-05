import subprocess, sys, os
WT = os.environ['WT']
RL = 'tests/api/api-key-rate-limit.test.ts tests/api-key-rate-limit.live.test.ts'
M = [
 ('MB1 429 sınırı bir erken (> yerine >=)', 'src/lib/api-auth.ts', 'window.count > API_KEY_RATE_LIMIT_PER_MINUTE', 'window.count >= API_KEY_RATE_LIMIT_PER_MINUTE', RL),
 ('MB2 NULL pencere hiç başlamıyor (IS NULL dalı silindi, 2 yerde)', 'src/lib/api-auth.ts', 'WHEN "rateWindowStartedAt" IS NULL OR "rateWindowStartedAt" <=', 'WHEN "rateWindowStartedAt" <=', RL),
 ('MB3 Retry-After hep 60', 'src/lib/api-auth.ts', "'Retry-After': String(retryAfterSeconds)", "'Retry-After': '60'", RL),
 ('MB4 lastUsedAt yazılmıyor', 'src/lib/api-auth.ts', '"lastUsedAt" = ${now}', '"lastUsedAt" = "lastUsedAt"', RL),
 ('MB5 pencere 10 dk (sıfırlama geç)', 'src/lib/api-auth.ts', 'const API_KEY_RATE_WINDOW_MS = 60_000;', 'const API_KEY_RATE_WINDOW_MS = 600_000;', RL),
 ('MB6 sayaç UPDATE kiracı kapsamı dışında (withSystemScope)', 'src/lib/api-auth.ts', 'const usage = await withTenant(keyRecord.tenantId, (tx) =>', "const usage = await withSystemScope('tenant-discovery', 'x', (tx) =>", RL + ' tests/where-guard-src.test.ts'),
 ('MB7 cagrilar üst sınır 50→100', 'src/app/api/cagrilar/route.ts', 'const CAGRILAR_MAX_PAGE_SIZE = 50;', 'const CAGRILAR_MAX_PAGE_SIZE = 100;', 'tests/api/cagrilar-hardening.test.ts'),
 ('MB8 cagrilar alt sınır yok (negatif pageSize SEDIA\'ya)', 'src/app/api/cagrilar/route.ts', 'Math.min(CAGRILAR_MAX_PAGE_SIZE, Math.max(1, rawPageSize))', 'Math.min(CAGRILAR_MAX_PAGE_SIZE, rawPageSize)', 'tests/api/cagrilar-hardening.test.ts'),
 ('MB9 cordis limit üst kırpması yok', 'src/lib/k2-cordis/api-query.ts', 'Math.min(100, Math.max(1, n ?? 20))', 'Math.max(1, n ?? 20)', 'tests/api/cordis-public-hardening.test.ts'),
 ('MB10 cordis yıl aralığı kontrolü yok', 'src/lib/k2-cordis/api-query.ts', 'digits.refine((n) => n >= 1900 && n <= 2100).optional()', 'digits.optional()', 'tests/api/cordis-public-hardening.test.ts'),
 ('MB11 çeviri önbelleği EN YENİyi atıyor', 'src/lib/translation.ts', 'const oldest = translationCache.keys().next().value;', 'const oldest = [...translationCache.keys()].pop();', 'tests/translation-bounds.test.ts'),
 ('MB12 semafor: slot devredilse de sayaç düşüyor', 'src/lib/translation.ts', "    if (next) next();\n    else activeTranslations--;", "    activeTranslations--;\n    if (next) next();", 'tests/translation-bounds.test.ts'),
 ('MB13 bekçi kör noktası: billing/quote 500 gövdesi (error as Error).message', 'src/app/api/billing/quote/route.ts', "return NextResponse.json({ error: 'internal_error' }, { status: 500 });", "return NextResponse.json({ error: (error as Error).message }, { status: 500 });", 'tests/api/api-error-body-guard.test.ts tests/cart-checkout-signed-out.test.tsx'),
 ('MB14 bekçi kör noktası: cagrilar 500 gövdesi String(error)', 'src/app/api/cagrilar/route.ts', "return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });", "return NextResponse.json({ success: false, error: String(error) }, { status: 500 });", 'tests/api/api-error-body-guard.test.ts tests/api/cagrilar-hardening.test.ts'),
]
only = sys.argv[1:] 
for name, f, old, new, tests in M:
    if only and name.split()[0] not in only: continue
    p = os.path.join(WT, f); src = open(p).read()
    n = src.count(old)
    if n == 0: print(f'{name}: ESKİ METİN BULUNAMADI'); continue
    open(p, 'w').write(src.replace(old, new))
    try:
        r = subprocess.run(f'npx vitest run {tests} 2>&1 | grep -E "Tests |Test Files |FAIL" | head -6', shell=True, cwd=WT, capture_output=True, text=True, timeout=600)
        out = r.stdout.strip()
    finally:
        open(p, 'w').write(src)
    verdict = 'KIRMIZI (öldü)' if ('failed' in out) else 'YEŞİL (YAŞADI)'
    print(f'## {name} [{n} yer] → {verdict}\n{out}\n', flush=True)
st = subprocess.run('git status --short', shell=True, cwd=WT, capture_output=True, text=True).stdout
print('git status (untracked hariç):', [l for l in st.splitlines() if not l.startswith('??')])
