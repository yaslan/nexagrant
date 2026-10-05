import os, subprocess, sys
WT = os.getcwd()
G = 'tests/api/api-error-body-guard.test.ts'
M = [
 ('MB8 cagrilar alt sınır yok', 'src/app/api/cagrilar/route.ts', 'Math.min(CAGRILAR_MAX_PAGE_SIZE, Math.max(1, rawPageSize))', 'Math.min(CAGRILAR_MAX_PAGE_SIZE, rawPageSize)', 'tests/api/cagrilar-hardening.test.ts'),
 ('MB11 önbellek EN YENİyi atıyor', 'src/lib/translation.ts', 'const oldest = translationCache.keys().next().value;', 'const oldest = [...translationCache.keys()].pop();', 'tests/translation-bounds.test.ts'),
 ('MB13 billing/quote 500 = (error as Error).message', 'src/app/api/billing/quote/route.ts', "return NextResponse.json({ error: 'internal_error' }, { status: 500 });", "return NextResponse.json({ error: (error as Error).message }, { status: 500 });", G),
 ('MB14 cagrilar 500 = String(error) (yalnız bekçi)', 'src/app/api/cagrilar/route.ts', "return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });", "return NextResponse.json({ success: false, error: String(error) }, { status: 500 });", G),
 ('MS1 stripe webhook eski gövde geri', 'src/app/api/webhooks/stripe/route.ts', "return NextResponse.json({ error: 'internal_error' }, { status: 500 });", "return new NextResponse(`Error processing webhook: ${err.message}`, {\n      status: 500,\n    });", G),
 ('MS2 cordis import importRes.error geri', 'src/app/api/admin/cordis/import/route.ts', "error: 'import_failed', runId", "error: importRes.error, runId", 'tests/api/admin-cordis-import-500.test.ts'),
 ('MS3 cordis import 503 + err.message (çok satırlı)', 'src/app/api/admin/cordis/import/route.ts', "return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });", "return NextResponse.json(\n      { success: false, error: (error as Error).message },\n      { status: 503 }\n    );", G),
]
for name, f, old, new, tests in M:
    p = os.path.join(WT, f); src = open(p).read()
    if src.count(old) != 1: print(f'{name}: ESKİ METİN BULUNAMADI ({src.count(old)})'); continue
    open(p, 'w').write(src.replace(old, new))
    try:
        r = subprocess.run(f'npx vitest run {tests} 2>&1 | grep -E "Tests  |FAIL " | head -4', shell=True, cwd=WT, capture_output=True, text=True, timeout=600)
        out = r.stdout.strip()
        print(f'{name}: {"KIRMIZI (öldü)" if "failed" in out else "YEŞİL (YAŞADI)"}\n  ' + out.replace('\n', '\n  '))
    finally:
        open(p, 'w').write(src)
print('git status (mutasyon sonrası, izlenen):', subprocess.run('git status --short --untracked-files=no', shell=True, cwd=WT, capture_output=True, text=True).stdout.split('\n'))
