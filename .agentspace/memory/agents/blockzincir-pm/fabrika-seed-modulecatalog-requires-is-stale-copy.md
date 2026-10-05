---
name: fabrika-seed-modulecatalog-requires-is-stale-copy
description: prisma/seed.ts'teki yerel `modules` dizisinin `requires` alanı gerçek manifestodan (src/modules/<id>/manifest.ts) BAĞIMSIZ, elle yazılmış bir kopya — ikisi birbirinden sapabilir
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTRIXGYXLLQR1'de M6'yı Pro'ya açarken kontrol edilirken bulundu:
`prisma/seed.ts`'in başındaki `modules` dizisi (satır ~20-31), `ModuleCatalog`
tablosunu doldurmak için kullanılıyor ve M6 için `requires: ['M2', 'M11']`
yazıyor. Ama gerçek modül manifestosu (`src/modules/m6/manifest.ts`) `requires: []`
diyor — ve gerçek yetkilendirme (`canEnable`, `src/lib/modules/state-machine.ts`)
DAİMA manifestoyu okur, `ModuleCatalog` satırını değil.

**Neden önemli:** `PLAN_GRANTS`'a M6'yı Pro için açtığımda, eğer manifesto
gerçekten `requires: ['M2','M11']` deseydi, M11 Pro'nun grant listesinde
olmadığı için M6 hiçbir zaman gerçekten etkinleştirilemezdi (görünürde açık,
pratikte kilitli bir modül) — canlı tarayıcı testiyle doğrulanana kadar bu
riskliydi. `ModuleCatalog.requires` alanı sadece görüntüleme/envanter amaçlı
duruyor gibi görünüyor, gate mantığına girmiyor.

**Nasıl uygulanır:** Bir modülün bağımlılığını (`requires`) değiştirirken veya
bir modülü yeni bir plana açarken TEK doğruluk kaynağı `src/modules/<id>/manifest.ts`.
`prisma/seed.ts`'teki `modules` dizisi bundan sapmış olabilir — kontrol et ama
kör kör senkronize etme (bu görevde kapsam dışıydı, düzeltilmedi, sadece
raporda bildirildi).
