---
name: fabrika-fabricated-fallback-antipattern
description: Fabrika kod tabanında yaygın anti-desen — DB/LLM hatasında uydurma rakam render edip DB'ye yazan "demo fallback"lar; CLAUDE.md kural 7 ihlali, gördüğün yerde temizle
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da tekrar eden ve **kural 7'yi (gösterilen her rakam bir kayda bağlı) doğrudan
ihlal eden** bir desen var: bir sayfa/action, veri gelmediğinde sabit kodlanmış "demo"
değerler üretip gerçekmiş gibi render ediyor — bazen veritabanına da yazıyor.

M6'da bulunan üç örnek (TASK-MTQ5ZF5ZRU5SM'de temizlendi):
- `generateAiEvaluation`: LLM çağrısı ya da JSON parse patlarsa sabit
  `{excellence: 4.2, impact: 4.0, implementation: 3.8}` + hazır güçlü/zayıf yön listesi
  **Evaluation tablosuna yazılıyordu** ve kullanıcıya kendi teklifinin değerlendirmesi
  olarak gösteriliyordu.
- `evaluations/page.tsx`: DB miss'te uydurma puanlı sahte bir Opportunity render ediyordu.
- `calibrateESR`: başka kiracının kaydında `{ calibration: 0 }` dönüyordu — gerçek,
  mükemmel kalibre bir sonuçtan ayırt edilemez.

M9/M11'de bulunan iki örnek (TASK-MTQW5BVFW6CMT'de temizlendi, 2026-09-07):
- `opportunities/[id]/briefs/page.tsx` ve `.../application/page.tsx`: **var olmayan ya da
  başka kiracıya ait** bir fırsat id'siyle açıldığında sabit "Fraunhofer Institute" brifingi,
  €412.500'lük konsorsiyum bütçesi ve `magicToken: 'partner-access-token-123'` render
  ediyorlardı. Sorgudaki tenant kapsamı DOĞRUYDU — yalan olan ekrandı. İkisi de `notFound()`.
- Aynı commit'te sorguyu yutan `try/catch`ler de kaldırıldı. **Dikkat:** `notFound()` bir
  exception fırlatır; `try/catch` içinde bırakırsan sessizce yutulur ve sayfa yine fallback'e
  düşer. Fallback'i söküyorsan `try/catch`i de sök.

Aynı deseni hâlâ taşıyan yerler (temizlenmedi, kapsam dışıydı — TASK-MTQYXISOPUJ53):
- `pipeline/[id]/consortium/page.tsx` → `DEMO_OPPORTUNITIES` sabiti.
- ~~`api/v1/partners/route.ts` + `api/v1/partners/[pic]/route.ts`~~ — **TEMİZLENDİ**
  (TASK-MTRK8YPNJDCIT, 2026-09-07). Uydurma sebebi şuydu: `prisma.organization` şemada yok,
  delegate `undefined`, çağrı `TypeError` fırlatıyor, `try/catch` yutup demo diziye düşüyordu —
  yani **200 OK, hiç koşmamış bir sorgunun yerine**. Detay uç noktası HERHANGİ bir PIC için
  kurum uyduruyordu. Şimdi CORDIS tablolarına bağlı; veri yoksa `data: []`, bilinmeyen PIC'te
  gerçek HTTP 404. Kaynağı olmayan iki metrik (`networkCentralityScore`, `cooperationIndex`)
  anahtar olarak duruyor ama değeri `null` — şekil bozulmadan "ölçülmedi" diyor.
  **Hâlâ aynı ailede olan kardeşleri:** `api/v1/calls/route.ts` (Topic boşsa sabit
  "HORIZON-CL5-2026-D3-01 / €25.000.000") ve `api/v1/opportunities/route.ts`. Bunlar GERÇEK bir
  modeli çağırdığı için schema-contract taraması onları yakalamaz — bu bir *veri* uydurması,
  *model* uydurması değil.
- `application/client.tsx` (62, 71, 79) + `m11/types.ts` + `m11/ui/PartBCollaborativeEditor.tsx`:
  fallback **istemcide** de var. Sunucu sayfasını temizlemek yetmiyor — `useState` başlangıç
  değeri sabit bütçe/WP/"3 aktif yazar" tutuyor, `applicationPart` tablosu 0 satırken bile
  ekran dolu görünüyor.
- `dashboard/client.tsx` (~122) ülke dağılımı, `notifications/page.tsx` (44, 82) bildirim listesi.

Kural: veri yoksa **boş durum ya da hata** göster; asla uydurma rakam. Sessizce yutulan
`console.warn` + normal return da aynı sınıfta — form olmayan bir kaydı "başarılı" gösterir.
Fabrika'da bir modüle dokunurken bu deseni ara ve raporunda belirt.

Doğrulama tuzağı: temizlik yaptıktan sonra "404 geliyor" demek için ekran görüntüsü YETMEZ — Fabrika'da
404 gövdesi HTTP 200 ile dönüyor, bkz. [[fabrika-notfound-returns-http-200]].

Aynı ailenin bilinen bir örneği: [[fabrika-dashboard-hardcoded-kpi-fallback]] (KPI panosu
gerçek '0' geldiğinde sabit demo oranlarına düşüyor). Bu not onu iptal etmiyor, genelliyor.
