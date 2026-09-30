import subprocess, re, pathlib, sys
F = pathlib.Path(sys.argv[1]) / 'tests/server-action-rbac-guard.test.ts'
orig = F.read_text()
M = [
 ('n1 imports eşit önek: uzun anahtar kuralı yok (Y-2)', "(node && alias.prefix.length === top.prefix.length && alias.suffix.length > top.suffix!.length)", "false"),
 ('n2 Node: boş * kabul', " + (node ? 1 : 0)", ""),
 ('n3 en uzun önek yok', "alias.prefix.length > top.prefix.length || ", ""),
 ('n4 tam anahtar önceliği yok', "if (spec === alias.prefix) return [{ alias, star: '' }];", "if (spec === alias.prefix && !best.length) return [{ alias, star: '' }];"),
 ('n5 anahtar soneki denetlenmiyor', " || !spec.endsWith(alias.suffix)", ""),
 ('n6 tsconfig eşit önek: ilk anahtar (bağ yok)', "else if (!node && alias.prefix.length === top.prefix.length) best.push(alias);", ""),
 ('n7 kaynaklar ayrılmıyor', "    if (alias.source !== source) continue;\n    if (alias.suffix === null) {\n      if (spec === alias.prefix) return", "    if (alias.suffix === null) {\n      if (spec === alias.prefix) return"),
 ('n8 baseUrl adımı yok (Y-1)', "if (tsPick === null && baseUrl !== null) tsPick", "if (false) tsPick"),
 ('n9 kaçan src → hep paket (fail-open)', "missed !== null && !isPackage(spec)", "false"),
 ('n10 isPackage hep true (fail-open)', "  if (isBuiltin(spec)) return true;\n", "  return true;\n"),
 ('n11 isPackage hep false (B-1 FP geri)', "  if (isBuiltin(spec)) return true;\n", "  return false;\n"),
 ('n12 src dışı hedef hep out (düşüş yok)', "return resolvesOutside(target) ? 'out' : null;", "return 'out';"),
 ('n13 çok hedefli paths → ilk hedef', "if (targets.length > 1) tsPick = targets.some((t) => underSrc(t) !== null) ? 'blind' : 'out';\n    else tsPick", "tsPick"),
 ('n14 iki dosya ayrışınca ilk seçim', "new Set(picks.map(pickKey)).size === 1 ? picks[0]!", "true ? picks[0]!"),
 ('n15 imports dizisi: yalnız ilk', "else if (Array.isArray(value)) value.forEach((v) => importTargets(v, out));", "else if (Array.isArray(value)) importTargets(value[0], out);"),
 ('n16 tsconfig parse hatası yutuluyor', "if (error) problems.push", "if (false) problems.push"),
 ('n17 baseUrl string değil → sessiz', "if (opts.baseUrl !== undefined && typeof opts.baseUrl !== 'string') problems.push", "if (false) problems.push"),
 ('n18 bare: probed eklenmiyor', "    probed?.add(base);\n    if (!isUnresolved", "    if (!isUnresolved"),
 ('n19 resolvesOutside hep false', "  return [target, ...exts", "  return false && [target, ...exts"),
 ('n20 kaçan src hedef düşmüyor (B-1 FP geri)', "    missed ??= base;\n    return null;", "    return { base };"),
 ('n21 imports eşleşmesi yok sayılıyor', "  if (importsMatch.length) {", "  if (false) {"),
]
for name, a, b in M:
    n = orig.count(a)
    if n != 1: print(f'{name}: PATTERN x{n} — ATLANDI', flush=True); continue
    F.write_text(orig.replace(a, b))
    r = subprocess.run(['npx','vitest','run','tests/server-action-rbac-guard.test.ts'], cwd=sys.argv[1], capture_output=True, text=True)
    m = re.search(r'Tests\s+(.*)', r.stdout)
    fails = sorted(set(re.findall(r'> ([^>\n]*?)\s*\d*ms?\n', '')))
    names = sorted(set(re.findall(r'FAIL .*> ([^>\n]+)$', r.stdout, re.M)))
    print(f'{name}: {"ÖLDÜ" if r.returncode else "HAYATTA"} — {m.group(1).strip() if m else r.stdout[-300:]} {names[:3]}', flush=True)
F.write_text(orig)
