"""İNCELEME-63 (se-fb, TASK-MUNRAS3B9WBY3): new mutants against the rewritten guard.
Each mutant is a NEW 'use server' file (so the guard's self-tests, which read evidence/actions.ts,
are not disturbed) — any red therefore comes from the real src scan. File is deleted after each run.
Expected: every N* mutant is a real bypass shape → the suite SHOULD go red. FP* are legitimate
shapes → ideally green (red = fail-closed false positive)."""
import subprocess, sys, pathlib
NEW = pathlib.Path("src/app/[locale]/(app)/[workspace]/evidence/i63-mut.ts")
HDR = ("'use server';\n\nimport { withTenant, prisma } from '@/lib/db';\n"
       "import { requireTenantAction } from '@/lib/tenant';\n")
CAN = "import { can } from '@/lib/rbac';\n"
WIPE = "  await withTenant(tenantId, (tx) => tx.evidence.deleteMany({ where: { id, tenantId } }));\n"
M = {
 "C0 positive control: plain write, no role check": HDR + "\nexport async function c0(id: string) {\n  const { tenantId } = await requireTenantAction();\n" + WIPE + "}\n",
 "C1 positive control: readOnly that writes": HDR + "\nexport async function c1(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n" + WIPE + "}\n",
 "N1 try/catch swallows the throwing check": HDR + "\nexport async function n1(id: string) {\n  const { tenantId } = await requireTenantAction();\n  try {\n    await requireTenantAction({ can: 'edit_proposal' });\n  } catch {\n    /* swallowed */\n  }\n" + WIPE + "}\n",
 "N2a check not awaited (void)": HDR + "\nexport async function n2(id: string) {\n  const { tenantId } = await requireTenantAction();\n  void requireTenantAction({ can: 'edit_proposal' });\n" + WIPE + "}\n",
 "N2b check rejection swallowed (.catch)": HDR + "\nexport async function n2b(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await requireTenantAction({ can: 'edit_proposal' }).catch(() => null);\n" + WIPE + "}\n",
 "N3a same-file `can` that always says yes": HDR + "\nconst can = (..._a: unknown[]) => true;\nexport async function n3(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  if (!can(role, 'edit_proposal')) return;\n" + WIPE + "}\n",
 "N3b same-file no-op requirePlatformAdmin": HDR + "\nfunction requirePlatformAdmin() {}\nexport async function n3b(id: string) {\n  const { tenantId } = await requireTenantAction();\n  requirePlatformAdmin();\n" + WIPE + "}\n",
 "N4 can() on a literal role, not the caller's": HDR + CAN + "\nexport async function n4(id: string) {\n  const { tenantId } = await requireTenantAction();\n  if (!can('TENANT_OWNER', 'edit_proposal')) return;\n" + WIPE + "}\n",
 "N5 helper that may return before its check": HDR + "\nasync function gate(skip: boolean) {\n  if (skip) return;\n  await requireTenantAction({ can: 'edit_proposal' });\n}\nexport async function n5(id: string) {\n  const { tenantId } = await requireTenantAction();\n  await gate(true);\n" + WIPE + "}\n",
 "N6 write in a default parameter (runs before the body)": HDR + "\nexport async function n6(id: string, _w = prisma.evidence.deleteMany({ where: { id } })) {\n  await requireTenantAction({ can: 'edit_proposal' });\n  return _w;\n}\n",
 "N7 readOnly writes via element access tx['evidence']": HDR + "\nexport async function n7(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, (tx) => tx['evidence'].deleteMany({ where: { id, tenantId } }));\n}\n",
 "N8 readOnly passes a same-file writer by reference": HDR + "\nconst wipeTx = (tx: typeof prisma) => tx.evidence.deleteMany({});\nexport async function n8(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  void id;\n  await withTenant(tenantId, wipeTx as never);\n}\n",
 "N9 readOnly writes via $queryRaw DELETE": HDR + "\nexport async function n9(id: string) {\n  await requireTenantAction({ readOnly: true });\n  await prisma.$queryRaw`DELETE FROM \"Evidence\" WHERE id = ${id} RETURNING id`;\n}\n",
 "N10 export const = wrapper(async …)": HDR + "\nconst wrap = <T,>(f: T): T => f;\nexport const n10 = wrap(async (id: string) => {\n  const { tenantId } = await requireTenantAction();\n" + WIPE + "});\n",
 "N11 anonymous export default async function": HDR + "\nexport default async function (id: string) {\n  const { tenantId } = await requireTenantAction();\n" + WIPE + "}\n",
 "N12 model accessor under another variable (documented)": HDR + "\nexport async function n12(id: string) {\n  const { tenantId } = await requireTenantAction({ readOnly: true });\n  await withTenant(tenantId, (tx) => {\n    const ev = tx.evidence;\n    return ev.deleteMany({ where: { id, tenantId } });\n  });\n}\n",
 "N13 check inside a short-circuited optional call": HDR + "\nconst skip = undefined as undefined | ((x: unknown) => void);\nexport async function n13(id: string) {\n  const { tenantId } = await requireTenantAction();\n  skip?.(await requireTenantAction({ can: 'edit_proposal' }));\n" + WIPE + "}\n",
 "N14 (G5b) cross-module write BEFORE the check, write action": HDR + CAN + "import { scoreCandidatesForSeat } from '@/lib/scoring/consortium';\n\nexport async function n14(opportunityId: string) {\n  const { tenantId, role } = await requireTenantAction();\n  await scoreCandidatesForSeat(opportunityId, tenantId as never);\n  if (!can(role as never, 'manage_workspaces')) return;\n}\n",
 # legitimate shapes: green is right, red is a fail-closed false positive
 "FP1 boolean kept in a variable": HDR + CAN + "\nexport async function fp1(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  const allowed = can(role as never, 'edit_proposal');\n  if (!allowed) return;\n" + WIPE + "}\n",
 "FP2 positive-form if (can) { write }": HDR + CAN + "\nexport async function fp2(id: string) {\n  const { tenantId, role } = await requireTenantAction();\n  if (can(role as never, 'edit_proposal')) {\n  " + WIPE + "  }\n}\n",
 "FP3 check inside try, write in same try": HDR + "\nexport async function fp3(id: string) {\n  try {\n    const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });\n  " + WIPE + "  } catch (e) {\n    return String(e);\n  }\n}\n",
}
def run():
    r = subprocess.run(["npx","vitest","run","tests/server-action-rbac-guard.test.ts","tests/server-action-rbac.test.ts","tests/use-server-exports.test.ts","--testTimeout=60000"],capture_output=True,text=True)
    out = r.stdout + r.stderr
    summ = [l.strip() for l in out.splitlines() if l.strip().startswith(("Tests ","Test Files"))]
    fails = sorted({l.strip() for l in out.splitlines() if l.strip().startswith("×")})
    probs = [l.strip() for l in out.splitlines() if "i63-mut.ts#" in l][:3]
    return r.returncode, summ, fails[:4], probs
only = sys.argv[1:]
for name, text in M.items():
    if only and not any(name.startswith(o + " ") for o in only): continue
    assert not NEW.exists(); NEW.write_text(text)
    try: rc, summ, fails, probs = run()
    finally: NEW.unlink()
    rbac_red = any("every write action checks" in f for f in fails)
    verdict = ("KIRMIZI (yakalandı)" if rc else "YEŞİL (sağ kaldı)") + (" [RBAC bekçisi]" if rbac_red else (" [başka test]" if rc else ""))
    print(f"### {name}: exit={rc} → {verdict} | {' | '.join(summ)}")
    for x in fails: print("    ", x[:200])
    for x in probs: print("    ", x[:260])
