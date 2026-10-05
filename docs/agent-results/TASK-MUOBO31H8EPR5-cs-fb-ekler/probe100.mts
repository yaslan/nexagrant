import { actionReturnLeaks } from '../../../tests/api/action-leak-scan.ts';
const A = (body: string, imports = '') => `'use server';\n${imports}\nexport async function act(id: string) {\n${body}\n}\n`;
const F = 'src/modules/m8/server/actions.ts';
// [id, açıklama, kaynak, beklenen: 'leak' (bekçi yakalamalı)]
const cases: [string, string, string][] = [
  // görevdeki listeler
  ['K1', 'try/finally içinde dönüş', A("let err: unknown;\ntry { await compute(id); } catch (e) { err = e; } finally { if (err) return { error: String(err) }; }\nreturn { ok: true };")],
  ['K2', 'Promise.allSettled reason', A("const [r] = await Promise.allSettled([compute(id)]);\nif (r.status === 'rejected') return { error: String(r.reason) };\nreturn { ok: true };")],
  ['K3', 'spread {...e}', A("try { await compute(id); return { ok: true }; } catch (e) { return { ok: false, ...(e as object) }; }")],
  ['K4', 'template literal ${e}', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: `failed: ${e}` }; }")],
  ['K5', 'JSON.stringify(e)', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: JSON.stringify(e) }; }")],
  ['K6', 'e.cause', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: (e as Error).cause }; }")],
  ['K7', 'e.stack', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: (e as Error).stack }; }")],
  ['K8', 'yardımcı (içe aktarılan) fonksiyon', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: fmt(e) }; }", "import { fmt } from '@/lib/fmt';")],
  ['K9', 'yeniden adlandırılmış import gölgeleme (errorMessage as errorCode)', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: errorCode(e) }; }", "import { errorMessage as errorCode } from '@/lib/errors';")],
  ['K10', 'yerel const errorCode = errorMessage (takma ad)', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: errorCode(e) }; }", "import { errorMessage } from '@/lib/errors';\nconst errorCode = errorMessage;")],
  // kendi yeni kaçış kalıplarım
  ['N1', 'kapanış (closure): ok fonksiyonu e yakalıyor, argümansız çağrı', A("try { await compute(id); return { ok: true }; } catch (e) { const why = () => String(e); return { error: why() }; }")],
  ['N2', 'IIFE', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: (() => (e as Error).message)() }; }")],
  ['N3', 'yerel fonksiyon dış değişkeni okuyor (argümansız)', "'use server';\nlet last: unknown;\nfunction why() { return String(last); }\nexport async function act(id: string) {\n  try { await compute(id); return { ok: true }; } catch (e) { last = e; return { error: why() }; }\n}\n"],
  ['N4', '.code aklama: kirli nesnenin .code alanı', A("try { await compute(id); return { ok: true }; } catch (e) { const box = { code: (e as Error).message }; return { error: box.code }; }")],
  ['N5', '.code aklama: e.message → { code } → .code', A("try { await compute(id); return { ok: true }; } catch (e) { const r = { code: String(e) }; return { ok: false, code: r.code }; }")],
  ['N6', 'takma ad (alias) mutasyonu', A("const out: Record<string, unknown> = { ok: false };\nconst alias = out;\ntry { await compute(id); } catch (e) { alias.detail = String(e); }\nreturn out;")],
  ['N7', 'iç nesne takma adı', A("const out = { ok: false, meta: {} as Record<string, unknown> };\nconst meta = out.meta;\ntry { await compute(id); } catch (e) { meta.detail = String(e); }\nreturn out;")],
  ['N8', 'Reflect.set', A("const out: Record<string, unknown> = { ok: false };\ntry { await compute(id); } catch (e) { Reflect.set(out, 'detail', String(e)); }\nreturn out;")],
  ['N9', 'Object.defineProperty', A("const out: Record<string, unknown> = { ok: false };\ntry { await compute(id); } catch (e) { Object.defineProperty(out, 'detail', { value: String(e), enumerable: true }); }\nreturn out;")],
  ['N10', 'Array.prototype.push.call', A("const errors: string[] = [];\ntry { await compute(id); } catch (e) { Array.prototype.push.call(errors, String(e)); }\nreturn { errors };")],
  ['N11', 'yardımcı çıktı nesnesini mutasyona uğratıyor', A("const out: Record<string, unknown> = { ok: false };\ntry { await compute(id); } catch (e) { fill(out, e); }\nreturn out;", "function fill(o: Record<string, unknown>, x: unknown) { o.detail = String(x); }")],
  ['N12', 'sınıf alanı new ile', A("try { await compute(id); return { ok: true }; } catch (e) { class R { detail = String(e); } return { ...new R() }; }")],
  ['N13', 'Map.set + Object.fromEntries', A("const m = new Map<string, string>();\ntry { await compute(id); } catch (e) { m.set('detail', String(e)); }\nreturn Object.fromEntries(m);")],
  ['N14', 'new Promise reject', A("const r = await new Promise<string>((resolve) => compute(id).then(() => resolve('ok'), (e) => resolve(String(e))));\nreturn { status: r };")],
  ['N15', 'try { return await } / catch içinde throw değil return e', A("try { return await compute(id); } catch (e) { return e as never; }")],
  ['N16', 'e.code ama e = { code: message } yeniden atanmış', A("try { await compute(id); return { ok: true }; } catch (e) { let x = e as { code: string }; x = { code: (e as Error).message }; return { code: x.code }; }")],
  ['N17', 'generator/yield', A("try { await compute(id); return { ok: true }; } catch (e) { const g = (function* () { yield String(e); })(); return { error: g.next().value }; }")],
  ['N18', 'catch değişkeni sonra errorCode ile temizlenir gibi, ?? e.message', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: errorCode(e) ?? (e as Error).message }; }", "import { errorCode } from '@/lib/errors';")],
  ['N19', 'Promise.reject yerine catch-param yok: .catch(e => ({ error: e.message })) sonucu döndür', A("return compute(id).catch((e: Error) => ({ ok: false, error: e.message }));")],
  ['N20', '.finally değil .then(null, h)', A("return compute(id).then(null, (e: Error) => ({ error: e.message }));")],
  ['N21', 'redirect URL sızıntısı (dönüş değil)', A("try { await compute(id); } catch (e) { redirect(`/x?err=${encodeURIComponent(String(e))}`); }\nreturn { ok: true };")],
  ['N22', 'çerez/flash sızıntısı', A("try { await compute(id); } catch (e) { (await cookies()).set('flash', String(e)); }\nreturn { ok: true };")],
  ['N23', 'sanitiser göreli yol ile doğru import', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: errorCode(e) }; }", "import { errorCode } from '../../../lib/errors';")],
  ['N24', 'e.code içinde prisma meta: e.meta', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: (e as any).meta?.target }; }")],
  ['N25', 'destructure { code: c, message } = e', A("try { await compute(id); return { ok: true }; } catch (e) { const { message: code } = e as Error; return { code }; }")],
  ['N26', 'e.code değil e?.code (optional chain)', A("try { await compute(id); return { ok: true }; } catch (e: any) { return { code: e?.code }; }")],
  ['N27', 'getter nesnesi', A("try { await compute(id); return { ok: true }; } catch (e) { const o = { get d() { return String(e); } }; return { error: o.d }; }")],
  ['N28', 'Object.entries(e) map', A("try { await compute(id); return { ok: true }; } catch (e) { return { error: Object.entries(e as object).map(([k, v]) => k + v) }; }")],
  ['N29', 'switch/for-in', A("const out: Record<string, unknown> = {};\ntry { await compute(id); } catch (e) { for (const k in e as object) out[k] = (e as any)[k]; }\nreturn out;")],
  ['N30', 'await Promise.all([p.catch(e=>e)])', A("const [r] = await Promise.all([compute(id).catch((e) => e)]);\nreturn { r: String(r) };")],
];
const rows = [];
for (const [id, d, src] of cases) {
  const t = performance.now();
  let res: number[] | string;
  try { res = actionReturnLeaks(src, F); } catch (err) { res = 'THROW ' + (err as Error).message; }
  const verdict = Array.isArray(res) ? (res.length ? 'YAKALADI' : 'KAÇTI') : res;
  console.log(`${id.padEnd(4)} ${verdict.padEnd(9)} ${JSON.stringify(res).padEnd(8)} ${d}`);
}
