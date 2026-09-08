---
name: fabrika-no-route-level-platform-admin-gate
description: Fabrika'da kiracı-üstü API rotalarını koruyacak kapı yok — middleware.ts hiç yok ve requirePlatformAdmin yalnız server action sürümü; her yeni admin rotasında bu boşluk tekrar eder
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTSXG31NGW48D (belge yükleme rotasında yetki yok) kartını delege etmeden önce
ölçtüm. Kartın premisi "rotada kontrol yok" idi; gerçek bundan bir tık kötü çıktı:

- Depoda **`middleware.ts` hiç yok** (`find . -maxdepth 3 -name middleware.ts` boş) → hiçbir
  `/api/**` rotasının önünde ortak bir kimlik/yetki kapısı yok. Rota kendi kapısını kurmazsa
  kimliği doğrulanmamış istek doğrudan handler'a düşer.
- `src/lib/tenant.ts` asimetrik: kiracı işi için hem sayfa (`requireTenant…`) hem **rota**
  sürümü (`requireTenantApi`, throw etmez, `NextResponse` döner) var. Platform-admin tarafında
  ise yalnız **server action** sürümü var (`requirePlatformAdmin`, throw eder) + saf yardımcı
  `isPlatformAdminSession`. Rota sürümü (`requirePlatformAdminApi`) **yok**.

Sonuç: `tenantId: null` yazan (paylaşılan/kamusal korpus, kiracı-üstü admin) her yeni API rotası
bu boşluğu yeniden üretmeye adaydır — çünkü kopyalanacak hazır bir kapı yok, geliştirici de
"admin klasöründe, korunuyordur" diye varsayıyor. Yeni bir `src/app/api/admin/**` rotası gördüğümde
ilk sorum: kapıyı kendisi mi kuruyor?

Lider dersi: güvenlik kartını delege etmeden ÖNCE kapının nerede OLMASI gerektiğini kendim ölç —
kart "şu dosyada kontrol yok" der ama asıl haber "hiçbir yerde kontrol yok" olabilir; worker'a
"yeniden yazma, VAR OLAN yardımcıyı çağır" demek ancak var olanı bilirsem mümkün.
Bkz. [[fabrika-blocked-card-premise-may-hide-the-real-blocker]] (aynı kalıp, ters yön) ve
[[fabrika-split-a-sequenced-card-at-its-file-boundary]] (bu turda iki P1'i dosya sınırından
paralelleştirdim: rota+tenant.ts ↔ llm.ts+rag.ts).
