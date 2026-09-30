# Extract the ```bash blocks of RELEASE_CHECKLIST §3.1 verbatim (fence indentation removed,
# as a markdown renderer shows them) into block1.sh.. in the given dir.
import sys, re, pathlib
doc, out = sys.argv[1], pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
lines = open(doc, encoding='utf8').read().split('\n')
start = next(i for i, l in enumerate(lines) if '(c) Bugünkü eski claim' in l)
end = next(i for i, l in enumerate(lines) if l.startswith('**`legacyClaims` ne zaman'))
n, i = 0, start
while i < end:
    m = re.match(r'^(\s*)```bash\s*$', lines[i])
    if m:
        ind = len(m.group(1)); body = []; i += 1
        while not re.match(r'^\s*```\s*$', lines[i]):
            body.append(lines[i][ind:] if lines[i][:ind].strip() == '' else lines[i]); i += 1
        n += 1; (out / f'block{n}.sh').write_text('\n'.join(body) + '\n', encoding='utf8')
        print(f'--- block{n}.sh (doc lines {i-len(body)+1}-{i}) ---'); print('\n'.join(body))
    i += 1
