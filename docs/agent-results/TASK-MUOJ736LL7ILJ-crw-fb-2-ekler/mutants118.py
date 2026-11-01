# İNCELEME-118: crw2-fb'nin A1/A3/A4/A10 mutantları (mutants-named.py'den aynen) 4b11aa01 üzerinde.
# Her mutant sonrası dosya bellekten geri yazılır; sonda md5 karşılaştırılır.
import subprocess, re, hashlib
P = 'tests/api/action-leak-scan.ts'
orig = open(P, encoding='utf8').read()
md5 = lambda s: hashlib.md5(s.encode()).hexdigest()
M = [
 ('A1', 'dynamic load used as value → clean', "        if (load !== undefined) return load !== null;\n        const h = rejectionHandler(n);", "        if (load !== undefined) return false;\n        const h = rejectionHandler(n);"),
 ('A3', 'catch binding handed to an import not a write', "          if (rs && isImport(rs)) args.forEach(writeArg);", "          void rs;"),
 ('A4', 'Reflect.apply(fn, e) not a write', "          if (method === 'apply') writeArg(args[1]);\n        } else if", "        } else if"),
 ('A10', 'effects of (await import()).f(out) dropped', "      if (load !== undefined) t = { file: load };\n      else if", "      if (false) t = { file: load! };\n      else if"),
]
def run():
    r = subprocess.run(['npx', 'vitest', 'run', 'tests/api/action-leak-scan.test.ts', '--reporter=verbose'], capture_output=True, text=True, timeout=900)
    out = r.stdout + r.stderr
    failed = [l.strip() for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('✗')]
    summ = [l.strip() for l in out.splitlines() if re.match(r'\s*(Test Files|Tests)\s', l)]
    to = out.count('timed out')
    return r.returncode, failed, summ, to
code, failed, summ, to = run()
print(f"BASELINE exit={code} {' · '.join(summ)} timeouts={to}")
for k, desc, a, b in M:
    assert orig.count(a) == 1, k
    open(P, 'w', encoding='utf8').write(orig.replace(a, b))
    try:
        code, failed, summ, to = run()
    finally:
        open(P, 'w', encoding='utf8').write(orig)
    verdict = 'KILLED' if code != 0 and failed else ('SURVIVED' if code == 0 else f'ERROR exit={code}')
    print(f"{k:4} | {desc} | {verdict} | {' · '.join(summ)} | timeouts={to}")
    for f in failed[:6]: print(f"       {f}")
print('md5 orijinal', md5(orig), '· dosya şimdi', md5(open(P, encoding='utf8').read()))
