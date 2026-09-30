"""TASK-MUNSRKW0HJYBV: undo each hardening of the guard, one at a time, and list which tests go red."""
import subprocess, pathlib, re
G = pathlib.Path("tests/server-action-rbac-guard.test.ts")
R = {
 "R1 catch need not leave (N1)": ("const catchLeaves = !stmt.catchClause || exits(stmt.catchClause.block, returnStops);", "const catchLeaves = true;"),
 "R2 await not required (N2)": ("if (isThrowingCheck(call, this.mod)) return awaited || !ASYNC_CHECKS.has(checkName(call, this.mod)!);", "if (isThrowingCheck(call, this.mod)) return true;"),
 "R3 check need not be imported (N3)": ("if (!imp || !(imp.name in CHECK_SOURCES) || CHECK_SOURCES[imp.name] !== imp.target) return null;\n  return imp.name;", "return name;"),
 "R4 fixed role accepted (N4)": ("if (name === 'can') return !isFixedRole(call.arguments[0], mod) && isRbacAction(call.arguments[1], mod);", "if (name === 'can') return isRbacAction(call.arguments[1], mod);"),
 "R5 helper early return ignored (N5)": ("if (this.atHelperTop && !checked && returnsIn(stmt)) this.leaks = true;", ""),
 "R6 parameter defaults not walked (N6)": ("for (const p of fn.parameters) if (p.initializer) this.node(p.initializer, checked);", ""),
 "R7 element access not a model (N7)": ("    : ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)\n      ? e.argumentExpression.text\n", "    : ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)\n      ? null\n"),
 "R8 references not followed (N8)": ("if (ts.isIdentifier(node) && isReference(node)) this.follow(node, null, checked);", "if (ts.isIdentifier(node) && isReference(node) && ts.isCallExpression(node.parent) && node.parent.expression === node) this.follow(node, null, checked);"),
 "R9 $queryRaw never a write (N9)": ("if (RAW_QUERIES.has(method)) return sql && SQL_WRITE.test(sql.getText(mod.sf)) ? `${text()} (writing SQL)` : null;", ""),
 "R10 exported non-function ignored (N10)": ("        if (hasExport(stmt)) {\n          badExports.push({", "        if (false) {\n          badExports.push({"),
 "R11 anonymous default skipped (N11)": ("const name = stmt.name?.text ?? (hasModifier(stmt, ts.SyntaxKind.DefaultKeyword) ? 'default' : null);", "const name = stmt.name?.text ?? null;"),
 "R12 aliases ignored (N12)": ("return name && ts.isIdentifier(e) && aliases?.has(name) ? name : null;", "return null;"),
 "R13 optional call counts (N13)": ("if (ts.isCallExpression(e) && !e.questionDotToken && !ts.isOptionalChain(e)) found.push({ call: e, awaited });", "if (ts.isCallExpression(e)) found.push({ call: e, awaited });\n    if (ts.isCallExpression(e) && e.questionDotToken) for (const a of e.arguments) { const x = strip(a); if (ts.isCallExpression(x)) found.push({ call: x, awaited: true }); }"),
 "R14 no cross-module walk (N14/G5)": ("if (found && !TRUSTED.has(found.mod.id) && !found.mod.useServer) this.enter(", "if (false && found) this.enter("),
 "R15 depth 1 only (G5 depth)": ("const MAX_DEPTH = 6;", "const MAX_DEPTH = 1;"),
 "R16 server-action boundary removed (FP guard)": ("&& !found.mod.useServer) this.enter(", ") this.enter("),
}
orig = G.read_text()
import sys
for name, (old, new) in R.items():
    if sys.argv[1:] and name.split()[0] not in sys.argv[1:]: continue
    assert orig.count(old) == 1, (name, orig.count(old))
    G.write_text(orig.replace(old, new))
    try:
        r = subprocess.run(["npx", "vitest", "run", str(G), "--reporter=verbose"], capture_output=True, text=True)
    finally:
        G.write_text(orig)
    out = r.stdout + r.stderr
    red = sorted({re.sub(r"\s+\d+ms$", "", l.strip().split(" > ")[-1]) for l in out.splitlines() if l.strip().startswith("×")})
    summ = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
    print(f"### {name}: exit={r.returncode} {' '.join(summ)}")
    for x in red: print("     ×", x)
