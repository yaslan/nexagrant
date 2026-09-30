import subprocess, shutil, sys, re
M = [
 ("M1","next.config.ts","source: staticFileNotFoundSource(servedStaticFiles()),","source: '/__mutant_never__',","statik kural hiç eşleşmiyor"),
 ("M2","src/proxy.ts","'/((?!api(?:/|$)|","'/((?!api|","matcher api çapası geri"),
 ("M3","src/proxy.ts","|_next(?:/|$)|_vercel(?:/|$)|","|_next|_vercel|","matcher _next/_vercel çapası geri"),
 ("M4","next.config.ts","return [...underPublic, ...appRoot]","return [...[] as string[], ...appRoot]","public/ dosyaları dışlanmıyor"),
 ("M5","next.config.ts","return [...underPublic, ...appRoot]","return [...underPublic]","favicon.ico dışlanmıyor"),
 ("M6","src/lib/security-headers.ts","    '_next/static/',\n","","_next/static dışlanmıyor"),
 ("M7","src/lib/security-headers.ts","    'api(?:/|$)',\n    '_next/static/',","    '_next/static/',","api/ dışlanmıyor (çift politika)"),
 ("M8","src/lib/security-headers.ts","    '_next/image$',\n","","_next/image dışlanmıyor"),
 ("M9","src/lib/security-headers.ts","|_next(?:/.*)?|_vercel(?:/.*)?`","`","_next/_vercel uzantısız kapsam yok"),
 ("M10","src/lib/security-headers.ts","  \"default-src 'none'\",\n  \"style-src","  \"default-src 'none'\",\n  \"script-src 'self' 'unsafe-inline'\",\n  \"style-src","statik politikaya script-src"),
 ("M11","src/lib/security-headers.ts","  \"frame-ancestors 'none'\",\n].join('; ');\n\nconst escapeRegExp","  \"frame-ancestors 'none'\",\n  'report-uri /api/csp-report',\n].join('; ');\n\nconst escapeRegExp","statik politikaya report-uri"),
 ("M12","src/lib/security-headers.ts","'ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map'","'ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js'","sabit listeden map düştü (matcher ile ayrıştı)"),
 ("M13","src/proxy.ts","|woff2?|ttf|css|js|map)$).*)'","|woff2?|ttf|css|js)$).*)'","matcher'dan map düştü"),
 ("M14","src/lib/security-headers.ts","const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');","const escapeRegExp = (s: string) => s;","dosya adı kaçışsız"),
 ("M15","src/lib/security-headers.ts","  \"frame-ancestors 'none'\",\n].join('; ');\n\nconst escapeRegExp","].join('; ');\n\nconst escapeRegExp","statik politikadan frame-ancestors düştü"),
 ("M16","src/lib/security-headers.ts","  return `/:path((?!${skip.join('|')})(?:${covered})$)`;","  return `/:path((?!${skip.join('|')})(?:${covered}))`;","kapsam regex'inde son $ yok"),
]
only = sys.argv[1:]
res=[]
for mid,f,old,new,desc in M:
    if only and mid not in only: continue
    s=open(f).read()
    n=s.count(old)
    if n!=1:
        res.append((mid,desc,f"UYGULANAMADI (eşleşme {n})")); continue
    shutil.copy(f, f+'.bak')
    open(f,'w').write(s.replace(old,new))
    try:
        out=subprocess.run(['npx','vitest','run','src/lib/security-headers.test.ts','tests/accept-invite-headers.test.ts'],capture_output=True,text=True,timeout=300).stdout
    finally:
        shutil.move(f+'.bak', f)
    m=re.search(r'Tests\s+(.*)',out)
    line=m.group(1).strip() if m else 'no summary'
    fails=re.findall(r'(?:FAIL|×)\s+(.{0,110})',out)
    verdict='KILLED' if 'failed' in line else 'SURVIVED'
    res.append((mid,desc,f"{verdict} — {line}" + (f" · ör: {fails[0].strip()}" if fails and verdict=='KILLED' else '')))
for r in res: print(' | '.join(r))
