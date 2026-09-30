import subprocess, sys, os
W = sys.argv[1]
TESTS = ['tests/call-topic-route.test.ts','tests/safe-callback-url.test.ts','tests/workspace-scoped-writes.test.ts','tests/public-calls-links.test.ts','src/modules/m2/server/templates.test.ts']
WS='src/lib/workspaces.ts'; ACT='src/app/[locale]/(app)/[workspace]/pipeline/actions.ts'; TGT='src/app/[locale]/calls/topic/[id]/target.ts'
RT='src/app/[locale]/calls/topic/[id]/route.ts'; RTS='src/lib/routes.ts'; PG='src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx'
BTN='src/app/[locale]/(app)/[workspace]/calls/[id]/add-button.tsx'; TPL='src/modules/m2/server/templates.ts'; SCU='src/lib/safe-callback-url.ts'
AC='src/app/[locale]/login/AuthCard.tsx'; BRD='src/app/[locale]/(app)/[workspace]/pipeline/board.tsx'; CP='src/app/[locale]/calls/page.tsx'
ONLY = __import__('os').environ.get('ONLY')
M = [
 ('M1 deletedAt filtresi yok', WS, "deletedAt: null, ...workspaceIdFilter", "...workspaceIdFilter"),
 ('M2 üyelik filtresi yok', WS, ", ...workspaceIdFilter(scope.workspaceIds) };\n  const select", " };\n  const select"),
 ('M3 bilinmeyen slug ilk alana düşer', WS, "if (exact || slug !== WORKSPACE_ALIAS) return exact;", "if (exact) return exact;"),
 ('M4 orderBy yok', WS, ", orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });", " });"),
 ('M5 ret yerine bellek tamponu', ACT, "if (workspaceRefused) return WORKSPACE_REFUSED;", "if (workspaceRefused && false) return WORKSPACE_REFUSED;"),
 ('M6 slug yok sayılır', ACT, "findScopedWorkspace(tx, scope, workspaceSlug || null)", "findScopedWorkspace(tx, scope, null)"),
 ('M7 girişsiz dönüş default detaya', TGT, "encodeURIComponent(publicCallDetailHref(locale, id))", "encodeURIComponent(getWorkspaceRoute('callDetail', locale, 'default', encoded))"),
 ('M8 kiracısız → giriş', RT, "if (!scope) return { kind: 'no-workspace' };", "if (!scope) return { kind: 'signed-out' };"),
 ('M9 locale kontrolü yok', RT, "!(routing.locales as readonly string[]).includes(locale) || ", ""),
 ('M10 alan yok → default', RT, ": { kind: 'no-workspace' };\n}", ": { kind: 'member', workspaceSlug: 'default' };\n}"),
 ('M11 kart linki /default/', RTS, "return `/${locale}/calls/topic/${encodeURIComponent(identifier)}`;", "return getWorkspaceRoute('callDetail', locale, 'default', encodeURIComponent(identifier));"),
 ('M12 detay: slug eşleşmezse yönlendirme yok', PG, "if (scoped.slug !== workspace) {", "if (false) {"),
 ('M13 detay: kontrol tamamen yok', PG, "const scoped = await resolveScopedWorkspace(scope, workspace);", "const scoped = { id: workspace, slug: workspace };"),
 ('M14 buton reddi yok sayar', BTN, "if (!res.success) {", "if (false) {"),
 ('M15 labelKey geri düşüşü yok', TPL, "typeof section.labelKey === 'string'\n    ?", "true\n    ?"),
 ('M16 safeCallbackUrl // son kontrol yok', SCU, "return path.startsWith('//') ? fallback : path;", "return path;"),
 ('M17 safeCallbackUrl boşluk kontrolü yok', SCU, "if (/[\\s\\u0000-\\u001f\\u007f\\\\]/.test(raw)) return fallback;", ""),
 ('M18 safeCallbackUrl origin kontrolü yok', SCU, "if (parsed.origin !== base) return fallback;", ""),
 ('M19 AuthCard ham callbackUrl', AC, "safeCallbackUrl(searchParams.get('callbackUrl'), `/${locale}/default/dashboard`)", "searchParams.get('callbackUrl') || `/${locale}/default/dashboard`"),
 ('M20 board ret toast yok', BRD, "} else if (!res.success) {", "} else if (false) {"),
 ('M21 liste sayfası auth() geri', CP, "export default async function CallsPage({ params }: PageProps) {\n", "export default async function CallsPage({ params }: PageProps) {\n  const signedIn = Boolean((await auth())?.user);\n"),
 ('M22 safeCallbackUrl başta / şartı yok', SCU, "!raw.startsWith('/') || ", ""),
]
res=[]
for name, f, a, b in M:
    if ONLY and not any(name.startswith(o+' ') for o in ONLY.split(',')): continue
    p=os.path.join(W,f); s=open(p).read()
    if s.count(a)!=1: res.append(f'{name}: DESEN BULUNAMADI ({s.count(a)})'); continue
    open(p,'w').write(s.replace(a,b))
    try:
        r=subprocess.run(['npx','vitest','run',*TESTS],cwd=W,capture_output=True,text=True,timeout=300)
        out=r.stdout+r.stderr
        failed=[l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')]
        res.append(f"{name}: {'ÖLDÜ' if r.returncode!=0 else 'SAĞ'}  {failed[-1] if failed else ''}")
    finally:
        open(p,'w').write(s)
    print(res[-1], flush=True)
st=subprocess.run(['git','status','--short'],cwd=W,capture_output=True,text=True).stdout
print('git diff sonrası değişen dosya sayısı (mutant öncesiyle aynı olmalı):', len(st.splitlines()))
