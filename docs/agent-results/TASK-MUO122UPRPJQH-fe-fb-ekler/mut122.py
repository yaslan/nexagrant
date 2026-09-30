import subprocess, sys
A='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
S='src/lib/storage.ts'
P='src/app/[locale]/(app)/[workspace]/evidence/page.tsx'
E='src/lib/evidence-access.ts'
SUITES=['tests/evidence-confirm-store-faults.live.test.ts','tests/evidence-upload-s3.live.test.ts','tests/evidence-dev-store.live.test.ts','tests/evidence-incoming-key.test.ts','tests/evidence-mock-upload-gate.test.ts','tests/evidence-page-role.test.ts']
M=[
 ('M1 staging silinir, satırdan ÖNCE (eski sıra)', A, "  let evidence;\n  try {\n    // (tenantId", "  await deleteObjectBytes(objectKey);\n  let evidence;\n  try {\n    // (tenantId"),
 ('M2 DB hatasında sahte başarı geri', A, "    return { success: false as const, error: 'save_failed' as const };\n  }\n\n  // No claim", "    return { success: true as const, evidence: { id: `ev-${Date.now()}` } };\n  }\n\n  // No claim"),
 ('M3 CopySourceIfMatch yok', S, "        CopySourceIfMatch: etag,\n", ""),
 ('M4 önceden kayıtlı ön-kontrolü yok', A, "  if (recorded) {", "  if (recorded && false) {"),
 ('M5 kalıcı retde staging silinmez', A, "    if (isFinalUploadRefusal(copied.error)) await deleteObjectBytes(objectKey);", ""),
 ('M6 geçici hatada da staging silinir', A, "    if (isFinalUploadRefusal(copied.error)) await deleteObjectBytes(objectKey);", "    await deleteObjectBytes(objectKey);"),
 ('M7 D-1 org=incoming kontrolü yok', S, "if (!shape || shape[1] === INCOMING_SEGMENT) return null;", "if (!shape) return null;"),
 ('M8 D-1 eski gevşek biçim', S, "  const shape = INCOMING_KEY_SHAPE.exec(rest);\n  if (!shape || shape[1] === INCOMING_SEGMENT) return null;", "  if (!rest.startsWith('incoming/') || rest.split('/').length < 2) return null;"),
 ('M9 kopya sonrası final HEAD doğrulaması yok', S, "      const copy = await s3.send(new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: finalKey }));\n      if (copy.ContentLength !== checked.size || (copy.ContentType ?? checked.contentType) !== checked.contentType) {", "      const copy = { ContentLength: checked.size, ContentType: checked.contentType };\n      if (copy.ContentLength !== checked.size || (copy.ContentType ?? checked.contentType) !== checked.contentType) {"),
 ('M10 başarı sonrası staging silinmez', A, "  if (!(await deleteObjectBytes(objectKey))) {", "  if (false) {"),
 ('M11 page.tsx rolü yok sayar (K13)', P, "loadEvidenceItems(tenantId, role)", "loadEvidenceItems(tenantId, 'TENANT_OWNER')"),
 ('M12 seviye büyük/küçük harf duyarsız (K8)', E, "includes(confidentiality ?? '')", "includes((confidentiality ?? '').trim().toUpperCase())"),
 ('M13 kopya öncesi staging doğrulaması yok', S, "      if (!verdict.ok) return verdict;\n      checked", "      checked"),
]
out=[]
for name,f,old,new in M:
    src=open(f).read()
    if src.count(old)!=1:
        out.append(f'NOAPPLY  {name}'); print(out[-1], flush=True); continue
    open(f,'w').write(src.replace(old,new))
    try:
        r=subprocess.run(['npx','vitest','run',*SUITES],capture_output=True,text=True,env=None,timeout=900)
        txt=r.stdout+r.stderr
        failed=[l.strip() for l in txt.splitlines() if l.strip().startswith('×')]
        line=[l for l in txt.splitlines() if 'Tests ' in l]
        status='KILLED  ' if r.returncode!=0 else 'SURVIVED'
        out.append(f"{status} {name}  ({line[-1].strip() if line else '?'})")
        for x in failed[:4]: out.append('           '+x[:150])
    finally:
        open(f,'w').write(src)
    print('\n'.join(out[-5:]), flush=True)
r=subprocess.run(['git','status','--short','src'],capture_output=True,text=True)
out.append('git status src after restore:\n'+r.stdout)
open('../ekler/mutants.txt','w').write('\n'.join(out)+'\n')
