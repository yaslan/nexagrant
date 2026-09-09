---
name: fabrika-tenantid-sweep-residue-m6-overload-and-checkout
description: Depo geneli tenantId-filtre-düşürme süpürmesi bitti (TASK-MTUH7CF87SGRR) — canlı 4 satır kaldı ve ikisi de HENÜZ DÜZELTİLMEDİ: m6/scoring.ts'in 2-argümanlı aşırı yüklemesi ve checkout rotasının 'default-tenant' fallback'i
metadata:
  type: project
  updatedAt: 2026-09-09
---

2026-09-09, TASK-MTUH7CF87SGRR: `tenantId ? {…} : {}` hata sınıfı (filtreyi daraltmak yerine
KALDIRAN dal) depo genelinde sayıldı. Rapor:
`docs/agent-results/TASK-MTUH7CF87SGRR-blok-zincir-denet-i.md`. **Salt okunurdu — hiçbiri düzeltilmedi.**

## Kalan 2 iş (kart açılmayı bekliyor)

**1. `src/modules/m6/server/scoring.ts:401, 451, 544`** — üç iç fonksiyon `tenantId` yoksa kiracı
koşulunu `where`'den tamamen düşürüyor ve **global `prisma`** üzerinde koşuyor:
```
:385  return calculateCriterionAverageInternal(prisma as unknown as TenantScopedDb, criterionId);
```
Bu dal **2-argümanlı aşırı yüklemeden** geliyor (`calculateCriterionAverage(criterionId)`).
Aynı yapı `calculateEvaluationScore` (`:432-434`) ve `getScoreDistribution` (`:524-526`) için de var.
**Bugün tetiklenemez** — `src/` altında tek üretim çağıranı yok, testler 3-argümanlı biçimi kullanıyor.
Ama imza iki argümanlı çağrıyı davet ediyor ve `typecheck` uyarmaz.
**En ucuz kalıcı düzeltme: 2-argümanlı aşırı yüklemeyi SİL** — o zaman kiracısız çağrı derlenmez.

**2. `src/app/api/billing/checkout/route.ts:84`** — `session?.tenantId || 'default-tenant'` ve
**rotada hiç oturum kapısı yok** (`401`/`Unauthorized`/`requireTenantApi` grep'i sıfır eşleşme).
Sızıntı DEĞİL: `'default-tenant'` depoda başka hiçbir yerde yok (seed dahil), ve webhook
`lifetime-licence.ts:166-167` bilinmeyen kiracıyı fırlatarak reddediyor. **Gerçek risk:** anonim
biri Stripe Checkout Session açabiliyor; ödense bile webhook 500 verip Stripe'ı retry'a sokar →
kaydedilemeyen tahsilat + kimliksiz maliyet yüzeyi. Düzeltme: fallback'i kaldır, `requireTenantApi` koy.

## Süpürmenin kapsamı (tekrar etme)

7 desen koşuldu; en önemlisi ikisi: doğrudan `where: tenantId ? {…} : {…}` **ve** spread hâli
`...(tenantId ? {…} : {})`. **Doğrudan-atama sınıfında (Prisma `undefined` alanı yazılmamış sayar)
tek bir canlı bulgu çıkmadı** — `where` içinde çıplak `tenantId,` kullanan her üretim dosyasında
kaynak ya `requireTenant*`/`scope` (garanti `string`) ya da hemen üstünde `if (!tenantId) → reddet`.
`where: {}` deseni depoda hiç yok.

**Bilinçli yolu sızıntı sayma:** `OR: [{ tenantId: null }, { tenantId }]` (concept-notes/data.ts:48)
ve anonim vitrin yolları (billing/quote, pricing, storefront) filtreyi KALDIRMAZ, paylaşımlı/genel
kümeye DARALTIR — doğru davranış.

**Yeni bağlam:** `src/lib/db.ts:140` — `withTenantOn` artık `assertTenantScope` çağırıyor, yani
`withTenant`'tan geçen bir çağrı boş kiracıda sessizce genişlemez, **fırlatır**. Risk triyajında bu
ayrı bir sütun: m6'nın kiracılı dalı `withTenant` içinde (güvenli), kiracısız dalı değil.

İlgili: [[fabrika-tenantid-ternary-fallback-bug-class]] ·
[[fabrika-tenant-isolation-real-defense-is-app-level-where]] · [[fabrika-main-db-connection-bypasses-rls]]
