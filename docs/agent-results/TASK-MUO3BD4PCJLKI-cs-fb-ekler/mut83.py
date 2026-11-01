import subprocess, sys, pathlib, json
W = pathlib.Path(sys.argv[1]); only = sys.argv[2:] 
TESTS = "tests/call-topic-route.test.ts tests/workspace-scoped-writes.test.ts tests/safe-callback-url.test.ts src/modules/m2/server/templates.test.ts tests/public-calls-links.test.ts tests/pilot-expired-action-message.test.tsx tests/pipeline-note-input-shape.test.ts tests/concept-template-tenant-scope.live.test.ts tests/pipeline-actions-pilot-digest.test.ts tests/server-action-rbac.test.ts tests/prompt-snapshots.test.ts".split()
WS = 'src/lib/workspaces.ts'; RT = 'src/app/[locale]/calls/topic/[id]/route.ts'; TG = 'src/app/[locale]/calls/topic/[id]/target.ts'
SC = 'src/lib/safe-callback-url.ts'; TP = 'src/modules/m2/server/templates.ts'; RO = 'src/lib/routes.ts'
AC = 'src/app/[locale]/(app)/[workspace]/pipeline/actions.ts'; PG = 'src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx'
M = [
 ('C1', WS, "const where = { tenantId: scope.tenantId, deletedAt: null, ...workspaceIdFilter(scope.workspaceIds) };", "const where = { deletedAt: null, ...workspaceIdFilter(scope.workspaceIds) };", 'findScopedWorkspace: tenantId filtresi yok (yalnız RLS kalır)'),
 ('C2', WS, "const exact = await tx.workspace.findFirst({ where: { ...where, slug }, select });", "const exact = await tx.workspace.findFirst({ where: { tenantId: scope.tenantId, slug }, select });", 'açık slug araması üyelik+deletedAt filtresini atlıyor'),
 ('C3', WS, "const exact = await tx.workspace.findFirst({ where: { ...where, slug }, select });", "const exact = await tx.workspace.findFirst({ where: { tenantId: scope.tenantId, deletedAt: null, slug }, select });", 'açık slug araması yalnız üyelik filtresini atlıyor'),
 ('C4', WS, "if (exact || slug !== WORKSPACE_ALIAS) return exact;", "return exact;", 'default takma adı çözülmüyor (tam eşleşme yoksa null)'),
 ('C5', WS, "orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]", "orderBy: [{ createdAt: 'asc' }]", 'eşit createdAt için id kırıcısı yok'),
 ('C6', RT, "res.headers.set('Cache-Control', 'private, no-store');", "", 'rota Cache-Control başlığını koymuyor'),
 ('C7', RT, "id.length > MAX_TOPIC_ID_LENGTH", "id.length > MAX_TOPIC_ID_LENGTH + 1000", 'uzun id sınırı gevşedi'),
 ('C8', TG, "return getWorkspaceRoute('callDetail', locale, visitor.workspaceSlug, encoded);", "return getWorkspaceRoute('callDetail', locale, visitor.workspaceSlug, id);", 'üye hedefinde id kodlanmıyor'),
 ('C9', TG, "?callbackUrl=${encodeURIComponent(publicCallDetailHref(locale, id))}", "?callbackUrl=${publicCallDetailHref(locale, id)}", 'girişsiz callbackUrl kodlanmıyor'),
 ('C10', RO, "return `/${locale}/calls/topic/${encodeURIComponent(identifier)}`;", "return `/${locale}/calls/topic/${identifier}`;", 'kart linkinde id kodlanmıyor'),
 ('C11', SC, "if (/[\\s\\u0000-\\u001f\\u007f\\\\]/.test(raw)) return fallback;", "if (/[\\u0000-\\u001f\\u007f\\\\]/.test(raw)) return fallback;", 'boşluk (\\s) kontrolü yok, kontrol karakteri kalıyor'),
 ('C12', SC, "if (/[\\s\\u0000-\\u001f\\u007f\\\\]/.test(raw)) return fallback;", "if (/[\\s\\u0000-\\u001f\\u007f]/.test(raw)) return fallback;", 'ters bölü regex kontrolü yok (/\\\\ ön-ek kontrolü kalıyor)'),
 ('C13', SC, " || raw.startsWith('/\\\\')", "", '/\\\\ ön-ek kontrolü yok (regex kalıyor)'),
 ('C14', SC, "if (parsed.origin !== base) return fallback;", "", 'origin kontrolü yok (crw-fb M18 tekrarı)'),
 ('C15', TP, "return typeof section.labelKey === 'string'", "return section.labelKey != null", 'labelKey string yerine null-değil kontrolü (nesne/sayı geçer)'),
 ('C16', TP, "({ ...section, labelKey: section.key } as ConceptTemplateSection)", "({ ...section, labelKey: '' } as ConceptTemplateSection)", 'geri düşüş başlığı key değil boş'),
 ('C17', AC, "findScopedWorkspace(tx, scope, workspaceSlug || null)", "findScopedWorkspace(tx, { ...scope, workspaceIds: [] }, workspaceSlug || null)", 'createOpportunity üyelik kısıtını yok sayıyor'),
 ('C18', PG, "if (!scoped) redirect(publicCallDetailHref(locale, id));", "if (!scoped) notFound();", 'detay: izinsiz slug rotaya değil 404e gidiyor'),
 ('C19', AC, "if (workspaceRefused) return WORKSPACE_REFUSED;", "if (workspaceRefused) return { success: false as const, error: 'WORKSPACE_NOT_FOUND' as const, opportunity: addInMemoryOpportunity(tenantId, newOpp) };", 'retde de tampona yazıyor (yanıt yine ret)'),
]
res = []
for mid, f, old, new, label in M:
    if only and mid not in only: continue
    p = W / f; src = p.read_text()
    if src.count(old) != 1: res.append((mid, 'UYGULANAMADI', label, src.count(old))); print(mid, 'UYGULANAMADI', src.count(old), flush=True); continue
    p.write_text(src.replace(old, new))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', *TESTS], cwd=W, capture_output=True, text=True, timeout=600)
        out = r.stdout + r.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith('×') or ' FAIL ' in l][:3]
        tsc = ''
        status = 'ÖLDÜ' if r.returncode != 0 else 'YAŞADI'
    finally:
        p.write_text(src)
    res.append((mid, status, label, failed[:2]))
    print(mid, status, label, '|', ' ; '.join(failed[:2])[:220], flush=True)
d = subprocess.run(['git', 'status', '--porcelain', '--', 'src', 'tests'], cwd=W, capture_output=True, text=True).stdout
print('geri yükleme kontrolü: src/tests değişen dosya =', len([l for l in d.splitlines() if l.strip()]))
