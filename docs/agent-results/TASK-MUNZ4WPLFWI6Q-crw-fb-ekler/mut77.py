import subprocess, sys, os
W=os.path.dirname(os.path.abspath(__file__))+'/wt77'
A='src/app/[locale]/(app)/[workspace]/evidence/actions.ts'
MUT=[
 ('K7 RESTRICTED açık seviyeye eklenir','src/lib/evidence-access.ts',"['PUBLIC', 'CONSORTIUM', 'INTERNAL']","['PUBLIC', 'CONSORTIUM', 'INTERNAL', 'RESTRICTED']"),
 ('K8 seviye büyük/küçük harf duyarsız','src/lib/evidence-access.ts',"includes(confidentiality ?? '')","includes((confidentiality ?? '').toUpperCase())"),
 ('K9 kopya satırdan ÖNCE (D-3 sırası geri)',A,None,None),
 ('K13 page.tsx rolü yok sayar (herkes sahip gibi)','src/app/[locale]/(app)/[workspace]/evidence/page.tsx',"loadEvidenceItems(tenantId, role)","loadEvidenceItems(tenantId, 'TENANT_OWNER')"),
 ('K18 liste action view_proposal kapısı yok',A,"requireTenantAction({ readOnly: true, can: EVIDENCE_READ_ACTION })","requireTenantAction({ readOnly: true })"),
 ('K19 indirme confidentiality seçmez','src/app/api/evidence/[id]/download/route.ts',"fileName: true, confidentiality: true }","fileName: true }"),
 ('K20 finalKey iç içe incoming reddi (düzeltme önerisi, ters mutant)','src/lib/storage.ts',"segments[1] !== INCOMING_SEGMENT)","segments[1] !== INCOMING_SEGMENT || segments[2] === INCOMING_SEGMENT)"),
 ('K21 hata yolunda final kopya silinmez',A,"if (promoted) await deleteObjectBytes(finalKey);","/* no cleanup */"),
]
FILES=['tests/evidence-upload-s3.live.test.ts','tests/evidence-dev-store.live.test.ts','tests/evidence-mock-upload-gate.test.ts','tests/evidence-object-key.live.test.ts','tests/page-loader-tenant-scope.test.ts']
env=dict(os.environ, EVIDENCE_S3_TEST_ENDPOINT='http://127.0.0.1:59477', EVIDENCE_S3_TEST_ACCESS_KEY='<minio-user>', EVIDENCE_S3_TEST_SECRET_KEY='<minio-secret>', EVIDENCE_S3_TEST_BUCKET='crwfb77')
def k9(s):
    # move promote+stat+verdict before tx: emulate old order with unique index still present
    blk_start=s.index("      if (!(await promoteIncomingObject(objectKey, finalKey)))")
    blk_end=s.index("      await tx.evidence.updateMany(")
    blk=s[blk_start:blk_end]
    s=s[:blk_start]+s[blk_end:]
    anchor="    evidence = await withTenant(tenantId, async (tx) => {\n"
    return s.replace(anchor, blk.replace('throw new UploadRefused','throw new UploadRefused')+anchor,1)
for name,f,old,new in MUT:
    p=os.path.join(W,f); orig=open(p).read()
    try:
        if old is None: m=k9(orig)
        else:
            assert orig.count(old)==1,(name,orig.count(old)); m=orig.replace(old,new)
        open(p,'w').write(m)
        r=subprocess.run(['npx','vitest','run',*FILES],cwd=W,env=env,capture_output=True,text=True)
        out=r.stdout+r.stderr
        summ=[l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
        fails=[l.strip()[:150] for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('FAIL')][:4]
        print(f"{'KILLED ' if r.returncode else 'SURVIVED'} {name} :: {summ[-1] if summ else '?'}")
        for x in fails: print('     ',x)
    finally:
        open(p,'w').write(orig)
print('git diff clean:', subprocess.run(['git','status','--porcelain','src'],cwd=W,capture_output=True,text=True).stdout.strip()=='' )
