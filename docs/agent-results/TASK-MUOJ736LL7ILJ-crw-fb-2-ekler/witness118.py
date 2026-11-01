# İNCELEME-118: yaşayan mutantlar için cs-fb'nin test girdisi ile ayırt edici girdiyi orijinal ve mutant tarayıcıda karşılaştırır.
import subprocess, json, os, sys
S = sys.argv[1]; P = os.path.join(S, 'wt-m/tests/api/action-leak-scan.ts')
orig = open(P, encoding='utf8').read()
exec(open(os.path.join(S, 'ekler/mutants118.py')).read().split('def run')[0].split("M = [",1)[0].replace("orig = open(P, encoding='utf8').read()", ""))
M = {
 'A1': ("        if (load !== undefined) return load !== null;\n        const h = rejectionHandler(n);", "        if (load !== undefined) return false;\n        const h = rejectionHandler(n);"),
 'A4': ("          if (method === 'apply') writeArg(args[1]);\n        } else if", "        } else if"),
 'A10': ("      if (load !== undefined) t = { file: load };\n      else if", "      if (false) t = { file: load! };\n      else if"),
}
CATCH = "export async function run() { try { await go(); return 'ok'; } catch (e) { return String(e); } }\n"
FILL = "export function fill(o: Record<string, unknown>, x: unknown) { o.detail = String(x); }\n"
C = [
 ('A1', 'cs-fb testi: const m = await import(); return { svc: m }', "try { await go(id); return { ok: true }; } catch (e) { const m = await import('@/lib/svc'); return { svc: m }; }", '', {'src/lib/svc.ts': "export async function run() { try { await go(); } catch (e) { return String(e); } }\n"}),
 ('A1', 'ayırt edici: return { m: await import(…) } doğrudan', "return { m: await import('@/lib/svc') };", '', {'src/lib/svc.ts': CATCH}),
 ('A4', 'ayırt edici: Reflect.apply(setCode, e, []) sonra e.code', "try { await go(id); return { ok: true }; } catch (e: any) { Reflect.apply(setCode, e, []); return { code: e.code }; }", "function setCode(this: any) { this.code = String(this.message); }", {}),
 ('A10', 'cs-fb testi: const svc = await import(); svc.fill(out, e)', "const out: Record<string, unknown> = { ok: false };\ntry { await go(id); } catch (e) { const svc = await import('@/lib/svc'); svc.fill(out, e); }\nreturn out;", '', {'src/lib/svc.ts': FILL}),
 ('A10', 'ayırt edici: (await import()).fill(out, e)', "const out: Record<string, unknown> = { ok: false };\ntry { await go(id); } catch (e) { (await import('@/lib/svc')).fill(out, e); }\nreturn out;", '', {'src/lib/svc.ts': FILL}),
]
for k, desc, body, imp, mods in C:
    a, b = M[k]; assert orig.count(a) == 1
    res = []
    for tag, text in (('orijinal', orig), ('mutant', orig.replace(a, b))):
        open(os.path.join(S, 'mut/_mut.ts'), 'w').write(text)
        src = "'use server';\n" + imp + "\nexport async function act(id: string) {\n" + body + "\n}\n"
        js = "import { actionReturnLeaks, mapModuleReader } from './_mut.ts';\nconsole.log(JSON.stringify(actionReturnLeaks(" + json.dumps(src) + ", 'src/modules/m8/server/actions.ts', mapModuleReader(" + json.dumps(mods) + "))));\n"
        open(os.path.join(S, 'mut/_w.mts'), 'w').write(js)
        r = subprocess.run(['npx', 'tsx', os.path.join(S, 'mut/_w.mts')], capture_output=True, text=True, cwd=os.path.join(S, 'wt-m'))
        res.append(f"{tag}={r.stdout.strip() or r.stderr.strip()[-100:]}")
    print(f"{k:4} | {desc} | {' · '.join(res)}")
