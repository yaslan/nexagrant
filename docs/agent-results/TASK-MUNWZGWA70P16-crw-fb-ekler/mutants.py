import subprocess, sys
R='src/app/[locale]/calls/[region]/regions.ts'
P='src/app/[locale]/calls/page.tsx'
G='src/app/[locale]/calls/[region]/page.tsx'
RT='src/lib/routes.ts'
TM='src/modules/m2/server/templates.ts'
DT='src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts'
NC='next.config.ts'
M=[
 ('M1 REGIONS[region] geri',R,"return Object.hasOwn(REGIONS, region) ? REGIONS[region] : undefined;","return REGIONS[region];"),
 ('M2 region in REGIONS',R,"Object.hasOwn(REGIONS, region)","region in REGIONS"),
 ('M3 girissiz callbackUrl yok',RT,"return `${getPublicRoute('login', locale)}?callbackUrl=${encodeURIComponent(detail)}`;","return getPublicRoute('login', locale);"),
 ('M4 kart linki /calls/<id> geri',P,"href={publicCallDetailHref(locale, topic.identifier, signedIn)}","href={`/${locale}/calls/${topic.identifier}`}"),
 ('M5 bolge linki login?redirect geri',G,"href={publicCallDetailHref(locale, call.identifier, signedIn)}","href={`/${locale}/login?redirect=/dashboard`}"),
 ('M6 signedIn sabit true',P,"const signedIn = Boolean((await auth())?.user);","const signedIn = true;"),
 ('M7 identifier encode yok',RT,"'default', encodeURIComponent(identifier))","'default', identifier)"),
 ('M8 girisli kullanici da login',RT,"if (signedIn) return detail;","if (signedIn && false) return detail;"),
 ('M9 templateSections filtresiz',TM,"return raw.filter(isSection);","return raw as ConceptTemplateSection[];"),
 ('M10 editor maxWords>0 yok',DT," && s.maxWords > 0",""),
 ('M10b editor maxWords filtresi yok',DT,"typeof s.maxWords === 'number' && Number.isFinite(s.maxWords) && s.maxWords > 0","true"),
 ('M10c templateSections maxWords istiyor (export regresyonu)',TM,"return typeof key === 'string' && key.length > 0;","return typeof key === 'string' && key.length > 0 && typeof (value as { maxWords?: unknown }).maxWords === 'number';"),
 ('M11 port kaldirildi',NC,"hostname: 'lh3.googleusercontent.com', port: '' }","hostname: 'lh3.googleusercontent.com' }"),
 ('M12 dynamic force-static',G,"export const dynamic = 'force-dynamic';","export const dynamic = 'force-static';"),
 ('M13 revalidate 3600',G,"export const dynamic = 'force-dynamic';","export const dynamic = 'force-dynamic';\nexport const revalidate = 3600;"),
 ('M14 revalidate: number = 60',G,"export const dynamic = 'force-dynamic';","export const dynamic = 'force-dynamic';\nexport const revalidate: number = 60;"),
 ('M15 dynamic = "error"',G,"export const dynamic = 'force-dynamic';",'export const dynamic = "error";'),
]
EQ=[('E1 revalidate = 0 (izinli, esdeger)',G,"export const dynamic = 'force-dynamic';","export const dynamic = 'force-dynamic';\nexport const revalidate = 0;")]
tests=['tests/public-calls-links.test.ts','tests/no-ssg-under-dynamic-root.test.ts','tests/next-image-remote-patterns.test.ts','tests/concept-note-editor-sections.test.ts','src/modules/m2/server/templates.test.ts','src/app/api/concept-notes/[id]/export/route.ssrf.test.ts']
for name,f,a,b in M+EQ:
    s=open(f).read(); assert a in s,(name,a)
    open(f,'w').write(s.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*tests],capture_output=True,text=True)
    open(f,'w').write(s)
    out=r.stdout+r.stderr
    line=[l for l in out.splitlines() if 'Tests ' in l][-1].strip() if 'Tests ' in out else out[-200:]
    print(f"{name}: {'ÖLDÜ' if r.returncode else 'SAĞ'} · {line}")
