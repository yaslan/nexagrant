# cs-fb İNCELEME-90 mutantları: her biri tek değişiklik, 3 test dosyasına karşı; sonra geri alınır.
import subprocess, sys, re
W = sys.argv[1]
A = 'src/app/[locale]/(app)/[workspace]/pipeline/actions.ts'
D = 'src/lib/db-unavailable.ts'
WS = 'src/lib/workspaces.ts'
P = 'src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx'
TESTS = ['tests/workspace-scoped-writes.test.ts', 'tests/db-unavailable.test.ts', 'tests/call-topic-route.test.ts']
M = [
 ('K1 findScoped: slug!==null → truthy ("" = en eski)', WS, "if (slug !== null) {", "if (slug) {"),
 ('K2 başlık boşluk-kontrolü yok', A, "title: text(500).refine((v) => v.trim().length > 0),", "title: text(500),"),
 ('K3 text(): NUL serbest (\\u0001\'den başla)', A, "/^[^\\u0000-\\u0008", "/^[^\\u0001-\\u0008"),
 ('K4 zod slug dilbilgisi yok (yalnız findScoped kalkanı)', A, "workspaceSlug: z.string().refine(isWorkspaceSlug),", "workspaceSlug: z.string(),"),
 ('K5 PrismaClientInitializationError sınıfı yok', D, "new Set(['PrismaClientInitializationError', 'PrismaClientRustPanicError'])", "new Set(['PrismaClientRustPanicError'])"),
 ('K6 sürücü mesajı geniş: /connection|timeout/i', D, "const DRIVER_MESSAGES = /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i;", "const DRIVER_MESSAGES = /connection|timeout/i;"),
 ('K7 PG kodu çapasız (^08 öneki, $ yok)', D, "/^08[0-9A-Z]{3}$|^57P0[123]$|^53300$/", "/^08|57P0[123]|53300/"),
 ('K8 AggregateError.errors gezinmesi yok', D, "return Array.isArray(errors) && errors.some((e) => isDatabaseUnavailable(e, depth + 1));", "return false;"),
 ('K9 ECONNRESET listeden çıktı', D, "  'ECONNRESET',\n", ""),
 ('K10 normalize NFC yok', WS, "decoded.normalize('NFC').toLowerCase()", "decoded.toLowerCase()"),
 ('K11 sayfa: normalize sonucu kullanılmıyor (ham segment)', P, "const scoped = await resolveScopedWorkspace(scope, requested);", "const scoped = await resolveScopedWorkspace(scope, workspace);"),
 ('K12 stage enum → serbest string', A, "stage: z.nativeEnum(Gate).optional(),", "stage: z.any().optional(),"),
 ('K13 text(): ESC (\\u001b) serbest', A, "\\u000e-\\u001f\\u007f]", "\\u000e-\\u001a\\u007f]"),
 ('K14 başlık üst sınırı 500 → 5000', A, "title: text(500)", "title: text(5000)"),
 ('K15 notlar üst sınırı yok', A, "notes: text(10_000).optional(),", "notes: z.string().optional(),"),
 ('K16 kesinti dalında da CREATE_FAILED yok: tampon hep', A, "    if (!isDatabaseUnavailable(err)) {", "    if (false) {"),
 ('K17 isWorkspaceSlug typeof kontrolü yok', WS, "typeof value === 'string' && value.length", "(value as string).length"),
 ('K18 derinlik sınırı yok (döngüsel cause)', D, " || depth > 4) return false;", ") return false;"),
]
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
for label, f, old, new in M:
    key = label.split()[0]
    if only and key not in only: continue
    path = f'{W}/{f}'; src = open(path, encoding='utf-8').read()
    if src.count(old) != 1: print(f'{label:58} | UYGULANAMADI (eşleşme {src.count(old)})', flush=True); continue
    open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', *TESTS], cwd=W, capture_output=True, text=True, timeout=600)
        out = r.stdout + r.stderr
        m = re.search(r'Tests\s+(\d+) failed', out)
        verdict = f'ÖLDÜ | Failed Tests {m.group(1)}' if m else ('ÖLDÜ (çökme)' if r.returncode else 'HAYATTA')
    finally:
        open(path, 'w', encoding='utf-8').write(src)
    print(f'{label:58} | {verdict}', flush=True)
