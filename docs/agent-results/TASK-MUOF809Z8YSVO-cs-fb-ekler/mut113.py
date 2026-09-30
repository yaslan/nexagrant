#!/usr/bin/env python3
"""cs-fb İNCELEME-113 mutant runner: literal (non-regex) replace, byte-copy restore, git diff --quiet after each."""
import subprocess, sys, os, re, csv, shutil
WT = sys.argv[1]; OUT = sys.argv[2]; only = set(sys.argv[3:])
os.chdir(WT)
url = os.environ.get('DATABASE_URL', '')
assert '55136' in url and os.environ.get('CI') == 'true', 'wrong env'
print(f'CI={os.environ["CI"]} DATABASE_URL={url}', flush=True)
E='src/lib/scoring/embeddings.ts'; U='scripts/k1-embeddings-unlock-rejected.ts'
R='src/app/api/concept-notes/[id]/export/route.ts'; H='src/lib/docx-safe-html.ts'; C='src/lib/content-disposition.ts'
SETS = {
 'emb': ['src/lib/scoring/embeddings', 'src/lib/jobs/tasks/__tests__/k1-embeddings', 'tests/k1-embeddings'],
 'doc': ['src/app/api/concept-notes/[id]/export/', 'src/lib/docx-safe-html', 'src/lib/content-disposition'],
}
LEAKY = "(await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })))"
PLOG = "for (const p of profiles) console.log(`  profile ${p.tenantId}`);"
M = [
 # id, group, file, set, old, new
 ('O1a-profile-LIKE', 'Ö-1', U, 'emb', 'SET "embeddingHash" = NULL WHERE "tenantId" = ${p.tenantId} AND "embeddingHash" LIKE ${LIKE}', 'SET "embeddingHash" = NULL WHERE "tenantId" = ${p.tenantId}'),
 ('O1b-topic-LIKE', 'Ö-1', U, 'emb', 'WHERE id = ANY(${topicIds}::text[]) AND "embeddingHash" LIKE ${LIKE}', 'WHERE id = ANY(${topicIds}::text[])'),
 ('O2-429-prefix-retry', 'Ö-2', E, 'emb', "if (r !== 'cap' && 'error' in r && isInputRejection(r.error)) {", "if (r !== 'cap' && 'error' in r && (isInputRejection(r.error) || errorStatus(r.error) === 429)) {"),
 ('O3a-warn-inner-text', 'Ö-3a', U, 'emb', PLOG, "for (const p of profiles) console.warn(`  profile ${p.tenantId} ${" + LEAKY + "?.capabilities}`);"),
 ('O3a-error-inner-text', 'Ö-3a', U, 'emb', PLOG, "for (const p of profiles) console.error(`  profile ${p.tenantId} ${" + LEAKY + "?.capabilities}`);"),
 ('O3a-log-object-arg', 'Ö-3a', U, 'emb', PLOG, 'for (const p of profiles) console.log("  profile", ' + LEAKY + ');'),
 ('O3b-log-user-email', 'Ö-3b', R, 'doc', "      tenantId,\n      reason:", "      tenantId,\n      user: session?.user?.email,\n      reason:"),
 ('O3b-log-user-name', 'Ö-3b', R, 'doc', "      tenantId,\n      reason:", "      tenantId,\n      who: session?.user?.name,\n      reason:"),
 ('O3c-reason-200-400', 'Ö-3c', R, 'doc', ".split('\\n')[0]!.slice(0, 200),", ".split('\\n')[0]!.slice(0, 400),"),
 ('O3c-no-first-line-cut', 'Ö-3c', R, 'doc', ".split('\\n')[0]!.slice(0, 200),", ".slice(0, 200),"),
 ('O4-LE-count-read-BE', 'Ö-4', H, 'doc', 'entry.readUInt32BE(4) : entry.readUInt32LE(4)', 'entry.readUInt32BE(4) : entry.readUInt32BE(4)'),
 ('O4-LE-u16-read-BE', 'Ö-4', H, 'doc', 'b.readUInt16BE(at) : b.readUInt16LE(at)', 'b.readUInt16BE(at) : b.readUInt16BE(at)'),
 ('O4-count-ne1-check-removed', 'Ö-4', H, 'doc', '    if ((bigEndian ? entry.readUInt32BE(4) : entry.readUInt32LE(4)) !== 1) return true;\n', ''),
 ('O4-count-ne1-returns-false', 'Ö-4', H, 'doc', 'entry.readUInt32LE(4)) !== 1) return true;', 'entry.readUInt32LE(4)) !== 1) return false;'),
 ('O4-7byte-entry', 'Ö-4', H, 'doc', 'if (entry.length < 8) return false;', 'if (entry.length < 7) return false;'),
 ('O5-digit-gate-letters-only', 'Ö-5', C, 'doc', '/[A-Za-z0-9]/.test(asciiBase)', '/[A-Za-z]/.test(asciiBase)'),
 ('O5-slash-not-unsafe', 'Ö-5', C, 'doc', '\\u2066-\\u2069\\\\/:*?', '\\u2066-\\u2069\\\\:*?'),
 ('O5-punct-start-fallback', 'Ö-5', C, 'doc', '/[A-Za-z0-9]/.test(asciiBase)', '/^[A-Za-z0-9]/.test(asciiBase)'),
 ('O6-deleted-tenant-filter', 'Ö-6', U, 'emb', 'where: { deletedAt: null, ', 'where: { '),
 ('O6-isMain-always-true', 'Ö-6', U, 'emb', "const isMain = process.argv[1]?.includes('k1-embeddings-unlock-rejected');", 'const isMain = true;'),
 ('O6-isMain-always-false', 'Ö-6', U, 'emb', "const isMain = process.argv[1]?.includes('k1-embeddings-unlock-rejected');", 'const isMain = false;'),
 # be-fb 3rd delivery set (re-run on the full docx/cd/route suites)
 ('B-O1-JPEG-not', 'be-fb', H, 'doc', "{ mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] }", "{ mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xfe] }"),
 ('B-O1-PNG-header', 'be-fb', H, 'doc', "=== 'IHDR' && bytes.length >= 24", "=== 'IHDR' && bytes.length >= 1"),
 ('B-O2-JPEG-bound-removed', 'be-fb', H, 'doc', 'if (i > buffer.length || buffer[i] !== 0xff) return false;', 'if (buffer[i] !== 0xff) return false;'),
 ('B-O2-JPEG-bound-ge', 'be-fb', H, 'doc', 'if (i > buffer.length || buffer[i] !== 0xff) return false;', 'if (i >= buffer.length || buffer[i] !== 0xff) return false;'),
 ('B-O4-LE-byteAlign', 'be-fb', H, 'doc', "if (!bigEndian && byteAlign !== '4949') return true;", "if (!bigEndian && byteAlign === '4949') return true;"),
 ('B-O4-orientation-count', 'be-fb', H, 'doc', 'entry.readUInt32LE(4)) !== 1) return true;', 'entry.readUInt32LE(4)) === 1) return true;'),
 ('B-O4-entry-bytes', 'be-fb', H, 'doc', 'return entry.length >= 10;', 'return entry.length >= 8;'),
 ('B-O3-MAX_IMAGE-halved', 'be-fb', H, 'doc', 'export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;', 'export const MAX_IMAGE_BYTES = 1 * 1024 * 1024;'),
 ('B-O3-MAX_TOTAL-halved', 'be-fb', H, 'doc', 'export const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;', 'export const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024;'),
 ('B-O6-MAX_DEPTH-16', 'be-fb', H, 'doc', 'const MAX_DEPTH = 32;', 'const MAX_DEPTH = 16;'),
 ('B-O6-MAX_DEPTH-33', 'be-fb', H, 'doc', 'const MAX_DEPTH = 32;', 'const MAX_DEPTH = 33;'),
 ('B-O5-MAX_NAME-60', 'be-fb', C, 'doc', 'const MAX_NAME_CODE_POINTS = 120;', 'const MAX_NAME_CODE_POINTS = 60;'),
 ('B-O4-GIF-sig-no-87a', 'be-fb', H, 'doc', '/^GIF8[79]a$/', '/^GIF8[9]a$/'),
]
def run_set(s):
    p = subprocess.run(['pnpm', 'exec', 'vitest', 'run', *SETS[s]], capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr
def summ(out):
    t = [l.strip() for l in out.splitlines() if re.match(r'^\s+Tests\s', l)]
    return t[-1] if t else ''
os.makedirs(OUT + '/logs', exist_ok=True)
rows = []
if 'base' in only:
    for s in SETS:
        rc, out = run_set(s); open(f'{OUT}/logs/BASE-{s}.log', 'w').write(out)
        print(f'BASE {s}: rc={rc} {summ(out)}', flush=True)
    sys.exit(0)
for mid, grp, f, s, old, new in M:
    if only and mid not in only: continue
    src = open(f, encoding='utf8').read()
    n = src.count(old)
    if n != 1:
        print(f'{mid}: N/A (pattern found {n}x)', flush=True); rows.append([mid, grp, f, s, 'N/A', f'pattern {n}x', '']); continue
    shutil.copyfile(f, f + '.mutbak')
    try:
        open(f, 'w', encoding='utf8').write(src.replace(old, new))
        rc, out = run_set(s)
    finally:
        shutil.move(f + '.mutbak', f)
    clean = subprocess.run(['git', 'diff', '--quiet', '--', f]).returncode == 0
    open(f'{OUT}/logs/{mid}.log', 'w').write(f'# {mid} [{grp}] {f}\n# - {old!r}\n# + {new!r}\n# restored_clean={clean}\n' + out)
    fails = [l.strip()[:150] for l in out.splitlines() if re.match(r'^\s+(×|FAIL)\s', l)][:3]
    st = 'KILLED' if rc != 0 else 'SURVIVED'
    print(f'{mid:30s} {st:8s} rc={rc} {summ(out)} restored_clean={clean} | {" | ".join(fails)}', flush=True)
    rows.append([mid, grp, f, s, st, summ(out), ' | '.join(fails)])
    if not clean: print('RESTORE FAILED'); sys.exit(2)
name = os.environ.get('CSV', 'mutants.csv')
with open(f'{OUT}/{name}', 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['mutant', 'group', 'file', 'suite', 'status', 'tests', 'first_failures']); w.writerows(rows)
