import subprocess, sys, os
W = os.environ['WT']
ST='src/lib/storage.ts'; AC='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
DL='src/app/api/evidence/[id]/download/route.ts'; MK='src/app/api/evidence/mock-upload/route.ts'
M = [
 ('M1 content-length not signed', ST, "signableHeaders: new Set(['content-type', 'content-length'])", "signableHeaders: new Set(['content-type'])"),
 ('M1b content-type not signed', ST, "signableHeaders: new Set(['content-type', 'content-length'])", "signableHeaders: new Set(['content-length'])"),
 ('M1c ContentLength not in PUT command', ST, "    ContentType: contentType,\n    ContentLength: sizeBytes,", "    ContentType: contentType,"),
 ('M2 ContentType not in PUT command', ST, "    ContentType: contentType,\n    ContentLength: sizeBytes,", "    ContentLength: sizeBytes,"),
 ('M3 stored content type not compared', ST, "if (stored.contentType !== null && stored.contentType !== entry.mime) return", "if (false) return"),
 ('M4 magic not checked', ST, "if (!entry.magic(stored.head)) return", "if (false) return"),
 ('M5 stored size limit dropped', ST, "if (stored.size > EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };\n  if (stored.contentType", "if (stored.contentType"),
 ('M6 refused object not deleted', AC, "    await deleteObjectBytes(objectKey);\n", ""),
 ('M7 row size from browser', AC, "fileSizeBytes: stored.size,", "fileSizeBytes: data.fileSizeBytes,"),
 ('M8 download skips tenant prefix', DL, "row?.r2ObjectKey ? tenantObjectKeyOf(tenantId, row.r2ObjectKey) : null", "row?.r2ObjectKey ?? null"),
 ('M9 no attachment disposition', ST, "    ResponseContentDisposition: `attachment; filename=\"${safeName}\"`,\n", ""),
 ('M10 download TTL 3600', ST, "return getSignedUrl(s3, command, { expiresIn: 300 });", "return getSignedUrl(s3, command, { expiresIn: 3600 });"),
 ('M11 mock-upload open in prod/with store', MK, "if (hasObjectStore || env.NODE_ENV === 'production') {", "if (false) {"),
 ('M12 mock-upload no tenant key check', MK, "if (!key || key !== requested) return", "if (!requested) return"),
 ('M13 mock-upload no role check', MK, "if (!can(asRole(auth.scope.role), 'edit_proposal')) {", "if (false) {"),
 ('M14 limit exclusive (>=)', ST, "if (sizeBytes > EVIDENCE_MAX_BYTES) return", "if (sizeBytes >= EVIDENCE_MAX_BYTES) return"),
 ('M15 declared mime not compared', ST, "if (!entry || entry.mime !== mimeType) return", "if (!entry) return"),
 ('M16 dev download serves inline w/o sandbox', DL, "      'Content-Disposition': `attachment; filename=\"${safeName}\"`,\n      'Content-Security-Policy': \"default-src 'none'; sandbox\",\n", ""),
 ('M17 statObject drops stored content type', ST, "contentType: meta.ContentType ?? null, head", "contentType: null, head"),
 ('M18 FormData path skips byte check', ST, "if (!storedEvidenceMatches(objectKey, { size: bytes.length, contentType: allowed.contentType, head: bytes.subarray(0, 16) }).ok) {", "if (false) {"),
 ('M19 download no session', DL, "  const auth = await requireTenantApi();\n  if (!auth.ok) return auth.response;\n  const { tenantId } = auth.scope;", "  const auth = await requireTenantApi().catch(() => ({ ok: true, scope: { tenantId: 'x' } }) as any);\n  const { tenantId } = auth.ok ? auth.scope : { tenantId: 'x' };"),
 ('M20 checksum default back', ST, "  requestChecksumCalculation: 'WHEN_REQUIRED',\n", ""),
 ('M21 download row by id only (no tenantId in where)', DL, "where: { id, tenantId }", "where: { id }"),
 ('M22 confirm accepts URL form of own key', AC, "if (!objectKey || objectKey !== data.objectKey) {", "if (!objectKey) {"),
]
TESTS = ['tests/evidence-upload-s3.live.test.ts','tests/evidence-object-key.live.test.ts','tests/storage-public-url.test.ts','tests/server-action-rbac.test.ts']
only = sys.argv[1:] 
for name, f, a, b in M:
    if only and name.split()[0] not in only: continue
    p = os.path.join(W, f); src = open(p).read()
    if src.count(a) != 1: print(f'{name:50s} ANCHOR-MISS ({src.count(a)})', flush=True); continue
    open(p, 'w').write(src.replace(a, b))
    r = subprocess.run(['npx','vitest','run',*TESTS], cwd=W, capture_output=True, text=True, timeout=900)
    open(p, 'w').write(src)
    out = r.stdout + r.stderr
    tl = [l for l in out.splitlines() if l.strip().startswith('Tests ')]
    print(f'{name:50s} rc={r.returncode} {"KILLED" if r.returncode else "SURVIVED"}  {tl[-1].strip() if tl else ""}', flush=True)
