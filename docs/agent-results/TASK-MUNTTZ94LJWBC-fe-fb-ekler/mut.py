import subprocess, sys, os
A='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
D='src/app/api/evidence/[id]/download/route.ts'
M='src/app/api/evidence/mock-upload/route.ts'
S='src/lib/storage.ts'
X='src/lib/evidence-access.ts'
L='src/app/[locale]/(app)/[workspace]/evidence/data.ts'
TESTS=['tests/evidence-upload-s3.live.test.ts','tests/evidence-dev-store.live.test.ts','tests/evidence-mock-upload-gate.test.ts','tests/evidence-object-key.live.test.ts','tests/page-loader-tenant-scope.test.ts']
MUT=[
 ('Y1a download skips confidentiality check', D, "  if (!canReadEvidence(role, row.confidentiality)) return FORBIDDEN();\n", ""),
 ('Y1b download skips view_proposal gate (up front)', D, "  if (!evidenceReadWhere(role)) return FORBIDDEN();\n", ""),
 ('Y1c list without view_proposal', A, "requireTenantAction({ readOnly: true, can: EVIDENCE_READ_ACTION })", "requireTenantAction({ readOnly: true })"),
 ('Y1d list without level filter', A, "const whereClause: Record<string, unknown> = { tenantId, ...readable };", "const whereClause: Record<string, unknown> = { tenantId };"),
 ('Y1e deny-list instead of allow-list', X, "return !(OPEN_EVIDENCE_LEVELS as readonly string[]).includes(confidentiality ?? '');", "return ['CONFIDENTIAL', 'RESTRICTED'].includes(confidentiality ?? '');"),
 ('Y1f confidential needs only view_proposal', X, "export const EVIDENCE_CONFIDENTIAL_READ_ACTION: Action = 'edit_proposal';", "export const EVIDENCE_CONFIDENTIAL_READ_ACTION: Action = 'view_proposal';"),
 ('Y1g page loader without level filter', L, "where: { tenantId, ...readable },", "where: { tenantId },"),
 ('Y1h health score not filtered', A, "  if (!readable) return calculateEvidenceHealthScore([]);\n", ""),
 ('D1a presign hands out the final key', S, "const objectKey = incomingKeyOf(tenantId, generateR2ObjectKey(tenantId, organisationId, category, fileName));", "const objectKey = generateR2ObjectKey(tenantId, organisationId, category, fileName);"),
 ('D1b confirm accepts a final key', A, "if (!objectKey || objectKey !== data.objectKey || !finalKey) {", "if (!objectKey || objectKey !== data.objectKey) {"),
 ('D1c mock-upload accepts a final key', M, "if (!key || key !== requested || !finalKeyOfIncoming(auth.scope.tenantId, key)) {", "if (!key || key !== requested) {"),
 ('D1d staging object not removed after copy', S, "    await deleteFileFromR2(incomingKey);\n    return true;", "    return true;"),
 ('D1e verify the staging object, not the copy', A, "const stored = await statObject(finalKey);", "const stored = await statObject(objectKey);"),
 ('D1f refused copy not removed', A, "    if (promoted) await deleteObjectBytes(finalKey);\n", ""),
 ('D3a P2002 treated as DB outage', A, "if (errorCode(error) === 'P2002') {", "if (errorCode(error) === 'P2002-x') {"),
 ('D3b second staging object kept', A, "      await deleteObjectBytes(objectKey);\n      return { success: false as const, error: 'already_confirmed' as const };", "      return { success: false as const, error: 'already_confirmed' as const };"),
 ('M11 mock-upload open in prod', M, "if (hasObjectStore || env.NODE_ENV === 'production') {", "if (false) {"),
 ('M12 mock-upload no tenant key check', M, "const key = tenantObjectKeyOf(auth.scope.tenantId, requested);", "const key = requested;"),
 ('M13 mock-upload no role check', M, "if (!can(asRole(auth.scope.role), 'edit_proposal')) {", "if (false) {"),
 ('M14 limit exclusive', S, "if (sizeBytes > EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };", "if (sizeBytes >= EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };"),
 ('M16 dev download inline without sandbox', D, "'Content-Disposition': `attachment; filename=\"${safeName}\"`,\n      'Content-Security-Policy': \"default-src 'none'; sandbox\",", "'Content-Disposition': 'inline',"),
 ('M18 FormData path skips byte check', S, "  if (!storedEvidenceMatches(objectKey, { size: bytes.length, contentType: allowed.contentType, head: bytes.subarray(0, 16) }).ok) {\n    return null;\n  }\n", ""),
]
only=sys.argv[1:]
for name,f,old,new in MUT:
    if only and not any(name.startswith(o) for o in only): continue
    src=open(f).read()
    if src.count(old)!=1:
        print(f'{name}: PATTERN {src.count(old)}x — NOT APPLIED'); continue
    open(f,'w').write(src.replace(old,new))
    try:
        r=subprocess.run(['npx','vitest','run',*TESTS],capture_output=True,text=True,timeout=600)
        out=r.stdout+r.stderr
        line=[l for l in out.splitlines() if l.strip().startswith('Tests ')]
        failed=[l.strip() for l in out.splitlines() if l.strip().startswith('FAIL ')][:2]
        print(f"{name}: {'KILLED' if r.returncode!=0 else 'SURVIVED'} | {line[-1].strip() if line else '?'} | {failed}",flush=True)
    finally:
        open(f,'w').write(src)
