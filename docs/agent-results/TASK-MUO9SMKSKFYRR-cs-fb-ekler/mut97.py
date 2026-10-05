import subprocess, re, sys, pathlib
F = pathlib.Path('wt97/tests/server-action-rbac-guard.test.ts')
orig = F.read_text()
M = [
 ('m1 imports dizisi: yalnız ilk eleman', "else if (Array.isArray(value)) value.forEach((v) => importTargets(v, out));", "else if (Array.isArray(value)) importTargets(value[0], out);"),
 ('m2 koşul nesnesi: yalnız son koşul (default)', "Object.values(value).forEach((v) => importTargets(v, out));", "Object.values(value).slice(-1).forEach((v) => importTargets(v, out));"),
 ('m3 en uzun önek yok (ilk eşleşen kazanır)', "(best === null || (best.alias.suffix !== null && alias.prefix.length > best.alias.prefix.length))", "best === null"),
 ('m4 tam anahtar önceliği yok', "(best === null || (best.alias.suffix !== null && alias.prefix.length > best.alias.prefix.length))", "(best === null || alias.prefix.length > best.alias.prefix.length)"),
 ('m5 paket+src karışık hedefte paketi yok say', "return bases.size === 1 ? inSrc[0]! : ALIAS_BLIND + spec;", "return inSrc.length === 1 ? inSrc[0]! : ALIAS_BLIND + spec;"),
 ('m6 çok hedefli alias → paket', "if (aliased === null || aliased.startsWith(ALIAS_BLIND)) return aliased;", "if (aliased === null || aliased.startsWith(ALIAS_BLIND)) return null;"),
 ('m7 anahtar sonekini denetleme', "spec.endsWith(alias.suffix) &&", ""),
 ('m8 src öneki gevşek (srcx/ de src)', "(target === 'src' || target.startsWith('src/'))", "target.startsWith('src')"),
 ('m9 loadModule: alias tablosu değişince yeniden çözme yok', "aliasTable(overlay) !== aliasTable(NO_OVERLAY) || ", ""),
 ('m10 hedef yıldız sayısı denetimi yok', "(t !== null && t.split('*').length - 1 !== stars)", "false"),
 ('m11 kaynaklar ayrı değil: tek best (tsconfig+imports birleşik)', "    best = null;\n    for (const alias", "    for (const alias"),
 ('m12 çözülemeyen src import → paket (fail-open)', "  return UNRESOLVED + base;\n}", "  return null;\n}"),
 ('m13 extends okunmuyor', "if (config?.extends !== undefined)", "if (false)"),
 ('m14 tsconfig parse hatası yutuluyor', "if (error) problems.push", "if (false) problems.push"),
]
for name, a, b in M:
    n = orig.count(a)
    if n != 1: print(f'{name}: PATTERN x{n} — ATLANDI'); continue
    F.write_text(orig.replace(a, b))
    r = subprocess.run(['npx','vitest','run','tests/server-action-rbac-guard.test.ts'], cwd='wt97', capture_output=True, text=True)
    m = re.search(r'Tests\s+(.*)', r.stdout)
    print(f'{name}: {"ÖLDÜ" if r.returncode else "HAYATTA"} — {m.group(1).strip() if m else r.stdout[-200:]}', flush=True)
F.write_text(orig)
