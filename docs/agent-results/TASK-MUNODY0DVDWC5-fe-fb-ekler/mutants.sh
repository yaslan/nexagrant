#!/bin/bash
cd "$(dirname "$0")/wtody"
source ../s3env.sh
ACT='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
DL='src/app/api/evidence/[id]/download/route.ts'
ST=src/lib/storage.ts
run() { id="$1"; f="$2"; o="$3"; n="$4"
  python3 ../mut.py "$f" "$o" "$n" || { echo "$id APPLY-FAIL"; return; }
  out=$(npx vitest run tests/evidence-upload-s3.live.test.ts 2>&1 | grep -E "^ +Tests ")
  echo "$id | $out"
  git checkout -q -- "$f"
}
run M1-no-signable-headers $ST "    signableHeaders: new Set(['content-type', 'content-length'])," ""
run M2-no-content-length $ST "    ContentLength: sizeBytes," ""
run M3-mime-ext-not-compared $ST "if (!entry || entry.mime !== mimeType) return" "if (!entry) return"
run M4-no-presign-size-limit $ST "  if (sizeBytes > EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };" ""
run M5-no-magic-sniff $ST "  if (!entry.magic(stored.head)) return { ok: false, error: 'unsupported_type' };" ""
run M6-no-stored-type-check $ST "  if (stored.contentType !== null && stored.contentType !== entry.mime) return { ok: false, error: 'unsupported_type' };" ""
run M7-no-stored-size-check $ST "  if (stored.size > EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };" ""
run M8-no-delete-on-refusal "$ACT" "    await deleteObjectBytes(objectKey);
" ""
run M9-client-claims-recorded "$ACT" "        fileSizeBytes: stored.size," "        fileSizeBytes: data.fileSizeBytes,"
run M10-confirm-skips-stat "$ACT" "  if (!stored) return { success: false as const, error: 'object_missing' as const };" "  if (!stored) return { success: true as const, evidence: null };"
run M11-default-checksums $ST "  requestChecksumCalculation: 'WHEN_REQUIRED'," ""
run M12-download-no-key-prefix "$DL" "const key = row?.r2ObjectKey ? tenantObjectKeyOf(tenantId, row.r2ObjectKey) : null;" "const key = row?.r2ObjectKey ?? null;"
run M13-download-inline "$ST" "    ResponseContentDisposition: \`attachment; filename=\"\${safeName}\"\`," ""
run M14-download-long-ttl "$ST" "  return getSignedUrl(s3, command, { expiresIn: 300 });" "  return getSignedUrl(s3, command, { expiresIn: 3600 });"
run M15-download-no-tenant-where "$DL" "where: { id, tenantId }" "where: { id }"
git status --short
