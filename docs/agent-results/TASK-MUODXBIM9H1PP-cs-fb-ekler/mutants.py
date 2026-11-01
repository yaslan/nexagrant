# Mutation run over tests/api/action-leak-scan.ts (TASK-MUODXBIM9H1PP). K1..K20 are crw2-fb's
# İNCELEME-107 mutants remapped onto the new code with the same meaning; N1..N15 pin the new rules.
# The file is restored from memory after every run and checked byte for byte at the end.
import subprocess, re, sys
P = 'tests/api/action-leak-scan.ts'
orig = open(P, encoding='utf8').read()
STUB = "{ findings: [], exportLeaks: () => false, exportVia: () => undefined, effects: () => NO_EFFECTS }"
M = [
 ('K1', 'import cycle (PENDING) → clean', "if (s === PENDING) return undefined; // an import cycle: fail-closed", f"if (s === PENDING) return {STUB};"),
 ('K2', 'unreadable module → clean', "  if (src === undefined) return undefined;\n  byFile.set(file, PENDING);", f"  if (src === undefined) return {STUB};\n  byFile.set(file, PENDING);"),
 ('K3', 'export * from UNRESOLVED → skipped', "      if (file === UNRESOLVED) return UNRESOLVED;\n      const text", "      if (file === UNRESOLVED) continue;\n      const text"),
 ('K4', 'no for…in flow', "    if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {\n      flows.push(n);", "    if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {\n      if (ts.isForOfStatement(n)) flows.push(n);"),
 ('K5', 'add() without memo.clear', "      tainted.add(s);\n      memo.clear();", "      tainted.add(s);"),
 ('K6', '++/-- not a write', "      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)\n    ) {\n      writeRoot(n.operand);", "      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)\n    ) {\n      void n;"),
 ('K7', 'local rest parameter spread dropped', "if (fn !== isolate && (leaking[i] || (p.dotDotDotToken && leaking.slice(i).some(Boolean)))) {", "if (fn !== isolate && leaking[i]) {"),
 ('K8', 'handler passed by name → clean', "if (ts.isIdentifier(skipWrappers(h as ts.Expression))) return callee(h) === 'dirty';", "if (ts.isIdentifier(skipWrappers(h as ts.Expression))) return false;"),
 ('K9', 'module rest: no Math.min', "p = params[Math.min(i, params.length - 1)];", "p = params[i];"),
 ('K10', 'resolveSpec without index files', ", ...CODE_EXTS.map((x) => `${stem}/index${x}`)]", "]"),
 ('K11', 'trustedImport without module check', "return normalize(resolved).split('\\\\').join('/').replace(/\\.tsx?$/, '') === expected;", "return true;"),
 ('K12', 'call export with unnamed callee → clean', "      const s = ts.isIdentifier(t) ? symbolOf(t) : undefined;\n      if (!s) return true;", "      const s = ts.isIdentifier(t) ? symbolOf(t) : undefined;\n      if (!s) return false;"),
 ('K13', 'deep: containsSource → false', "if (deep && (ts.isFunctionLike(node) || ts.isClassLike(node))) return containsSource(node);", "if (deep && (ts.isFunctionLike(node) || ts.isClassLike(node))) return false;"),
 ('K14', 'no .code trust for handler params (FP side)', "if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) for (const p of h.parameters) trustRaw(p.name);", "void h;"),
 ('K15', 'MUTATORS without splice/unshift/fill', "'push', 'unshift', 'splice', 'set', 'add', 'append', 'fill',", "'push', 'set', 'add', 'append',"),
 ('K16', 'MUTATORS without append', "'set', 'add', 'append', 'fill'", "'set', 'add', 'fill'"),
 ('K17', 'ns.f(): namespace member → clean', "      return member === undefined ? true : moduleExportLeaks(t.file, member, undefined, read, deep);", "      return member === undefined ? true : false;"),
 ('K18', 'export * as ns: whole → clean', "        return member === undefined ? true : moduleExportLeaks(file, member, undefined, read, deep);\n      }\n      return nodeLeaks(decl", "        return member === undefined ? false : moduleExportLeaks(file, member, undefined, read, deep);\n      }\n      return nodeLeaks(decl"),
 ('K19', 'void carries taint (FP side)', "if (ts.isTypeOfExpression(n) || ts.isVoidExpression(n) || ts.isDeleteExpression(n)) return false;", "if (ts.isTypeOfExpression(n) || ts.isDeleteExpression(n)) return false;"),
 ('K20', 'object literal method source → clean', "return n.properties.some((p) => (ts.isFunctionLike(p) ? sources.has(p as FnNode) : leaks(p)));", "return n.properties.some((p) => (ts.isFunctionLike(p) ? false : leaks(p)));"),
 ('N1', 'B-1: dynamic loads not seen', "    if (!ts.isCallExpression(x)) return undefined;\n    if (x.expression.kind", "    if (x) return undefined;\n    if (x.expression.kind"),
 ('N2', 'B-1: non-literal specifier → package', "return spec && ts.isStringLiteralLike(spec) ? resolveSpec(fileName, spec.text, read) : UNRESOLVED;", "return spec && ts.isStringLiteralLike(spec) ? resolveSpec(fileName, spec.text, read) : null;"),
 ('N3', 'B-2: direct writes ignored', "  for (const w of writes) markWritten(w);", "  void writes;"),
 ('N4', 'B-2: Object/Reflect first argument not a write', "          if (MUTATORS.has(method)) writeArg(args[0]);\n          if (method === 'apply') writeArg(args[1]);", "          void method;"),
 ('N5', 'B-2: alias write not reflected on the binding', "      if (!written.has(rs) && a.names.some((id) => written.has(symbolOf(id)!))) {", "      if (false) {"),
 ('N6', 'Y-1: exports of a use-server file not judged', "  if (action && directive(sf.statements)) {", "  if (action && !directive(sf.statements)) {"),
 ('N7', 'Y-2: parameter calls not recorded', "      const at = paramOf(sym);\n      if (!at) return false;", "      const at = paramOf(sym);\n      if (at || !at) return false;"),
 ('N8', 'Y-2: self effects of imports dropped', "            if (effects) changed = applyEffects(effects(null), args) || changed;\n            continue;", "            continue;"),
 ('N9', 'Y-3: this.helper() not resolved', "        if (m && sources.has(m)) return 'source';", "        void m;"),
 ('N10', 'Y-4: imported values read as clean', "        return isImport(s) && !trustedImport(s) && importLeaks(s, undefined) === true;", "        return false;"),
 ('N11', 'Y-5: literal holders not aliases', "    if (ts.isArrayLiteralExpression(x)) for (const el of x.elements)", "    if (false) for (const el of (x as ts.ArrayLiteralExpression).elements)"),
 ('N12', 'Y-6: new Promise resolve ignored', "          if (executor && paramCalls.get(executor)?.has(0)) return true;", "          void executor;"),
 ('N13', 'Ö-2: callback arguments are sinks again (FP side)', "    if (rejectionHandlers.has(f) || isCallArgument(f)) continue;", "    if (rejectionHandlers.has(f)) continue;"),
 ('N14', 'isolation off: every call site feeds the helper (FP side)', "              if (fn !== isolate && (leaking[i]", "              if ((leaking[i]"),
 ('N15', 'this-writes ignored', "        if (!c || heldByThis.has(c)) return false;\n        heldByThis.add(c);", "        if (c || !c) return false;\n        heldByThis.add(c);"),
]
only = set(sys.argv[1:])
out = []
try:
    for mid, desc, a, b in M:
        if only and mid not in only: continue
        if orig.count(a) != 1:
            out.append(f'SKIPPED | {mid} | {desc} | pattern found {orig.count(a)}x'); print(out[-1], flush=True); continue
        open(P, 'w', encoding='utf8').write(orig.replace(a, b))
        r = subprocess.run(['npx', 'vitest', 'run', 'tests/api/action-leak-scan.test.ts', 'tests/api/api-error-body-guard.test.ts'], capture_output=True, text=True, timeout=600)
        txt = r.stdout + r.stderr
        m = re.search(r'Tests\s+(.*?)\n', txt)
        out.append(f"{'KILLED' if r.returncode else 'LIVED '} | {mid} | {desc} | {m.group(1).strip() if m else '?'}")
        print(out[-1], flush=True)
finally:
    open(P, 'w', encoding='utf8').write(orig)
assert open(P, encoding='utf8').read() == orig
print('restored byte-for-byte')
