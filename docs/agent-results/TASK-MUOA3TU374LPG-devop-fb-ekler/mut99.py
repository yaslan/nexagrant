import subprocess,sys,re
R='src/lib/agency/report.ts'; F='src/lib/agency/funnel.ts'
M=[
 ('R1 rapor: shows=every',R,"Object.values(v).some((c) => c.state === 'count')","Object.values(v).every((c) => c.state === 'count')"),
 ('R2 rapor: Tokat atla',R,"if (!present.has(province)) continue;","if (!present.has(province) || province === 'Tokat') continue;"),
 ('R3 rapor: byOrgType.SME = all',R,"byOrgType: byType.breakdown.byOrgType,","byOrgType: { ...byType.breakdown.byOrgType, SME: byType.all },"),
 ('R4 rapor: il görünümü kayık',R,"if (shows(f.breakdown.view)) byProvince.push({ province, view: f.breakdown.view });","if (shows(f.breakdown.view)) byProvince.push({ province, view: byProvince.length ? byProvince[0]!.view : f.breakdown.view });"),
 ('R5 rapor: toplam NO_PROVINCE hariç maskelenir',R,"const funnel = maskAgencyFunnel(raw);","const funnel = maskAgencyFunnel(new Map([...raw].filter(([p]) => p !== '')));"),
 ('R6 rapor: il tek başına maskelenir (tamamlayıcı bastırma kaybı)',R,"const f = funnel({ dimension: 'province', province });","const f = maskAgencyFunnel(new Map([[province, raw.get(province)!]]))({ dimension: 'province', province });"),
 ('R7 rapor: all yeniden yuvarlanır (10)',R,"all: byType.all,","all: Object.fromEntries(Object.entries(byType.all).map(([k, c]) => [k, c.state === 'count' ? { ...c, value: Math.round(c.value / 10) * 10 } : c])),"),
 ('R8 rapor: gizli hücre 0 olarak açılır',R,"if (shows(f.breakdown.view)) byProvince.push({ province, view: f.breakdown.view });","if (shows(f.breakdown.view)) byProvince.push({ province, view: Object.fromEntries(Object.entries(f.breakdown.view).map(([k, c]) => [k, c.state === 'small' && k === 'pipeline' ? { state: 'count', value: 0 } : c])) as typeof f.breakdown.view });"),
 ('F1 ortak: suppressedCells ikincil bastırma kapalı',F,"    if (!exposed) return false;","    if (!exposed || true) return false;"),
 ('F2 ortak: eşik 5→4 (birincil)',F,"for (const [id, v] of value) if (v < SMALL_CELL_THRESHOLD) hidden.add(id);","for (const [id, v] of value) if (v < 4) hidden.add(id);"),
 ('F3 ortak: il toplamı = genel toplam (crw M7)',F,"(table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0)","(table ? ORG_TYPES.reduce((n, t) => n + total[t][s], 0) : 0)"),
 ('S1 kapanış durumlu: orgType çağrısı sonra illeri maskeler',F,"    if (breakdown.dimension === 'orgType') {\n","    if (breakdown.dimension === 'orgType') {\n      for (const p of byProvince.keys()) for (const s of FUNNEL_STEPS) hidden.add(cellId(s as never, ALL, p));\n"),
 ('S2 kapanış durumlu: ilk il görünümü önbelleğe',F,"  return (breakdown) => {\n","  let memo: FunnelView | undefined;\n  return (breakdown) => {\n"),
 ('W1 sarmalayıcı: il→none (crw M6)',F,"return maskAgencyFunnel(raw)(breakdown);","return maskAgencyFunnel(raw)(breakdown.dimension === 'province' ? { dimension: 'none' } : breakdown);"),
]
EXTRA={'S2 kapanış durumlu: ilk il görünümü önbelleğe':(F,"      const v = view((s) => (table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0), ALL, province, !!table);","      const v = (memo ??= view((s) => (table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0), ALL, province, !!table));")}
def run(args):
  r=subprocess.run(['npx','vitest','run',*args],capture_output=True,text=True)
  o=r.stdout+r.stderr; t=[l.strip() for l in o.splitlines() if re.match(r'\s*Tests\s',l)]
  return r.returncode, (t[-1] if t else o[-300:].replace('\n',' '))
only=sys.argv[1:]
for name,f,a,b in M:
  if only and not any(name.startswith(x) for x in only): continue
  orig={}
  edits=[(f,a,b)]+([EXTRA[name]] if name in EXTRA else [])
  for ff,aa,bb in edits:
    s=orig.get(ff) or open(ff).read(); orig.setdefault(ff,s)
    cur=open(ff).read(); assert cur.count(aa)==1,(name,cur.count(aa)); open(ff,'w').write(cur.replace(aa,bb))
  try:
    tsc=subprocess.run(['npx','tsc','--noEmit','-p','.'],capture_output=True,text=True).returncode if '--tsc' in sys.argv else '-'
    rn,_=run(['src/lib/agency/report.test.ts','-t','300 random'])
    ro,_=run(['src/lib/agency/zz_report_old.test.ts','-t','300 random'])
    rd,ld=run(['src/lib/agency/','--exclude','**/zz_*'])
    k=lambda c:'KILLED' if c else 'survived'
    print(f"{name:<62} | yeni-300={k(rn):<8} | eski-300={k(ro):<8} | agency/ (zz hariç): {ld}",flush=True)
  finally:
    for ff,s in orig.items(): open(ff,'w').write(s)
