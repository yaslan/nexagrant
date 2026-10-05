import subprocess, re, sys
P = 'tests/api/action-leak-scan.ts'
orig = open(P, encoding='utf8').read()
M = [
 ('K1', 'döngü PENDING → temiz', "if (s === PENDING) return true; // an import cycle: fail-closed", "if (s === PENDING) return false;"),
 ('K2', 'okunamayan modül → temiz', "    if (src === undefined) return true;\n    byFile.set(file, PENDING);", "    if (src === undefined) return false;\n    byFile.set(file, PENDING);"),
 ('K3', 'export * UNRESOLVED → atla', "      if (file === UNRESOLVED) return true;\n      const text", "      if (file === UNRESOLVED) continue;\n      const text"),
 ('K4', 'for…in akışı kaldır', "if (ts.isForOfStatement(n) || ts.isForInStatement(n)) flows.push(n);", "if (ts.isForOfStatement(n)) flows.push(n);"),
 ('K5', 'add() memo.clear kaldır', "      tainted.add(s);\n      memo.clear();", "      tainted.add(s);"),
 ('K6', '++/-- yeniden atama sayılmıyor', "      const s = symbolOf(n.operand);\n      if (s) reassigned.add(s);", "      const s = symbolOf(n.operand);\n      void s;"),
 ('K7', 'rest param yayılımı kaldır', "if (leaking[i] || (p.dotDotDotToken && leaking.slice(i).some(Boolean))) {", "if (leaking[i]) {"),
 ('K8', 'adla verilen handler → temiz', "if (ts.isIdentifier(skipWrappers(h as ts.Expression))) return callee(h) === 'dirty';", "if (ts.isIdentifier(skipWrappers(h as ts.Expression))) return false;"),
 ('K9', 'argEffects rest: Math.min kaldır', "const p = params[Math.min(i, params.length - 1)];", "const p = params[i];"),
 ('K10', 'resolveSpec index denemesi yok', ", ...CODE_EXTS.map((x) => `${stem}/index${x}`)]", "]"),
 ('K11', 'trustedImport modül yolu kontrolü yok', "return normalize(resolved).split('\\\\').join('/').replace(/\\.tsx?$/, '') === expected;", "return true;"),
 ('K12', 'yerel çağrı nodeLeaks: bilinmeyen tanım → temiz', "      if (!s) return true;\n      const decl = s.declarations?.[0];\n      if (decl && (ts.isImportSpecifier", "      if (!s) return false;\n      const decl = s.declarations?.[0];\n      if (decl && (ts.isImportSpecifier"),
 ('K13', 'nodeLeaks: deep fonksiyon → containsSource yerine false', "if (deep && (ts.isFunctionLike(node) || ts.isClassLike(node))) return containsSource(node);", "if (deep && (ts.isFunctionLike(node) || ts.isClassLike(node))) return false;"),
 ('K14', 'rejection handler param .code güveni kaldır (FP yönü)', "if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) for (const p of h.parameters) trustRaw(p.name);", "void h;"),
 ('K15', 'MUTATORS: splice/unshift/fill çıkar', "'push', 'unshift', 'splice', 'set', 'add', 'append', 'fill',", "'push', 'set', 'add', 'append',"),
 ('K16', 'MUTATORS: append çıkar', "'set', 'add', 'append', 'fill'", "'set', 'add', 'fill'"),
 ('K17', 'ns.f(): namespace üyesi → temiz', "return member === undefined ? true : moduleExportLeaks(file, member, undefined, read, deep);\n    }\n    return moduleExportLeaks(file, name, member, read, deep);", "return member === undefined ? true : false;\n    }\n    return moduleExportLeaks(file, name, member, read, deep);"),
 ('K18', 'export * as ns: üye yok → true yerine false', "        return member === undefined ? true : moduleExportLeaks(file, member, undefined, read, deep);\n      }\n      return nodeLeaks(decl", "        return member === undefined ? false : moduleExportLeaks(file, member, undefined, read, deep);\n      }\n      return nodeLeaks(decl"),
 ('K19', 'VoidExpression kaldır (FP yönü)', "if (ts.isTypeOfExpression(n) || ts.isVoidExpression(n) || ts.isDeleteExpression(n)) return false;", "if (ts.isTypeOfExpression(n) || ts.isDeleteExpression(n)) return false;"),
 ('K20', 'nesne literali: metodu kaynaksa sızıntı → false', "return n.properties.some((p) => (ts.isFunctionLike(p) ? sources.has(p as FnNode) : leaks(p)));", "return n.properties.some((p) => (ts.isFunctionLike(p) ? false : leaks(p)));"),
]
out = []
for mid, desc, a, b in M:
    if orig.count(a) != 1:
        out.append(f'ATLANDI | {mid} | {desc} | kalıp {orig.count(a)} kez'); continue
    open(P, 'w', encoding='utf8').write(orig.replace(a, b))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', 'tests/api/action-leak-scan.test.ts', 'tests/api/api-error-body-guard.test.ts'], capture_output=True, text=True, timeout=300)
    finally:
        open(P, 'w', encoding='utf8').write(orig)
    txt = r.stdout + r.stderr
    m = re.search(r'Tests\s+(.*?)\n', txt)
    out.append(f"{'ÖLDÜ' if r.returncode else 'YAŞADI'} | {mid} | {desc} | {m.group(1).strip() if m else '?'}")
    print(out[-1], flush=True)
assert open(P, encoding='utf8').read() == orig
open('.probe107/mutants-out.txt', 'w').write('\n'.join(out) + '\n')
