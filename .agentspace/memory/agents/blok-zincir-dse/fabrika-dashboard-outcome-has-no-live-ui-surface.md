---
name: fabrika-dashboard-outcome-has-no-live-ui-surface
description: Pano kartlarının hiçbiri Proposal.outcome okumuyor — "Eşik Üstü Oranı" anahtarı var ama render edilmiyor; iki CSV uç noktasından biri yetim (ölçüldü 2026-09-07)
metadata:
  type: project
  updatedAt: 2026-09-07
---

Bir denetim raporu "panoda Başarı Oranı %0 görünüyor" dediğinde **o kartın hâlâ ekranda
olduğunu varsayma**. 2026-09-07 ölçümü:

- Pano (`src/modules/m5/ui/Dashboard.tsx`) altı kart gösteriyor: `totalProposals`, `hitRate`,
  `averageScore`, `personDays`, `avgDaysG2`, `activeModules`. **Hiçbiri `Proposal.outcome`
  okumuyor**; `getKpiMetrics` gönderimi `submittedAt` üzerinden sayıyor.
- `outcome`'a dayanan KPI — **`Dashboard.thresholdRate` ("Eşik Üstü Oranı")** — tr+en'de
  anahtarı VAR ama hiçbir bileşende kullanılmıyor. `docs/ROADMAP.md` E10 satırı onu KPI
  listesinde sayıyor; yani pano bu KPI'ı hiç göstermemiş oluyor. (`pnpm i18n:check`
  "kullanılmayan anahtar" listesinde görünür.)
- **İki ayrı CSV uç noktası var, karıştırma:**
  - `src/app/[locale]/(app)/[workspace]/dashboard/api/export-csv/route.ts` → `exportDashboardCSV`
    — panodaki "CSV indir" düğmesinin gittiği yer (`${pathname}/api/export-csv`).
    **Fırsat satırlarını döküyor, KPI hesaplamıyor.**
  - `src/app/api/dashboard/export-csv/route.ts` → KPI özeti. **UI'dan hiçbir bağlantı yok**;
    yalnız doğrudan URL ile erişiliyor. Kasa hatası buradaydı ve burada düzeltildi.

Ders: "ekranda şu yanlış" tipi bir kartı almadan önce o yüzeyin hâlâ var olduğunu koda karşı
doğrula — yoksa var olmayan bir kartın ekran görüntüsünü aramakla vakit kaybedersin, ya da
daha kötüsü "düzelttim, ekranda doğru" diye yanlış rapor verirsin.
Bkz. [[fabrika-board-cards-go-stale]] · [[fabrika-dashboard-outcome-case-mismatch]]
