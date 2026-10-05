# İNCELEME-99 Ö-1 mutants (from TASK-MUOA3TU374LPG mut99.py) against src/lib/agency/
import subprocess,sys,re
F='src/lib/agency/funnel.ts'
HDR="    if (breakdown.dimension === 'orgType') {\n"
INJ="      for (const p of byProvince.keys()) for (const s of FUNNEL_STEPS) hidden.add(cellId(s as never, ALL, p));\n"
M=[('S1  closure stateful: after an orgType call, provinces are masked',HDR,HDR+INJ),
   ('S1b S1, only with >=2 provinces',HDR,HDR+"      if (byProvince.size >= 2)\n"+INJ)]
for name,a,b in M:
  s=open(F).read(); assert s.count(a)==1
  open(F,'w').write(s.replace(a,b))
  try:
    r=subprocess.run(['npx','vitest','run','src/lib/agency/'],capture_output=True,text=True)
    t=[l.strip() for l in (r.stdout+r.stderr).splitlines() if re.match(r'\s*Tests\s',l)]
    print(f"{name:<64} {'KILLED' if r.returncode else 'SURVIVED'} :: {t[-1] if t else r.returncode}",flush=True)
  finally: open(F,'w').write(s)
