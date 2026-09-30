import sys,subprocess
M={
 'M1 report: shows=every':('src/lib/agency/report.ts',"Object.values(v).some((c) => c.state === 'count')","Object.values(v).every((c) => c.state === 'count')"),
 'M2 report: skip Tokat':('src/lib/agency/report.ts',"if (!present.has(province)) continue;","if (!present.has(province) || province === 'Tokat') continue;"),
 'M3 report: byOrgType from none-view all':('src/lib/agency/report.ts',"byOrgType: byType.breakdown.byOrgType,","byOrgType: { ...byType.breakdown.byOrgType, SME: byType.all },"),
 'M4 report: province view off-by-one':('src/lib/agency/report.ts',"if (shows(f.breakdown.view)) byProvince.push({ province, view: f.breakdown.view });","if (shows(f.breakdown.view)) byProvince.push({ province, view: byProvince.length ? byProvince[0]!.view : f.breakdown.view });"),
 'M5 mask: absent province known':('src/lib/agency/funnel.ts',"ALL, province, !!table);","ALL, province, true);"),
 'M6 wrapper: ignores breakdown':('src/lib/agency/funnel.ts',"return maskAgencyFunnel(raw)(breakdown);","return maskAgencyFunnel(raw)(breakdown.dimension === 'province' ? { dimension: 'none' } : breakdown);"),
 'M7 mask: province uses grand total':('src/lib/agency/funnel.ts',"(table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0)","(table ? ORG_TYPES.reduce((n, t) => n + total[t][s], 0) : 0)"),
}
for name,(f,a,b) in M.items():
  s=open(f).read(); assert s.count(a)==1,(name,s.count(a)); open(f,'w').write(s.replace(a,b))
  r=subprocess.run(['npx','vitest','run','src/lib/agency/report.test.ts','-t','300 random'],capture_output=True,text=True)
  r2=subprocess.run(['npx','vitest','run','src/lib/agency/'],capture_output=True,text=True)
  subprocess.run(['git','checkout','--',f]) if False else open(f,'w').write(s)
  line=[l for l in (r2.stdout+r2.stderr).splitlines() if 'Tests ' in l]
  print(f"{name}: property300={'KILLED' if r.returncode else 'survived'} | agency dir: {line[-1].strip() if line else '?'}",flush=True)
