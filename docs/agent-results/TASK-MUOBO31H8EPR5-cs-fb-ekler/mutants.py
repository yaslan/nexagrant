# Bekçi (tests/api/action-leak-scan.ts) üzerinde tek-değişiklik mutantları.
# Her mutant: orijinal bellekten, tek eşleşme assert'li replace, iki test dosyası, orijinali geri yaz (checkout YOK).
import subprocess, re, sys
F = 'tests/api/action-leak-scan.ts'
TESTS = ['tests/api/action-leak-scan.test.ts', 'tests/api/api-error-body-guard.test.ts']
M = [
 # İNCELEME-100'ün 6 hayatta kalanı (be-fb scan-mutants.py ile aynı değişiklikler, bugünkü koda uyarlanmış)
 ('S-c', 'iç içe fonksiyon dönüşleri sink değil', "  for (const f of [sf, ...functions]) {\n    if (rejectionHandlers.has(f)) continue;", "  for (const f of [sf, ...functions]) {\n    if (rejectionHandlers.has(f)) continue;\n    if (f !== sf && f.parent && !ts.isSourceFile(f.parent) && !(ts.isVariableDeclaration(f.parent) && ts.isSourceFile(f.parent.parent.parent))) continue;"),
 ('S-f', '.code muafiyeti her ifadede', "if (n.name.text === 'code' && ts.isIdentifier(obj)) {", "if (n.name.text === 'code') { return false;"),
 ('S-g', 'for…of akışı yok', "    if (ts.isForOfStatement(n) || ts.isForInStatement(n)) flows.push(n);\n", "    if (ts.isForInStatement(n)) flows.push(n);\n"),
 ('S-j', 'eleman erişiminde yalnız indeks', "if (ts.isElementAccessExpression(n)) return leaks(n.expression) || leaks(n.argumentExpression);", "if (ts.isElementAccessExpression(n)) return leaks(n.argumentExpression);"),
 ('S-k', 'new argümanları sızmaz', "        return (n.arguments ?? []).some((a) => leaks(a));\n      }\n      if (ts.isYieldExpression", "        return false;\n      }\n      if (ts.isYieldExpression"),
 ('S-l', 'ternary yalnız whenTrue', "if (ts.isConditionalExpression(n)) return leaks(n.whenTrue) || leaks(n.whenFalse);", "if (ts.isConditionalExpression(n)) return leaks(n.whenTrue);"),
 # Y-1 kuralları
 ('Y1a', 'import izlenmiyor (her src import paket gibi)', "  const importLeaks = (sym: ts.Symbol, member: string | undefined, deep = false): boolean | null => {\n", "  const importLeaks = (sym: ts.Symbol, member: string | undefined, deep = false): boolean | null => {\n    return null;\n"),
 ('Y1b', 'içe aktarılan fonksiyon çağrısı kaynak değil', "      return importLeaks(s, undefined) === true ? 'source' : 'dirty';\n    };", "      return 'dirty';\n    };"),
 ('Y1c', 'import döngüsü güvenilir', "  if (s === PENDING) return true; // an import cycle: fail-closed", "  if (s === PENDING) return false;"),
 ('Y1d', 'bulunamayan src modülü paket sayılır', "  for (const c of tries) if (read(c) !== undefined) return c;\n  return UNRESOLVED;", "  for (const c of tries) if (read(c) !== undefined) return c;\n  return null;"),
 ('Y1e', '#/~ alias paket sayılır', "  else if (/^[#~]/.test(spec)) return UNRESOLVED; // an alias the scan does not read", ""),
 ('Y1f', 'dışa aktarılmayan ad güvenilir', "    return true; // a name this module does not export: fail-closed", "    return false;"),
 ('Y1g', 'export * izlenmiyor', "      if (new RegExp(`\\\\b${name.replace(/[$]/g, '\\\\$')}\\\\b`).test(text)) return moduleExportLeaks(file, name, member, read, deep);", "      void text;"),
 ('Y1h', 'export { x } from izlenmiyor', "          return file === null ? false : moduleExportLeaks(file, local, member, read, deep);", "          return false;"),
 ('Y1i', 'yerel fabrika üretimi güvenilir', "      if (local) return containsSource(local);", "      if (local) return false;"),
 ('Y1j', 'fabrikada deep yok', "    if (deep && (ts.isFunctionLike(node) || ts.isClassLike(node))) return containsSource(node);\n", ""),
 ('Y1k', 'yapıbozumlu export güvenilir', "      let d: ts.Node = node;\n      while (!ts.isVariableDeclaration(d)) d = d.parent;\n      return nodeLeaks(d, undefined, seen, deep);", "      return false;"),
 ('Y1l', 'callback kaynağı sayılmaz', "        return receiverLeaks || callbackLeaks || n.arguments.some((a) => leaks(a));", "        return receiverLeaks || n.arguments.some((a) => leaks(a));"),
 ('Y1m', 'nesne literal getter/metod kaynağı sayılmaz', "        return n.properties.some((p) => (ts.isFunctionLike(p) ? sources.has(p as FnNode) : leaks(p)));", "        return n.properties.some((p) => (ts.isFunctionLike(p) ? false : leaks(p)));"),
 ('Y1n', 'modül yardımcısının argümana yazması yok', "                if (l) for (const j of effects(i)) changed = addRoot(args[j]) || changed;", "                void l;"),
 ('Y1o', 'ns[x]() güvenilir', "        return s && importLeaks(s, undefined) === true ? 'source' : 'dirty';\n      }\n      if (!ts.isIdentifier(e)) return 'dirty';", "        return 'dirty';\n      }\n      if (!ts.isIdentifier(e)) return 'dirty';"),
 ('Y1p', 'yerel kaynak fonksiyon çağrısı kaynak değil', "      if (fn) return sources.has(fn) ? 'source' : clean.has(fn) ? 'clean' : 'dirty';", "      if (fn) return clean.has(fn) ? 'clean' : 'dirty';"),
 # Y-2 kuralları
 ('Y2a', '.code muafiyeti yeniden atanana da', "  for (const s of reassigned) rawSources.delete(s);\n", ""),
 ('Y2b', 'const alias geri yayılımı yok', "        if (a.names.some((id) => tainted.has(symbolOf(id)!))) changed = add(a.root) || changed;", "        void a;"),
 ('Y2c', 'Object/Reflect ilk argüman yok', "              if (MUTATORS.has(method)) changed = addRoot(args[0]) || changed;", "              void method;"),
 ('Y2d', '.call/.apply this argümanı yok', "              // `Array.prototype.push.call(errors, e)`: the `this` argument.\n              changed = addRoot(args[0]) || changed;", "              void 0;"),
 ('Y2e', 'mutatör alıcısı kirlenmez', "              // `out.push(e)`, `m.set(k, e)`, `form.append(k, e)`.\n              changed = addRoot(target.expression) || changed;", "              void 0;"),
 ('Y2f', 'yerel yardımcının parametreden argümana yazması yok', "              if (ids.some((id) => leaks(id))) {", "              if (false) {"),
 ('Y2g', 'yerel yardımcı parametresi kirlenmez', "                for (const id of ids) changed = add(id) || changed;\n              }\n              if (ids", "                void ids;\n              }\n              if (ids"),
 ('Y2h', 'sınıf alanı new ile sızmaz', "        if (cls && classLeaks(cls)) return true;", ""),
 ('Y2i', 'yield sink değil', "    if (ts.isYieldExpression(n) && n.expression) out.push(n.expression);\n", ""),
 ('Y2j', 'allSettled kaynak değil', "        if (isAllSettled(n)) return true;\n", ""),
 ('Y2k', 'callback parametresi kirlenmez', "            if (fn) for (const p of fn.parameters) for (const id of bindingIds(p.name)) changed = add(id) || changed;", "            void fn;"),
 ('Y2l', 'paket fonksiyonu argümanına yazmaz', "              // A package function (`set(out, k, e)`): it may write into any argument.\n              for (const a of args) changed = addRoot(a) || changed;", "              void 0;"),
 # performans önbelleği
 ('P1', 'memo taint büyüyünce temizlenmiyor', "      tainted.add(s);\n      memo.clear();", "      tainted.add(s);"),
]
only = set(sys.argv[1:])
orig = open(F).read()
try:
    for mid, d, a, b in M:
        if only and mid not in only: continue
        if orig.count(a) != 1:
            print(f'UYGULANAMADI | {mid} | {d} | eşleşme={orig.count(a)}', flush=True); continue
        open(F, 'w').write(orig.replace(a, b, 1))
        o = subprocess.run(['npx', 'vitest', 'run', *TESTS], capture_output=True, text=True)
        m = re.search(r'Tests\s+(.*)', o.stdout)
        fails = sorted(set(re.findall(r'FAIL\s+\S+ > (.+?)(?:\n| > )', o.stdout)))[:3]
        print(f"{'ÖLDÜ  ' if o.returncode else 'YAŞADI'} | {mid} | {d} | {m.group(1).strip() if m else o.stdout[-300:]}", flush=True)
finally:
    open(F, 'w').write(orig)
