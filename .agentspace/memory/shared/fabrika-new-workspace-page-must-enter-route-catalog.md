---
name: fabrika-new-workspace-page-must-enter-route-catalog
description: '[workspace] altına yeni sayfa eklemek src/lib/modules/route-catalog.ts kaydı olmadan tamam değil — route-catalog testi kırmızıya döner ve kapıyı SONRAKİ karta miras bırakır'
metadata:
  type: reference
updatedAt: 2026-09-07
---

`src/app/[locale]/(app)/[workspace]/` altına bir sayfa eklediğinde `WORKSPACE_ROUTE_CATALOG`
(`src/lib/modules/route-catalog.ts`) listesine de ekle; sayfanın Türkçe re-export'u varsa
`WORKSPACE_ROUTE_ALIASES`'a (ör. `firsatlar/[id]` → `pipeline/[id]`). Aksi hâlde
`tests/modules/route-catalog.test.ts` "pages on disk that the catalog does not record"
diyerek kırmızıya döner.

Gerçek vaka 2026-09-07: commit `be6ae1d` (M9 takvim, TASK-MTQUTBH8Q9VMK) `settings/calendar`
sayfasını ekledi, katalog kaydını atladı. Worker'ın kendi DoD'u yeşil göründü çünkü o kartın
testleri geçiyordu; kırmızı `pnpm gate`'e düştü ve BAŞKA bir kartın (TASK-MTQZ85NESC17T)
sıfırıncı adımı oldu.

**Why:** Katalog yalnız kozmetik bir liste değil — manifest `routes[]` doğrulaması ve modül
kapısının rota→modül eşlemesi bu listeden besleniyor. Kayıtsız sayfa, kapısı olmayan sayfadır.

**How to apply:** Sayfa ekleyen her kartın DoD'una "route-catalog kaydı + `pnpm test` yeşil"
maddesini yaz. Lider olarak sayfa ekleyen bir kart kapatırken `pnpm test` tam çıktısına bak,
yalnız worker'ın kendi test dosyasına değil. İlgili: [[fabrika-red-gate-may-be-a-live-worker-wip]]
· [[fabrika-board-cards-go-stale]]
