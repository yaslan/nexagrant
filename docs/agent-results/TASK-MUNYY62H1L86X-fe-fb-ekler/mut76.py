import subprocess, pathlib, sys
W = pathlib.Path(sys.argv[1])
TESTS = ['tests/public-calls-links.test.ts','src/modules/m2/server/templates.test.ts','tests/concept-note-editor-sections.test.ts','tests/no-ssg-under-dynamic-root.test.ts','tests/next-image-remote-patterns.test.ts']
RP='src/app/[locale]/calls/[region]/page.tsx'; CP='src/app/[locale]/calls/page.tsx'
M = [
 ('N1 generateMetadata ham REGIONS[region] (sayfa regionOf kalır)', RP, "const regionInfo = regionOf(region);\n  if (!regionInfo) {\n    return {", "const regionInfo = ({ constructor: { name: 'Object', code: 'X' } } as Record<string, {name:string;code:string}>)[region] ?? regionOf(region);\n  if (!regionInfo) {\n    return {"),
 ('N2 girişsiz callbackUrl encode edilmez', 'src/lib/routes.ts', "?callbackUrl=${encodeURIComponent(detail)}", "?callbackUrl=${detail}"),
 ('N3 tr giriş yolu /tr/login', 'src/lib/routes.ts', "return `${getPublicRoute('login', locale)}?callbackUrl", "return `/${locale}/login?callbackUrl"),
 ('N4 region sayfası signedIn || true', RP, "const signedIn = Boolean((await auth())?.user);", "const signedIn = Boolean((await auth())?.user) || true;"),
 ('N5 liste sayfası signedIn || true', CP, "const signedIn = Boolean((await auth())?.user);", "const signedIn = Boolean((await auth())?.user) || true;"),
 ('N6 isSection boş key kabul', 'src/modules/m2/server/templates.ts', "typeof key === 'string' && key.length > 0", "typeof key === 'string'"),
 ('N7 editor maxWords >= 0', 'src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts', "s.maxWords > 0", "s.maxWords >= 0"),
 ('N8 editor Number.isFinite yok', 'src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts', "Number.isFinite(s.maxWords) && ", ""),
 ('N9 kart topic.id ile link', CP, "publicCallDetailHref(locale, topic.identifier, signedIn)", "publicCallDetailHref(locale, topic.id, signedIn)"),
 ('N10 regionOf toLowerCase', 'src/app/[locale]/calls/[region]/regions.ts', "Object.hasOwn(REGIONS, region) ? REGIONS[region]", "Object.hasOwn(REGIONS, region.toLowerCase()) ? REGIONS[region.toLowerCase()]"),
 ('N11 workspace segmenti default yerine main', 'src/lib/routes.ts', "getWorkspaceRoute('callDetail', locale, 'default',", "getWorkspaceRoute('callDetail', locale, 'main',"),
 ('N12 isSection labelKey tipine hiç bakmıyor (mevcut) -> labelKey zorunlu yap [ters mutant: davranış testi var mı]', 'src/modules/m2/server/templates.ts', "return typeof key === 'string' && key.length > 0;", "return typeof key === 'string' && key.length > 0 && typeof (value as {labelKey?:unknown}).labelKey === 'string';"),
 ('N13 no-ssg guard revalidate lookahead 0 -> 0.5 muaf', 'tests/no-ssg-under-dynamic-root.test.ts', "(?!0\\b|false\\b)", "(?!0\\b|false\\b|1\\b)"),
]
for name, f, a, b in M:
    p = W / f; src = p.read_text()
    if a not in src: print(f"{name}: UYGULANAMADI"); continue
    p.write_text(src.replace(a, b, 1))
    try:
        r = subprocess.run(['npx','vitest','run',*TESTS], cwd=W, capture_output=True, text=True, timeout=300)
        out = r.stdout + r.stderr
        line = [l for l in out.splitlines() if 'Tests' in l and ('passed' in l or 'failed' in l)]
        print(f"{name}: {'ÖLDÜ' if r.returncode else 'SAĞ'} | {line[-1].strip() if line else ''}", flush=True)
    finally:
        p.write_text(src)
r = subprocess.run(['git','status','--porcelain','--','src','tests'], cwd=W, capture_output=True, text=True); print('git temiz:', repr(r.stdout))
r = subprocess.run(['npx','vitest','run',*TESTS], cwd=W, capture_output=True, text=True); print('baz:', [l for l in (r.stdout+r.stderr).splitlines() if 'Tests' in l][-1].strip())
