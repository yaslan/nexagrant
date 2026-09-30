# TASK-MUOIBQJJDKL28 3. teslim: İNCELEME-118 Y-3 — her yeni dalı tek tek bozan mutantlar.
# Harness mutants118.py (crw-fb) ile aynı; her mutanttan sonra dosya bellekten geri yazılır, sonda md5 karşılaştırılır.
import subprocess, re, hashlib
P = 'tests/api/action-leak-scan.ts'
orig = open(P, encoding='utf8').read()
md5 = lambda s: hashlib.md5(s.encode()).hexdigest()
M = [
 ('F1-factory-call', "createRequire(…) çağrısının sonucu yükleyici değil",
  "      if (moduleKind(t, seen) === 'factory') return 'loader';\n", ""),
 ('F2-factory-member', "nm.createRequire üye adı tanınmaz",
  "      if (key === 'createRequire') return 'factory';\n", ""),
 ('F3-factory-import-as', "import { createRequire as cr } tanınmaz",
  "    if (d && ts.isImportSpecifier(d) && (d.propertyName ?? d.name).text === 'createRequire') return 'factory';\n", ""),
 ('F4-factory-bare-name', "çıplak createRequire adı tanınmaz",
  "    if (x.text === 'createRequire') return 'factory';\n", ""),
 ('F5-factory-destructure', "const { createRequire: cr } = … tanınmaz",
  "            : g.key === 'createRequire'\n              ? 'factory'\n              : undefined;", "            : undefined;"),
 ('L1-module-require', "module.require / module['require'] tanınmaz",
  "      if (key === 'require' && isGlobal(obj, 'module')) return 'loader';\n", ""),
 ('L2-call-apply', "require.call / .apply dalı kapalı",
  "    if ((via === 'call' || via === 'apply') && moduleKind(", "    if (false && moduleKind("),
 ('L3-apply-array', ".apply dizisi yerine .call gibi args[1]",
  "      return load(arr && ts.isArrayLiteralExpression(arr) ? arr.elements[0] : undefined);", "      return load(arr);"),
 ('L4-bind', "require.bind(…) sonucu yükleyici değil",
  "      if (memberName(t) === 'bind' && moduleKind((t as ts.PropertyAccessExpression).expression, seen) === 'loader') return 'loader';\n", ""),
 ('L5-comma', "(0, require) virgül soyulmaz",
  "    while (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.CommaToken) x = skipWrappers(x.right);\n    if (isGlobal(x, 'require')) return 'loader';",
  "    if (isGlobal(x, 'require')) return 'loader';"),
 ('L6-alias', "ada verilen değerler izlenmez (takma ad yok)",
  "    for (const g of given(s)) {", "    for (const g of [] as typeof given extends (s: ts.Symbol) => infer R ? R : never) {"),
 ('L7-alias-assign', "sonradan atama (r = require) izlenmez",
  "        } else if (ts.isBinaryExpression(f) && ts.isIdentifier(skipWrappers(f.left))) give(skipWrappers(f.left), f.right);", "        }"),
 ('L8-alias-destructure', "const { require: r } = module izlenmez",
  "              if (!el.dotDotDotToken && (ts.isIdentifier(k) || ts.isStringLiteral(k))) give(el.name, f.initializer, k.text);", "              void k;"),
 ('E1-escape-report', "izlenmeyen yükleyici okunuşu bulgu değil",
  "  for (const n of loaderEscapes) report(n, 'a module loader the scan does not follow (fail-closed)');\n", ""),
 ('E2-escape-summary', "kaçışlı modülün export'ları temiz sayılır",
  "    if (loaderEscapes.length) return true; // a module it may load unseen: fail-closed\n", ""),
 ('E3-escape-effects', "kaçışlı modülün etkileri bilinir sayılır",
  "    if (loaderEscapes.length) return i === null ? NO_EFFECTS : ALL_EFFECTS;\n", ""),
 ('E4-followed-all', "her okunuş izlenmemiş sayılır (FP üretir)",
  "      if (ts.isTypeOfExpression(p)) return true;\n      if (kind !== 'module' && (called(c) || bound(c))) return true;", "      if (ts.isTypeOfExpression(p)) return false;\n      if (false) return true;"),
 ('E5-followed-typeof', "typeof okunuşu izlenmemiş sayılır",
  "      if (ts.isTypeOfExpression(p)) return true;\n", ""),
 ('E6-followed-resolve', "require.resolve izlenmemiş sayılır",
  "        return kind === 'loader' && name === 'resolve';", "        return false;"),
 ('E7-module-read', "`module` okunuşları hiç denetlenmez",
  "        const kind = isGlobal(n, 'module') ? 'module' : moduleKind(n as ts.Expression);", "        const kind = isGlobal(n, 'module') ? undefined : moduleKind(n as ts.Expression);"),
 ('E8-shorthand', "{ require } kısaltması okunuş sayılmaz",
  "      if (ts.isShorthandPropertyAssignment(p)) return true; // `{ require }` holds the value\n", ""),
 ('E9-assign-target', "atama hedefi okunuş sayılır (FP)",
  "      if (ts.isBinaryExpression(p) && p.left === n && isAssignment(p.operatorToken.kind)) return false; // `r = …` writes `r`\n", ""),
 ('V1-let-reassign', "export let yeniden ataması yok sayılır",
  "        if (!hasLeakingReassignment) continue;\n", "        continue;\n"),
 ('V2-let-destructure', "yapıbozum atama hedefleri toplanmaz",
  "          const targets = ts.isObjectLiteralExpression(left) || ts.isArrayLiteralExpression(left) ? bindingIds(left) : ts.isIdentifier(left) ? [left] : [];",
  "          const targets = ts.isIdentifier(left) ? [left] : [];"),
 ('V3-let-compound', "yalnız = sayılır (||= kaçar)",
  "          if (!ts.isBinaryExpression(flow) || !isAssignment(flow.operatorToken.kind)) return false;",
  "          if (!ts.isBinaryExpression(flow) || flow.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;"),
 ('V4-let-by-name', "sembol yerine ad metniyle eşleme (gölgeleme FP)",
  "          return targets.some((id) => own.has(symbolOf(id))) && nodeLeaks(", "          return targets.some((id) => [...own].some((o) => o?.name === id.text)) && nodeLeaks("),
 ('X1-import-kind', "import edilen yükleyici (import { r }) tanınmaz",
  "    if (d && ts.isImportSpecifier(d)) return importedKind(s);\n", ""),
 ('X2-namespace-kind', "L.r ad alanı üyesi yükleyici tanınmaz",
  "      return nd && ts.isNamespaceImport(nd) ? importedKind(ns!, key) : undefined;", "      return undefined;"),
 ('X3-reexport-from', "export { r } from './x' zinciri izlenmez",
  "        return file === null || file === UNRESOLVED ? undefined : summaryOf(file, read)?.exportKind(local);", "        return undefined;"),
 ('X4-export-specifier', "const r = require; export { r } tanınmaz",
  "      return d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) ? moduleKind(d.name) : undefined;\n    }", "      return undefined;\n    }"),
 ('X5-export-const', "export const r = require tanınmaz",
  "    return ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) ? moduleKind(decl.name) : undefined;\n  };", "    return undefined;\n  };"),
]
def run():
    r = subprocess.run(['npx', 'vitest', 'run', 'tests/api/action-leak-scan.test.ts', '--reporter=verbose'], capture_output=True, text=True, timeout=900)
    out = r.stdout + r.stderr
    failed = [l.strip() for l in out.splitlines() if l.strip().startswith('×')]
    summ = [l.strip() for l in out.splitlines() if re.match(r'\s*(Test Files|Tests)\s', l)]
    return r.returncode, failed, summ, out.count('timed out')
code, failed, summ, to = run()
print(f"BASELINE exit={code} {' · '.join(summ)} timeouts={to}")
for k, desc, a, b in M:
    assert orig.count(a) == 1, (k, orig.count(a))
    open(P, 'w', encoding='utf8').write(orig.replace(a, b))
    try:
        code, failed, summ, to = run()
    finally:
        open(P, 'w', encoding='utf8').write(orig)
    verdict = 'KILLED' if code != 0 and failed else ('SURVIVED' if code == 0 else f'ERROR exit={code}')
    print(f"{k:22} | {desc} | {verdict} | {' · '.join(summ)} | timeouts={to}")
    for f in failed[:3]: print(f"       {f[:170]}")
print('md5 orijinal', md5(orig), '· dosya şimdi', md5(open(P, encoding='utf8').read()))
