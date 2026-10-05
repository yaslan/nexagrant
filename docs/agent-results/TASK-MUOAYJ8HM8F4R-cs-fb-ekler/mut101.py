import subprocess, re, pathlib
W = pathlib.Path('wt101')
F = W / 'tests/server-action-rbac-guard.test.ts'
P = W / 'tests/zz-probe101.test.ts'
orig, porig = F.read_text(), P.read_text()
M = [
 # İNCELEME-97'de hayatta kalan 8'in yeni koddaki karşılıkları
 ('m1 imports dizisi: yalnız ilk eleman', "else if (Array.isArray(value)) value.forEach((v) => importTargets(v, out));", "else if (Array.isArray(value)) importTargets(value[0], out);"),
 ('m3 en uzun önek yok (ilk eşleşen kazanır)', "if (!top || alias.prefix.length > top.prefix.length ||", "if (!top ||"),
 ('m4 tam anahtar önceliği yok (sıraya bağlı)', "if (spec === alias.prefix) return [{ alias, star: '' }];", "if (spec === alias.prefix && best.length === 0) return [{ alias, star: '' }];"),
 ('m7 anahtar sonekini denetleme', "if (!spec.startsWith(alias.prefix) || !spec.endsWith(alias.suffix)) continue;", "if (!spec.startsWith(alias.prefix)) continue;"),
 ('m8 src öneki gevşek (srcx/ de src)', "if (target !== 'src' && !target.startsWith('src/')) return null;", "if (!target.startsWith('src')) return null;"),
 ('m9 loadModule: alias tablosu değişince yeniden çözme yok', "aliasTable(overlay) !== aliasTable(NO_OVERLAY) || ", ""),
 ('m11 kaynaklar ayrı değil (matchAlias kaynağı yok sayar)', "    if (alias.source !== source) continue;\n    if (alias.suffix === null) {", "    if (alias.suffix === null) {"),
 ('m14 tsconfig parse hatası yutuluyor', "if (error) problems.push", "if (false) problems.push"),
 # crw-fb'nin hayatta kalan n18'i
 ('n18 bare: probed eklenmiyor (at içinde)', "    probed?.add(base);\n    if (!isUnresolved(lookup(base, overlay) ?? '')) return { base };", "    if (!isUnresolved(lookup(base, overlay) ?? '')) return { base };"),
 # yeni
 ('x1 missed hiç atanmıyor (catch-all yazım hatası → paket)', "    missed ??= base;\n", ""),
 ('x2 isPackage @types bakmıyor', " || fs.existsSync(path.join(REPO_ROOT, 'node_modules/@types', types))", ""),
 ('x3 isPackage isBuiltin yok', "  if (isBuiltin(spec)) return true;\n", ""),
 ('x4 baseUrl normalize yok', "baseUrl = path.posix.normalize(opts.baseUrl);", "baseUrl = opts.baseUrl;"),
 ('x5 tsconfig * boşa izin → node kuralı her ikisine', "+ (node ? 1 : 0)) continue;", "+ 1) continue;"),
 ('x6 imports hedefi src-dışı ise out yerine blind', "if (bases.every((b) => b === null)) picks.push('out');", "if (bases.every((b) => b === null)) picks.push('blind');"),
 ('x7 imports probed eklenmiyor', "    bases.forEach((b) => b !== null && probed?.add(b));\n", ""),
]
for name, a, b in M:
    n = orig.count(a)
    if n != 1: print(f'{name}: PATTERN x{n} — ATLANDI', flush=True); continue
    F.write_text(orig.replace(a, b)); P.write_text(porig.replace(a, b))
    r = subprocess.run(['npx','vitest','run','tests/server-action-rbac-guard.test.ts'], cwd=W, capture_output=True, text=True)
    m = re.search(r'Tests\s+(.*)', r.stdout)
    extra = ''
    if name.startswith(('n18','x7')):
        q = subprocess.run(['npx','vitest','run','tests/zz-probe101.test.ts','-t','shadowing'], cwd=W, capture_output=True, text=True)
        s = re.search(r'SHADOW (.*)', q.stdout); extra = ' | probe SHADOW=' + (s.group(1)[:90] if s else '?')
    print(f'{name}: {"ÖLDÜ" if r.returncode else "HAYATTA"} — {m.group(1).strip() if m else r.stdout[-200:]}{extra}', flush=True)
F.write_text(orig); P.write_text(porig)
