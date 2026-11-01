---
name: fabrika-tenant-scope-tests-need-no-db-and-two-guards
description: Kiracı sızıntısı düzeltmesi DB'siz birim testle kanıtlanır (loader'a istemci enjekte et); ama withTenantOn artık kendi guard'ını taşıdığı için mutasyon yaparken İKİ guard'ı da kaldırmazsan test sahte-kırmızı/sahte-yeşil okunur
metadata:
  type: project
  updatedAt: 2026-09-09
---

TASK-MTUGJTD5HZDW0'de öğrenildi. İki ayrı şey:

**1) Kiracı kapsamı DB olmadan kanıtlanır.** İddia "sorgu doğru satırları döndürüyor" değil,
"kiracısız hiçbir sorgu çıkmıyor + çıkan her sorgu kiracıyı taşıyor". İkisi de loader'a verilen
Prisma istemcisinden gözlenir. Reçete (`tests/page-loader-tenant-scope.test.ts`):
- Loader imzası `(tenantId: string, ..., client: PrismaClient = prisma)` — `client` yalnız test için var.
- `forbiddenClient()`: `$transaction` çağrılırsa sayaç artırıp fırlatır → `touched === 0` iddiası
  "veritabanına hiç dokunulmadı"ı ölçer, "boş sonuç döndü"yü değil.
- `recordingClient()`: `$transaction` callback'ine sahte `tx` verir, her `findMany/findFirst/findUnique`
  çağrısının `where` cümlesini kaydeder; `$executeRaw` set edilen `app.tenant_id` değerini yakalar.
- Kiracısız girdi kümesi HER ZAMAN dört tane: `undefined`, `null`, `''`, `'   '` — boş string ternary'de
  falsy ve `set_config('app.tenant_id','')` hiçbir RLS politikasıyla eşleşmez.
- Bu, DB'li kanıtın yerine geçmez ama tekrarını gerektirmez: Postgres'in `tenantId: undefined` ile başka
  kiracının satırını gerçekten döndürdüğü `tests/relationship-tenant-scope.test.ts:61-82`'de zaten kayıtlı.

**2) Artık İKİ guard var — mutasyon testinde ikisini birden kaldır.**
`src/lib/db.ts` içinde `assertTenantScope()` + `MissingTenantScopeError` var ve `withTenantOn` ilk satırda
onu çağırıyor (291 çağrı noktasının hepsini kapsar). Loader'lar ayrıca kendi başlarında çağırıyor.
Sonuç: bir loader'a eski `tenantId ? {tenantId} : {}` ternary'sini geri koyup SADECE loader'ın guard'ını
silersen test yine kırmızı olur — ama `MissingTenantScopeError` yerine `withTenantOn`'un fırlattığı hatayla,
yani mutasyonun gerçekten neyi kanıtladığını yanlış okursun. Kusuru dürüstçe geri koymak için
`withTenantOn`'daki `assertTenantScope` satırını da kaldır. Aynısı tersinden de geçerli: guard'lardan
yalnız birini silip testin yeşil kalmasına bakarak "test zayıf" hükmü verme.

İlgili: [[fabrika-undefined-tenantid-drops-the-where-clause]] · [[fabrika-tenant-isolation-real-defense-is-app-level-where]] ·
[[fabrika-verification-recipe-mutation-and-counterfactual]] · [[fabrika-main-db-connection-bypasses-rls]]
