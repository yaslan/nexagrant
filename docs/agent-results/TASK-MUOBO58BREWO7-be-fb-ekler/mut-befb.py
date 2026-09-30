# usage: mut-befb.py <worktree> csp|o1 — be-fb İNCELEME-104 mutants, each alone
import subprocess, sys, pathlib, re
W = pathlib.Path(sys.argv[1]); KIND = sys.argv[2]
SH='src/lib/security-headers.ts'; PX='src/proxy.ts'; FN='src/lib/agency/funnel.ts'
CLS='[-a-z0-9_./]'
CSP=[
 ('C1 static CSP default-src none -> self unsafe-inline', SH, "\"default-src 'none'\",\n  \"style-src 'self' 'unsafe-inline'\",\n  \"img-src 'self' data:\",\n  \"font-src 'self'\",", "\"default-src 'self' 'unsafe-inline'\",\n  \"style-src 'self' 'unsafe-inline'\",\n  \"img-src 'self' data:\",\n  \"font-src 'self'\","),
 ('C2 static CSP + script-src-attr unsafe-inline', SH, "\"font-src 'self'\",", "\"font-src 'self'\",\n  \"script-src-attr 'unsafe-inline'\","),
 ('C3 matcher: _next(...)?$ loses $', PX, "_next(?:/"+CLS+"*)?$|", "_next(?:/"+CLS+"*)?|"),
 ('C4 matcher: class gains %', PX, "_next(?:/"+CLS+"*)?$|"+CLS, "_next(?:/[-a-z0-9_.%/]*)?$|[-a-z0-9_.%/]"),
 ('C5 proxy(): _next pass-through unanchored', PX, "if (/^\\/_(?:next|vercel)", "if (/\\/_(?:next|vercel)"),
 ('C6 matcher: _next/static/ -> _next/', PX, "_next/static/|", "_next/|"),
 ('C7 header: served exceptions prefix (no $)', SH, "`(?:${served.join('|')})$`", "`(?:${served.join('|')})`"),
 ('C8 proxy(): _next pass-through prefix (/_nextfoo)', PX, "_(?:next|vercel)(?:\\/|$)/i", "_(?:next|vercel)/i"),
 ('C9 matcher ext: class drops underscore', PX, "$|"+CLS+"*\\\\.(?:", "$|[-a-z0-9./]*\\\\.(?:"),
]
HDR="  return (breakdown) => {\n"
O1=[
 ('S2 province answer cached by dimension (first province reused)', FN,
  HDR, "  let firstProv: any;\n"+HDR,
  "      return { all, breakdown: { dimension: 'province', province, view: v } };",
  "      firstProv ??= v;\n      return { all, breakdown: { dimension: 'province', province, view: firstProv } };"),
 ('S4 orgType call mutates totals (+1 SME registered)', FN,
  "      const byOrgType = Object.fromEntries(", "      total.SME.registered += 1;\n      const byOrgType = Object.fromEntries(", None, None),
 ('S10 after a province call, all.registered masked', FN,
  HDR, "  let seenProv = false;\n"+HDR,
  "    if (breakdown.dimension === 'province') {\n", "    if (seenProv) hidden.add(cellId('registered' as never, ALL, ALL));\n    if (breakdown.dimension === 'province') {\n      seenProv = true;\n"),
 ('S11 a missing-province call leaks its (undefined) table: later provinces "<5"', FN,
  HDR, "  let poisoned = false;\n"+HDR,
  "      const table = byProvince.get(province);\n", "      const table = poisoned ? undefined : byProvince.get(province);\n      if (!byProvince.has(province)) poisoned = true;\n"),
]
def run(files, test):
    r=subprocess.run(['npx','vitest','run',test],cwd=W,capture_output=True,text=True)
    t=[l.strip() for l in (r.stdout+r.stderr).splitlines() if re.match(r'\s*Tests\s',l)]
    return r.returncode, (t[-1] if t else str(r.returncode))
if KIND=='csp':
    for name,f,old,new in CSP:
        p=W/f; src=p.read_text()
        if src.count(old)!=1: print(f'N/A      {name} (count {src.count(old)})',flush=True); continue
        p.write_text(src.replace(old,new))
        try:
            rc,t=run([f],'src/lib/security-headers.test.ts'); print(('KILLED  ' if rc else 'SURVIVED')+f'  {name}  :: {t}',flush=True)
        finally: p.write_text(src)
else:
    for name,f,a,b,c,d in O1:
        p=W/f; src=p.read_text(); s=src
        ok = s.count(a)==1 and (c is None or s.count(c)==1)
        if not ok: print(f'N/A      {name}',flush=True); continue
        s=s.replace(a,b)
        if c: s=s.replace(c,d)
        p.write_text(s)
        try:
            rc,t=run([f],'src/lib/agency/'); print(('KILLED  ' if rc else 'SURVIVED')+f'  {name}  :: {t}',flush=True)
        finally: p.write_text(src)
