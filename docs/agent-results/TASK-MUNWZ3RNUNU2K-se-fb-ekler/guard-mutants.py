# se-fb İNCELEME-75: 5xx bekçisini (tests/api/api-error-body-guard.test.ts) kendi kalıplarıyla zorlar.
# Her mutant src/app/api/cordis/projects/route.ts:131'deki sabit 500 gövdesini değiştirir, bekçiyi koşar, git checkout ile geri alır.
import subprocess, pathlib
F = pathlib.Path('src/app/api/cordis/projects/route.ts')
ORIG = "    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });"
M = {
 'G1 `${error}` şablon': "    return NextResponse.json({ error: `failed: ${error}` }, { status: 500 });",
 'G2 JSON.stringify(error)': "    return NextResponse.json({ error: JSON.stringify(error) }, { status: 500 });",
 'G3 (error as Error).cause': "    return NextResponse.json({ error: (error as Error).cause }, { status: 500 });",
 'G4 (error as Error).stack': "    return NextResponse.json({ error: (error as Error).stack }, { status: 500 });",
 'G5 Response.json({error: e}) çıplak': "    return Response.json({ error }, { status: 500 });",
 'G6 {error: error} açık alan': "    return NextResponse.json({ error: error }, { status: 500 });",
 'G7 String(queryErr) listede olmayan ad': "    const queryErr = error; return NextResponse.json({ error: String(queryErr) }, { status: 500 });",
 'G8 error.toString()': "    return NextResponse.json({ error: (error as Error).toString() }, { status: 500 });",
 "G9 error['message'] köşeli": "    return NextResponse.json({ error: (error as Error)['message'] }, { status: 500 });",
 'G10 const {message}= destructure': "    const { message } = error as Error; return NextResponse.json({ error: message }, { status: 500 });",
 'G11 değişken status + .message': "    const status = 500; return NextResponse.json({ error: (error as Error).message }, { status });",
 'G12 gövde önce kurulur': "    const body = { error: (error as Error).message }; return NextResponse.json(body, { status: 500 });",
 "G13 string içinde ')' erken kapanış": "    return NextResponse.json({ hint: 'retry :)', error: (error as Error).message }, { status: 500 });",
 'G14 kontrol: .message (yakalanmalı)': "    return NextResponse.json({ error: (error as Error).message }, { status: 500 });",
}
src = F.read_text(); assert ORIG in src
for name, rep in M.items():
    F.write_text(src.replace(ORIG, rep))
    r = subprocess.run(['npx','vitest','run','tests/api/api-error-body-guard.test.ts'], capture_output=True, text=True)
    out = r.stdout + r.stderr
    print(f"{name}: {'KIRMIZI (yakalandı)' if r.returncode else 'YEŞİL (KAÇTI)'}")
    subprocess.run(['git','checkout','--',str(F)])
print('git status:', subprocess.run(['git','status','--porcelain','--untracked-files=no'],capture_output=True,text=True).stdout or 'temiz')
