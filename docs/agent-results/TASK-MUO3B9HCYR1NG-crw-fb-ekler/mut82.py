import subprocess, glob
A='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
S='src/lib/storage.ts'
P='src/app/[locale]/(app)/[workspace]/evidence/page.tsx'
SUITES=sorted(glob.glob('tests/evidence-*.test.ts'))+['tests/evidence-form-file-clear.test.tsx']
M=[
 ('N1 404 de yeniden-denenebilir sayılır (storeFailure hep storage_unavailable)', S,
  "return status === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey' ? 'object_missing' : 'storage_unavailable';", "return 'storage_unavailable';"),
 ('N2 her depo hatası object_missing', S,
  "return status === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey' ? 'object_missing' : 'storage_unavailable';", "return 'object_missing';"),
 ('N3 satır kaydı hatasında staging silinir (veri kaybı)', A,
  "    console.warn(`[confirmEvidenceUploadAction] DB error: ${errorMessage(error)}`);\n    return { success: false as const, error: 'save_failed' as const };\n  }\n\n  // No claim",
  "    await deleteObjectBytes(objectKey);\n    console.warn(`[confirmEvidenceUploadAction] DB error: ${errorMessage(error)}`);\n    return { success: false as const, error: 'save_failed' as const };\n  }\n\n  // No claim"),
 ('N4 zaten-kayıtlı dalı staging silmez', A,
  "  if (recorded) {\n    await deleteObjectBytes(objectKey);", "  if (recorded) {"),
 ('N5 ön-kontrol DB hatası yutulur, kopyaya devam', A,
  "    console.warn(`[confirmEvidenceUploadAction] DB error: ${errorMessage(error)}`);\n    return { success: false as const, error: 'save_failed' as const };\n  }\n  if (recorded)",
  "    recorded = null;\n  }\n  if (recorded)"),
 ('N6 isFinalUploadRefusal her hatayı kalıcı sayar (depo hatasında staging silinir)', S,
  "  return error === 'unsupported_type' || error === 'file_too_large' || error === 'empty_file';", "  return error !== '';"),
 ('N7 anahtar biçimi ^ çapası yok', S,
  "const INCOMING_KEY_SHAPE = /^incoming", "const INCOMING_KEY_SHAPE = /incoming"),
 ('N8 final HEAD yalnız boyut (tür karşılaştırılmaz)', S,
  " || (copy.ContentType ?? checked.contentType) !== checked.contentType) {", ") {"),
 ('N9 dev deposu staging\'i taşır (rename, eski davranış)', S,
  "    await copyFile(from, partial);\n    await rename(partial, to);", "    void copyFile;\n    await rename(from, to);"),
 ('N10 P2002 (eşzamanlı) sahte başarı döner', A,
  "      await deleteObjectBytes(objectKey);\n      return { success: false as const, error: 'already_confirmed' as const };\n    }\n    // No success",
  "      await deleteObjectBytes(objectKey);\n      return { success: true as const, evidence: { id: 'x' } };\n    }\n    // No success"),
 ('N11 D-2 kısmi: yalnız MEMBER için rol yok sayılır', P,
  "loadEvidenceItems(tenantId, role)", "loadEvidenceItems(tenantId, role === 'MEMBER' ? 'TENANT_OWNER' : role)"),
 ('N12 ETag yoksa devam (kopya sabitlenmez)', S,
  "      if (!meta.ETag) return { ok: false, error: 'storage_unavailable' };\n      etag = meta.ETag;", "      etag = meta.ETag ?? '*';"),
 ('N13 dev .partial hatada silinmez', S,
  "    await rm(partial, { force: true }).catch(() => {});\n", "    void rm;\n"),
 ('N14 dev: kopya sonrası final doğrulaması yok', S,
  "  if (!copy || copy.size !== staged.size || !storedEvidenceMatches(finalKey, copy).ok) {", "  if (!copy) {"),
]
out=[]
for name,f,old,new in M:
    src=open(f).read()
    if src.count(old)!=1:
        out.append(f'NOAPPLY  {name}'); print(out[-1], flush=True); continue
    open(f,'w').write(src.replace(old,new))
    try:
        r=subprocess.run(['npx','vitest','run',*SUITES],capture_output=True,text=True,timeout=900)
        txt=r.stdout+r.stderr
        failed=[l.strip() for l in txt.splitlines() if l.strip().startswith('×')]
        line=[l for l in txt.splitlines() if 'Tests ' in l]
        status='KILLED  ' if r.returncode!=0 else 'SURVIVED'
        out.append(f"{status} {name}  ({line[-1].strip() if line else '?'})")
        for x in failed[:3]: out.append('           '+x[:150])
    finally:
        open(f,'w').write(src)
    print('\n'.join(out[-4:]), flush=True)
r=subprocess.run(['git','status','--short','src'],capture_output=True,text=True)
out.append('git status --short src after restore: ['+r.stdout.strip()+']')
open('../ekler/mutants.txt','w').write('\n'.join(out)+'\n')
