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

S12 "hayalet alan" dalgasında bulunan iki **halka açık** örnek (TASK-MTRKVJKE14KVR, 2026-09-07):
- `src/app/api/v1/calls/route.ts`: `select`'i `Topic.topicId/.programme/.deadlineAt/.deadlineTz/
  .budgetTotalEur/.fundingType` istiyordu — hiçbiri şemada yok. Sorgu her istekte fırlıyor,
  `catch` yutuyor, endpoint **200 OK** ile dört uydurma çağrı (€180m "EIC Accelerator",
  "TÜBİTAK 1707", uydurma `expectedGrantRangeEur` bantları) servis ediyordu.
- `src/app/[locale]/calls/turkey/page.tsx`: `Call.country/.isOpen/.deadline` — üçü de yok. Sayfa
  veri tabanında ne olursa olsun **"0 aktif çağrı"** gösteriyordu; sessiz fallback her zaman
  "uydurma satır" değildir, bazen **sessiz boşluktur** ve daha zor fark edilir.

TASK-MTQYXISOPUJ53'te (2026-09-07, commit `dc97077`) **TEMİZLENDİ** — bu satırları tekrar
"açık bulgu" olarak sayma:
- ~~`api/v1/opportunities/route.ts`~~ — boş pipeline'da da patlayan sorguda da iki demo fırsat
  dönüyordu; artık boş = `[]`, hata = 500 `OPPORTUNITIES_QUERY_FAILED`.
- ~~`partners/page.tsx` `DEMO_CORDIS_PARTNERS`~~ + `CordisOrganization` fallback'inin
  `totalProjects: 1 / totalEcContribution: BigInt(0)` uydurması (artık `null`, tabloda `—`).
- ~~`opportunities/[id]/documents/page.tsx`~~ — "13.5/15.0 ESR" TÜBİTAK paketi; `notFound()`.
- ~~`notifications/page.tsx`~~ **ve** `src/components/UserMenu.tsx` — şemada notification modeli
  yok, ikisi de tamamen uydurmaydı; boş.
- ~~`reports/person-days/page.tsx` `MOCK_REPORTS`~~ — hiç sorgu yapmıyordu; gerçek `Effort`.
- ~~`application/client.tsx` (62,71,79)~~ — istemci mount'ta €412.500'lük konsorsiyumu yeniden
  uyduruyordu; `[]` + boş durum.
- ~~`m10/server/actions.ts` LLM fallback'i~~ — uydurma hukuki belge DB'ye yazılıyor + 1 kredi
  düşülüyordu; artık `recordAlert` + throw, belge yok, kredi yok.

**Hâlâ açık (başka kartların):** `pipeline/[id]/consortium/page.tsx` `DEMO_OPPORTUNITIES` ·
`settings/billing/BillingClient.tsx` `DEMO_INVOICES` · `m11/types.ts`
`DEFAULT_PART_B_SECTIONS` (hazır Part B metni, "Dr. Mehmet Yılmaz / Fraunhofer" imzalı) ·
`m10/server/actions.ts` `mockUrl` (hiçbir yere çıkmayan `storage.fabrika.app` linki).

Ailenin **dördüncü** biçimi (bu turda bulundu): *sahte başarı sağlayıcısı*. `calendar/google.ts`
ve `outlook.ts` `console.log('[MOCK]')` + rastgele `externalId` dönüyordu; senkron kodu bunu
başarı sayıp `lastSyncAt` damgalıyor, ekran "Son senkronizasyon: <tarih>" diyordu. Uydurma satır
değil, **uydurma olay**. Aynı yerde arayacağın soru: "bu dönüş değeri gerçekten bir şey yaptı mı,
yoksa yalnız öyle mi görünüyor?"

Fallback sökerken üç şey:
1. **Fallback'i ayakta tutan yeşil bir test ara.** Buradaki `tests/api/v1-partners.test.ts`
   `topic.findMany` mock'u `[]` dönerken `data.length > 0` bekliyordu — yalnızca demo dizisi
   sayesinde geçiyordu. Fallback'i silmek onu kırar; testi *gerçeğe göre* düzelt, gevşetme.
2. **Boş durumu gerçekten kanıtla.** Kaynak veriyi geçici olarak filtreden düşür (burada:
   20 topic'in `eligibility`'sini `{restricted:'EU_EEA_CH_ONLY'}` yap), boş ekranı çek, sonra
   **birebir geri al** ve öncesi/sonrası ölç. Bu aynı anda filtrenin canlı olduğunu da kanıtlar.
3. **Tahmini varsayılan de bir uydurmadır.** `deadlineTz` yoksa "Europe/Brussels" yazmak son
   tarihi bir saat kaydırır; `null` döndür (bkz. [[fabrika-absence-is-not-zero]]).

Faturalandırma panelinde bulunan iki örnek (TASK-MTRD91ZLKEQ3A'de temizlendi, 2026-09-07):
- `settings/billing/BillingClient.tsx`: `DEMO_INVOICES` sabiti — `GIB202600000001` /
  `…014` GİB fatura numaraları, emekli "Team Plan" adı, ₺32.220 ve ₺10.740, üstünde
  sabit "Demo Ar-Ge ve Danışmanlık Ltd. Şti." unvanı ve **VKN 2840958172**. "Demo örnek"
  etiketi vardı ama sütun başlığı "GİB fatura no" diyordu. Gerçek `Invoice` tablosuna
  bağlandı; kayıt yoksa boş durum.
- `settings/billing/page.tsx`: entitlement sorgusu patlarsa
  `{seats: 6, workspaces: 5, aiCreditsMonthly: 1000}` — hiçbir planın satmadığı bir
  kapasite — ve `tenantName = 'FonBridge Demo Kuruluşu'` (başkasının kuruluş adı).
  Yedek nesne silindi; okunamayan alan `null` ve UI "—" + "ölçülmedi" gösteriyor.

**Desenin genel kuralı:** yedek değer *gerçekten* okunamadığını söylemelidir. `?? 0` da
uydurmadır — müşteri onu "kalan kredin 0" diye okur. Ayrıca "bu kiracının kaydı yok" ile
"okuyamadım" birbirinden ayrı iki durumdur; ikincisini boşluk olarak göstermek de yalandır
(panelde `invoicesMeasured` bayrağı bunun için var).

