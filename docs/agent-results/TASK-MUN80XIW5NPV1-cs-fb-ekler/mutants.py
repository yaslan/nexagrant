import subprocess, shutil, sys, os
W='wtapi'
M=[
 ('M1 cagrilar: session check removed','src/app/api/cagrilar/route.ts',"  if (!tenant.ok) return tenant.response;\n","",'tests/api/cagrilar-hardening.test.ts'),
 ('M2 cagrilar: limit clamp removed','src/app/api/cagrilar/route.ts',"Math.min(CAGRILAR_MAX_PAGE_SIZE, Math.max(1, rawPageSize))","rawPageSize",'tests/api/cagrilar-hardening.test.ts'),
 ('M3 cagrilar: Topic upsert restored','src/app/api/cagrilar/route.ts',"    return NextResponse.json({\n      success: true,","    void (await import('@/lib/db')).prisma.topic.upsert({ where: { identifier: 'x' }, update: {}, create: {} as never });\n    return NextResponse.json({\n      success: true,",'tests/api/cagrilar-hardening.test.ts'),
 ('M4 cagrilar: raw error body','src/app/api/cagrilar/route.ts',"{ success: false, error: 'internal_error' }, { status: 500 }","{ success: false, error: String((error as Error).message) }, { status: 500 }",'tests/api/cagrilar-hardening.test.ts'),
 ('M5 translation: no concurrency slot','src/lib/translation.ts',"  if (activeTranslations >= MAX_CONCURRENT_TRANSLATIONS) {","  if (false) {",'tests/translation-bounds.test.ts'),
 ('M6 translation: cache uncapped','src/lib/translation.ts',"  if (translationCache.size >= TRANSLATION_CACHE_MAX_ENTRIES && !translationCache.has(key)) {","  if (false) {",'tests/translation-bounds.test.ts'),
 ('M7 cordis/projects: zod bypassed','src/app/api/cordis/projects/route.ts',"    if (!parsed.success) {\n","    if (false) {\n",'tests/api/cordis-public-hardening.test.ts'),
 ('M8 cordis/[id]: id check bypassed','src/app/api/cordis/organizations/[id]/route.ts',"    if (!idParse.success) {","    if (false) {",'tests/api/cordis-public-hardening.test.ts'),
 ('M9 cordis/projects: raw Prisma body','src/app/api/cordis/projects/route.ts',"{ success: false, error: 'internal_error' }","{ success: false, error: (error as Error).message }",'tests/api/cordis-public-hardening.test.ts'),
 ('M10 billing/quote: errorMessage body','src/app/api/billing/quote/route.ts',"    return NextResponse.json({ error: 'internal_error' }, { status: 500 });","    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });",'tests/api/api-error-body-guard.test.ts'),
 ('M11 api-auth: 429 check removed','src/lib/api-auth.ts',"    if (window.count > API_KEY_RATE_LIMIT_PER_MINUTE) {","    if (false) {",'tests/api/api-key-rate-limit.test.ts tests/api-key-rate-limit.live.test.ts'),
 ('M12 api-auth: window never resets','src/lib/api-auth.ts',"""              THEN 1 ELSE "rateWindowCount" + 1 END,""","""              THEN "rateWindowCount" + 1 ELSE "rateWindowCount" + 1 END,""",'tests/api-key-rate-limit.live.test.ts'),
]
def run(t):
    r=subprocess.run(f"npx vitest run {t}",shell=True,cwd=W,capture_output=True,text=True)
    line=[l for l in (r.stdout+r.stderr).splitlines() if l.strip().startswith('Tests ')]
    return r.returncode, (line[-1].strip() if line else '?')
for name,f,old,new,t in M:
    p=os.path.join(W,f); s=open(p).read()
    assert s.count(old)==1,(name,s.count(old))
    shutil.copy(p,p+'.bak'); open(p,'w').write(s.replace(old,new))
    rc,l=run(t)
    shutil.move(p+'.bak',p)
    rc2,l2=run(t)
    print(f"| {name} | {'KIRMIZI' if rc else 'YESIL(!)'} {l} | geri al: {'yesil' if rc2==0 else 'KIRMIZI(!)'} {l2} |",flush=True)
