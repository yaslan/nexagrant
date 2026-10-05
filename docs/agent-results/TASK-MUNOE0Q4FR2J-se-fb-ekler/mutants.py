import subprocess, sys, pathlib
EV = "src/app/[locale]/(app)/[workspace]/evidence/actions.ts"
PROF = "src/app/[locale]/(app)/[workspace]/settings/profile/actions.ts"
CONS = "src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts"
PORTAL = "src/app/[locale]/portal/partner/[token]/page.tsx"
NEW_TAIL = "\n"
M = {
 # a brand-new write action (the case the guard exists for) with a decoy `can` that decides nothing
 "G1 decoy can()": (EV, [("import { requireTenantAction } from '@/lib/tenant';",
   "import { requireTenantAction } from '@/lib/tenant';\nimport { can } from '@/lib/rbac';"),
   (None, "\nexport async function wipeEvidenceG1(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  console.debug(can(role as never, 'edit_proposal'));\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n")]),
 "G2 can: undefined": (EV, [(None, "\nexport async function wipeEvidenceG2(id: string) {\n  const { tenantId } = await requireTenantAction({ can: undefined as never });\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n")]),
 "G3 readOnly writes via (t)=>": (EV, [(None, "\nexport async function peekEvidenceG3(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, (t) => t.evidence.deleteMany({ where: { id, tenantId } }));\n}\n")]),
 "G4 readOnly writes via destructured client": (EV, [(None, "\nexport async function peekEvidenceG4(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, ({ evidence }) => evidence.deleteMany({ where: { id, tenantId } }));\n}\n")]),
 "G5 readOnly calls cross-module writer": (CONS, [("return await detectConflicts(opportunityId, tenantId);", "await scoreCandidatesForSeat(opportunityId, tenantId as never);\n    return await detectConflicts(opportunityId, tenantId);")]),
 "G6 role check AFTER the write": (PROF, [("    if (!can(asRole(scope.role), 'manage_users')) return { ok: false, error: 'forbidden' };\n", ""),
   ("      revalidatePath('/[locale]/(app)/[workspace]/settings/profile', 'layout');", "      if (!can(asRole(scope.role), 'manage_users')) return { ok: false as const, error: 'forbidden' as const };\n      revalidatePath('/[locale]/(app)/[workspace]/settings/profile', 'layout');")]),
 "G7 export {} of local fn": (EV, [(None, "\nasync function wipeEvidenceG7(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\nexport { wipeEvidenceG7 };\n")]),
 "G8 prisma under another name": (EV, [("import { withTenant } from '@/lib/db';", "import { withTenant, prisma as client } from '@/lib/db';"),
   (None, "\nexport async function peekEvidenceG8(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await client.evidence.deleteMany({ where: { id } });\n}\n")]),
 "G9 can spread from const": (EV, [(None, "\nconst WRITE = { can: 'edit_proposal' } as const;\nexport async function wipeEvidenceG9(id: string) {\n  const { tenantId } = await requireTenantAction({ ...WRITE, readOnly: false });\n  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n}\n")]),
 "G10 inline 'use server' in page": (PORTAL, None),
}
def run():
    r = subprocess.run(["npx","vitest","run","tests/server-action-rbac-guard.test.ts","tests/server-action-rbac.test.ts","tests/use-server-exports.test.ts"],capture_output=True,text=True)
    out = r.stdout + r.stderr
    summ = [l.strip() for l in out.splitlines() if l.strip().startswith(("Tests ","Test Files"))]
    fails = [l.strip() for l in out.splitlines() if "✗" in l or l.strip().startswith(("×","FAIL")) ]
    return r.returncode, summ, fails[:6]
only = sys.argv[1:] 
for name,(f,edits) in M.items():
    if only and not any(name.startswith(o+" ") for o in only): continue
    p = pathlib.Path(f); orig = p.read_text()
    src = orig
    if edits is None:
        # add a second inline server action to the partner portal page, no role/token check, that writes
        anchor = "            'use server';"
        assert anchor in src
        src = src.replace(anchor, anchor + "\n            await (await import('@/lib/db')).prisma.evidence.deleteMany({ where: { id: String(formData.get('x')) } });", 1)
    else:
        for old,new in edits:
            if old is None: src = src + new
            else:
                assert old in src, (name, old[:60]); src = src.replace(old,new,1)
    p.write_text(src)
    try:
        rc, summ, fails = run()
    finally:
        p.write_text(orig)
    print(f"### {name}: exit={rc} {' | '.join(summ)}")
    for x in fails: print("    ", x[:220])
