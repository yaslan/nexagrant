# İNCELEME-101 B-1: n18 (ve x7) mutantı RBAC bekçisinde; orijinal bellekten geri yazılır.
import subprocess, re
F = 'tests/server-action-rbac-guard.test.ts'
M = [
 ('n18', 'bare: at() probed eklemiyor', "    probed?.add(base);\n    if (!isUnresolved(lookup(base, overlay) ?? '')) return { base };", "    if (!isUnresolved(lookup(base, overlay) ?? '')) return { base };"),
 ('n18r', 'göreli: resolveSpec probed eklemiyor', "  if (base === '..' || base.startsWith('../')) return null;\n  probed?.add(base);", "  if (base === '..' || base.startsWith('../')) return null;"),
 ('x7', 'imports: probed eklenmiyor', "    bases.forEach((b) => b !== null && probed?.add(b));\n", ""),
]
orig = open(F).read()
try:
    for mid, d, a, b in M:
        if orig.count(a) != 1: print('UYGULANAMADI', mid, orig.count(a)); continue
        open(F, 'w').write(orig.replace(a, b, 1))
        o = subprocess.run(['npx', 'vitest', 'run', F], capture_output=True, text=True)
        m = re.search(r'Tests\s+(.*)', o.stdout)
        failed = re.findall(r'×\s+(.*?)\s+\d+ms', o.stdout)
        print(f"{'ÖLDÜ  ' if o.returncode else 'YAŞADI'} | {mid} | {d} | {m.group(1).strip() if m else o.stdout[-300:]} | {failed[:3]}", flush=True)
finally:
    open(F, 'w').write(orig)
