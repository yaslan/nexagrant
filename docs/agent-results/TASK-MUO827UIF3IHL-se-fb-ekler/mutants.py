import sys,subprocess,re
src=open('tests/server-action-rbac-guard.test.ts').read()
M={
 'M1 eski specBase (yalnız @/)': ("const aliased = aliasBase(spec, overlay);","const aliased = spec.startsWith('@/') ? spec.slice(2) : null;"),
 'M2 package.json imports okunmuyor': ("for (const [key, value] of Object.entries(pkg.imports ?? {}))","for (const [key, value] of Object.entries({} as Record<string, unknown>))"),
 'M3 çok hedef → ilk src hedefi': ("return bases.size === 1 ? inSrc[0]! : ALIAS_BLIND + spec;","return inSrc[0]!;"),
 'M4 extends yok sayılıyor': ("if (config?.extends !== undefined) problems.push","if (false) problems.push"),
 'M5 baseUrl yok sayılıyor': ("const base = typeof opts.baseUrl === 'string' ? opts.baseUrl : '.';","const base = '.';"),
 'M6 exports yok sayılıyor': ("if (pkg.exports !== undefined) problems.push","if (false) problems.push"),
 'M7 tsconfig paths okunmuyor': ("for (const [key, list] of Object.entries<unknown>(opts.paths ?? {}))","for (const [key, list] of Object.entries<unknown>({}))"),
 'M8 çoklu * kabul': ("if (stars > 1 || targets","if (targets"),
 'M9 hedef * sayısı denetlenmiyor': ("(t !== null && t.split('*').length - 1 !== stars)","false"),
}
for name,(a,b) in M.items():
    assert src.count(a)==1,name
    open('tests/zz-mut.test.ts','w').write(src.replace(a,b))
    r=subprocess.run(['npx','vitest','run','tests/zz-mut.test.ts'],capture_output=True,text=True)
    out=r.stdout+r.stderr
    t=re.search(r'Tests\s+(.*)',out)
    fails=re.findall(r'(?:FAIL|×)\s+.*?> (İNCELEME-89[^\n]*)',out)
    print(f"{name:40s} exit={r.returncode} {t.group(1) if t else '?'}  {sorted(set(f.strip()[:90] for f in fails))}")
import os; os.remove('tests/zz-mut.test.ts')
