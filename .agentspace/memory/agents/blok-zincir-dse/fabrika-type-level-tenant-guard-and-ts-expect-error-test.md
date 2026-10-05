---
name: fabrika-type-level-tenant-guard-and-ts-expect-error-test
description: Fabrika'da opsiyonel tenantId taşıyan bir aşırı yükleme bug sınıfıdır — parametreyi zorunlu yap + assertTenantScope koy, ve "artık derlenmiyor"u @ts-expect-error ile teste yaz (tsconfig **/*.ts içerdiği için pnpm typecheck bunu zorlar)
metadata:
  type: project
updatedAt: 2026-09-09
---

Bir yükleyicinin imzası `tenantId?: string` ise ve gövdede `...(tenantId ? { … } : {})` varsa, kiracı
koşulu **daralmıyor, düşüyor**. Fabrika'da bu üçlü ifade + global `prisma` birleşimi tam bir sızıntı reçetesi
(ana bağlantı RLS'i uygulamayan bir rolle bağlanıyor). Üretimde çağıranı olmaması sorunu küçültmez: asıl
kusur imzanın kiracısız çağrıyı **meşru göstermesi** — `pnpm typecheck` yeşil kalır, bir sonraki geliştirici
hiçbir uyarı almaz.

Düzeltme reçetesi (TASK-MTUIPYSSNLVWG, `src/modules/m6/server/scoring.ts`):
1. Aşırı yüklemede `tenantId?: string` → `tenantId: string` (kiracısız çağrı **derlenmesin**).
2. Kiracısız dalı sil; iç fonksiyonda da `tenantId: string` yap, `where`'i koşulsuz yaz.
3. Çalışma zamanı için deponun kendi guard'ı: `assertTenantScope(tenantId, '<fn adı>')` (`src/lib/db.ts`) —
   `''`/`'   '`/`null`'ı da eler, `MissingTenantScopeError` + `code:'TENANT_SCOPE_REQUIRED'` fırlatır. İkinci
   bir desen icat etme.

"Artık mümkün değil"i NASIL test edersin: `tsconfig.json` `include: ["**/*.ts"]` — yani **testler de
typecheck ediliyor**. Hiç çağrılmayan bir arrow function gövdesine kiracısız çağrıları koy ve her birine
`// @ts-expect-error <açıklama>` yaz. Parametre tekrar opsiyonel olursa TS2578 ("Unused '@ts-expect-error'
directive") ile `pnpm typecheck` kırmızıya döner — derleme zamanı regresyon testi. Açıklama şart:
`ban-ts-comment` `ts-expect-error`'a yalnız açıklamalıysa izin verir (`@ts-ignore` CLAUDE.md'de yasak).
Yanına çalışma zamanı katmanını da koy: `as unknown as` cast ile boş kiracı geçir, `rejects` + "hiç sorgu
yapılmadı" (`expect(db.x.findMany).not.toHaveBeenCalled()`) iddiası.

Mutasyonla doğrula: `git checkout -- <dosya>` ile eski imzayı geri koy → typecheck TS2578 vermeli **ve**
çalışma zamanı testleri kırmızı olmalı; kiracılı davranış testleri ise mutasyon altında YEŞİL kalmalı
(yoksa suite "her şeyi reddet" diyerek geçiyordur).

Kalan boşluk (dürüstçe yaz): `assertTenantScope` bir kiracı ADI ister, verilen `db`'nin gerçekten
kapsanmış bir tx olduğunu doğrulamaz — `TenantScopedDb` yapısal bir tip, `prisma` da onu tatmin eder.

İlgili: [[fabrika-api-route-session-gate-is-requiretenantapi]] · [[fabrika-verification-recipe-mutation-and-counterfactual]]
