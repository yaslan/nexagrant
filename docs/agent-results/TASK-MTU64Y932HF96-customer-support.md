# TASK-MTU64Y932HF96 — e-Fatura akışı: kullanıcıya görünen hata/uyarı metinleri (destek gözüyle envanter)

**Ajan:** CS-EN (customer-support) · **Tip:** envanter / salt-okunur · **Tarih:** 2026-09-09
**Kapsam:** `src/lib/efatura.ts`, `src/lib/efatura-integrator.ts`, `src/lib/adapters/efatura.ts`,
`src/app/api/billing/invoices/[id]/export/{route.ts,invoice-document.ts}`,
`src/lib/billing/{invoice-writer.ts,invoice-list.ts,checkout-tax.ts}`,
`src/app/api/billing/checkout/route.ts`, `BillingClient.tsx`, `messages/{tr,en}.json`.
**Kod değiştirilmedi, commit atılmadı** (görev talimatı gereği — bu rapor dosyası da commit'lenmedi).

---

## 0) Önce bir düzeltme: aynı görev-ID'li önceki rapor bayat

`docs/agent-results/TASK-MTU64Y932HF96-blockzincir-pm.md` bu envanteri daha önce çıkarmış ve iki
ana bulgu bildirmişti. **Her ikisi de bu tarih itibarıyla kodda düzeltilmiş durumda** — envanteri
o rapordan okuyan biri bugün olmayan bir sorunu kovalar:

| Önceki bulgu | Bugünkü durum | Kanıt |
|---|---|---|
| İndirme linkleri düz `<a href>`, 7 hata gövdesi ham JSON olarak kullanıcıya düşüyor | **Düzeltilmiş.** `handleInvoiceDownload` artık `fetch` + `res.ok` kontrolü + `showToast` | `BillingClient.tsx:143-182` |
| `supplier_identity_not_configured` yanıtı `missing: ["INVOICE_SUPPLIER_VKN", …]` ile env değişkeni adlarını sızdırıyor | **Düzeltilmiş.** `missing` yalnız `logger.error`'da; gövde sade | `route.ts:119-128` (yorumda TASK-MTUH6YKP6OQAX referansı) |
| 7 hata kodunun hiçbiri Türkçeye çevrilmiyor | **Düzeltilmiş.** 7 kod → 7 anahtar, tr+en tam | `BillingClient.tsx:123-140`, `messages/tr.json:1493-1499`, `messages/en.json:1493-1499` |

Ayrıca iki hafıza kaydı bayat çıktı ve bu iş kapsamında güncellendi (§7).

Bu rapor bu yüzden **"metinler yok"** envanteri değil, **"metinler var — destek gözüyle ne kadar
işe yarıyor"** envanteridir. Asıl sonuç §4'te: bugünkü en büyük destek riski yanlış yazılmış bir
metin değil, **hiç metin olmayan üç yol**.

---

## 1) Katman A — indirme hata yolu (route → toast). 7 metin, hepsi Türkçe.

Akış: `<button>` → `handleInvoiceDownload` → `fetch` → `!res.ok` → `body.error` kodu →
`invoiceExportMessage()` → kırmızı toast. Kullanıcı **kodu değil, yalnız Türkçe cümleyi** görüyor.

### A1 · `supplier_identity_not_configured` (503) → `invoiceExportUnavailable`
> "Fatura şu anda oluşturulamıyor. Bu geçicidir ve sizinle ilgili değildir; ekibimiz bilgilendirildi, kısa süre içinde tekrar deneyin."

- **Kullanıcı ne anlar:** "Sistem sorunu, benim hatam değil, biraz sonra olur." Tonu doğru, suçlamıyor.
- **Destek ne sorar:** *"Yarım saattir deniyorum, hâlâ aynı."* — çünkü metin **yanlış beklenti kuruyor**.
  Bu hata bir yapılandırma eksiğidir (`INVOICE_SUPPLIER_*` boş); operatör ayarı doldurmadıkça
  5 dakika sonra da, ertesi gün de aynı yanıtı verir. "Kısa süre içinde tekrar deneyin" kullanıcıyı
  3-4 kez boşa denemeye, sonra sinirli bir ticket açmaya yönlendirir.
- **"Ekibimiz bilgilendirildi" doğru mu?** Yalnız `logger.error` yazılıyor (`route.ts:124`) —
  `SystemAlert` **yazılmıyor**. Log'a kimse bakmıyorsa bu cümle **tutulmayan bir söz**. Destek
  açısından en kötü metin türü budur: kullanıcı beklerken kimse haberdar değildir.
- **Net mi:** Kısmen. Ton ✔, eylem ✘, vaat ✘.
- **Öneri:** tekrar-deneme vaadi yerine kesin kanal: *"…ekibimize iletildi. Faturanız hazır olduğunda
  bilgilendirileceksiniz; acilse destek ile fatura numaranızı paylaşın."* + `route.ts:124`'te
  `logger.error` yanına `SystemAlert` yazılması (vaadin karşılığı).

### A2 · `invoice_not_found` (404) → `invoiceExportNotFound`
> "Bu fatura bulunamadı. Fatura numarasını ve hesabınızı kontrol edin; sorun sürerse destek ile fatura numaranızı paylaşın: {number}."

- **Kullanıcı ne anlar:** "Yanlış numara girmişim." — **ama kullanıcı numara girmiyor.** Faturayı
  ekrandaki listeden tıklıyor; numara `invoice.number`'dan geliyor. "Fatura numarasını kontrol edin"
  bu bağlamda hem anlamsız hem üstü kapalı suçlayıcı.
- **Destek ne sorar:** *"Listede duruyor, tıklayınca 'bulunamadı' diyor — faturam silindi mi?"*
  Gerçek nedenler: kayıt başka kiracıya ait, satır silinmiş, ya da kullanıcı sekmede başka çalışma
  alanına geçmiş. **Destek notu:** bu 404 bilinçli olarak "başka kiracının faturası" durumunu da
  kapsar (`route.ts:26-28` — kiracı yoklamasını engellemek için). Yani "bulunamadı" ≠ "yok".
- **Net mi:** Hayır — eylem yanlış hedefte.
- **Öneri:** *"Bu fatura bu çalışma alanında bulunamadı. Doğru çalışma alanında olduğunuzdan emin
  olun; sorun sürerse fatura numarasıyla destek ile iletişime geçin: {number}."*

### A3 · `unsupported_format` (400) → `invoiceExportUnsupportedFormat`
> "Bu fatura biçimi desteklenmiyor. Lütfen XML veya PDF seçeneğini kullanın."

- **Kullanıcı ne anlar:** Tam olarak doğru şeyi. **Net ✔**
- **Destek ne sorar:** Pratikte hiç — butonlar `xml`/`pdf` sabit; bu metni gören biri URL'i elle
  değiştirmiştir. Ticket gelirse "URL'i elle mi düzenlediniz?" diye sorulmalı.
- **Değişiklik gerekmiyor.**

### A4 · `unauthorized` (401) → `invoiceExportUnauthorized`
> "Oturumunuz sona ermiş. Devam etmek için tekrar giriş yapın."

- **Kullanıcı ne anlar:** Doğru şeyi, eylem de net. **Net ✔**
- **Destek ne sorar:** *"Nereden giriş yapacağım?"* — küçük ama gerçek: toast gösteriliyor,
  kullanıcı aynı sayfada kalıyor, giriş sayfasına yönlendirme yok.
- **Öneri:** toast'a bir "Giriş yap" eylemi ya da otomatik yönlendirme (metin değişikliği değil, UX).

### A5 · `no_tenant` (403) → `invoiceExportNoTenant`
> "Bu hesapla ilişkili bir kuruluş bulunamadı. Doğru hesapla giriş yaptığınızdan emin olun."

- **Kullanıcı ne anlar:** "Yanlış hesapla girmişim." Muhtemelen doğru değil — genelde oturumun
  çalışma alanı bağlamı düşmüştür, hesap doğrudur.
- **Terminoloji çatışması (gerçek bulgu):** **Aynı koşul için üründe iki farklı metin ve iki farklı
  çözüm var.** `messages/tr.json:136,164,181` — `TENANT_SCOPE_REQUIRED`: *"Oturumunuz bir **çalışma
  alanına** bağlı değil. Lütfen **yeniden giriş yapın**."* Buradaki metin ise *"…bir **kuruluş**
  bulunamadı. **Doğru hesapla** giriş yaptığınızdan emin olun."* Kullanıcı iki farklı kelime ve iki
  farklı eylem duyuyor; destek de iki farklı yanıt yazıyor. (`tr.json` genelinde "çalışma alanı" 22,
  "kuruluş" 11 kez geçiyor — baskın terim "çalışma alanı".)
- **Net mi:** Hayır — tutarsız.
- **Öneri:** `TENANT_SCOPE_REQUIRED` metnine hizala: *"Oturumunuz bir çalışma alanına bağlı değil.
  Lütfen yeniden giriş yapın."*

### A6 · `invoice_lookup_failed` + `invoice_lines_invalid` (500) → `invoiceExportSystemError`
> "Fatura şu anda görüntülenemiyor. Birkaç dakika sonra tekrar deneyin; sorun devam ederse destek ekibimize fatura numarasıyla ulaşın."

- **İki farklı arıza tek metne katlanmış** (`BillingClient.tsx:135-137`) ve tavsiye yalnız birine uyuyor:
  - `invoice_lookup_failed` = DB okuması patladı → **geçici, tekrar denemek mantıklı ✔**
  - `invoice_lines_invalid` = kayıtlı `lines` verisi Zod şemasına uymuyor (`invoice-document.ts:209-213`)
    → **veri bozuk, kendiliğinden düzelmez; tekrar denemek boşuna ✘**
- **Destek ne sorar:** *"10 kere denedim, hep aynı."* — ikinci durumda kullanıcı tavsiyeye uyduğu
  için tekrar tekrar deniyor, sonra aynı ticket'ı tekrar açıyor.
- **Net mi:** Yarısı için evet.
- **Öneri:** ayır. `invoice_lines_invalid` için: *"Bu faturanın kayıtlı içeriği okunamıyor. Tekrar
  denemek sorunu çözmez — ekibimiz düzeltebilir; fatura numarasıyla destek ile iletişime geçin: {number}."*

### A7 · `default` / ağ hatası / yakalanmamış sunucu hatası → `invoiceExportGenericError`
> "Fatura indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin."

- **Bu metin iki farklı olayı kapsıyor** ve birinde **kullanıcıyı haksız yere suçluyor**:
  1. gerçek ağ kopması (`catch`, `BillingClient.tsx:176-179`) → tavsiye doğru ✔
  2. `route.ts:134`'teki `throw error` — beklenmedik sunucu hatası. Next varsayılan HTML 500
     döner, `res.json()` çuvallar → `body` null → `body?.error` undefined → **default dalı**.
     Yani **sunucu çöktüğünde kullanıcıya "internetinizi kontrol edin" deniyor.**
- **Destek ne sorar:** *"İnternetim gayet iyi, başka her şey açılıyor."* — kullanıcı modem
  yeniden başlatır, sinirlenir, sonra yazar. Klasik yanlış-yönlendirme ticket'ı.
- **Net mi:** Hayır (ikinci durum için).
- **Öneri:** nötr yaz: *"Fatura indirilemedi. Bağlantınızı kontrol edip tekrar deneyin; sorun
  sürerse fatura numarasıyla destek ile iletişime geçin."*

---

## 2) Katman B — belgenin **içindeki** metinler (`src/lib/efatura.ts`)

Bunlar müşterinin indirdiği XML/HTML/PDF çıktısının içinde; toast değil, **belgede kalıcı**.

| Konum | Metin | Destek değerlendirmesi |
|---|---|---|
| `efatura.ts:141-142` — `UNFILED_NOTICE`, belgeye `:502` (XML `<cbc:Note>`), `:687` (HTML bandı), `:797` basılıyor | "ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur." | **Doğru ve bilinçli** (TASK-MTRD9QBJ2G32E) ama **bugün her faturada görünüyor** (entegratör bağlı değil). Destek sorusu kaçınılmaz: *"Bunu muhasebeme veremiyorum, resmî faturam ne zaman gelecek?"* Metin **doğru ama eksik**: kullanıcıya ne yapacağını söylemiyor. Öneri: bandın yanına tek cümle — resmî belgenin ayrıca düzenleneceği ve bu belgenin ödeme kaydı olarak kullanılabileceği. Bu bir **metin** işi değil, bir **taahhüt** işi: ne söyleneceğine patron karar vermeli (§6). |
| `efatura.ts:158-162` — `foreignCurrencyFilingBlock` | "`{currency}` faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e gonderilemez (VUK 215 / 385 Sira No.lu Genel Teblig). Karar bekliyor: docs/adr/ADR-0002-…md" | **Bugün kullanıcıya ulaşmıyor** (§5). Ulaşırsa üç ayrı sorun: (a) Türkçe karakterler bozuk — "faturasi/tasimadigi/gonderilemez"; (b) son kullanıcıya **bir depo dosya yolu** söylüyor (`docs/adr/…`) — bu geliştirici notu, müşteri metni değil; (c) mevzuat maddesi tek başına kullanıcıya ne yapacağını söylemiyor. Filing akışı bağlanmadan **önce** yeniden yazılmalı. |
| `efatura.ts:380` | "… — ödenecek genel toplamın TL karşılığı: {tl} TRY" | Net ✔ |
| `efatura.ts:775` | "TL karşılığı (kayıtlı tutar yok):" → değer yerine "—" | Uç durum: yabancı para faturasında kur var ama `grandTotalTryMinor` yok. Alıcı belgede boş bir TL satırı görür. Destek sorusu: *"TL tutarı neden yazmıyor, muhasebem soruyor?"* Metin dürüst ✔ ama **eylem yok**. Öneri: "—" yerine kısa açıklama ya da satırın hiç basılmaması. Öncelik düşük (nadir). |

---

## 3) Katman C — liste ekranı metinleri (`BillingClient.tsx` + `messages/tr.json:1470-1499`)

Genel durum **iyi**: 30 anahtarın tamamı tr+en dolu, ton tutarlı, sabit metin yok. Destek gözüyle
not düşülecek üç tanesi:

| Anahtar | Metin | Not |
|---|---|---|
| `invoiceUnreadable` (tr.json:1475) | "Fatura geçmişi şu anda okunamadı. Bu, fatura olmadığı anlamına gelmez — sayfayı yenileyin." | **Örnek alınacak metin.** Yanlış çıkarımı (fatura yok sanmak) önden kesiyor ve tek net eylem veriyor. Diğer metinler buna benzetilmeli. |
| `invoiceAmountUnreadable` (tr.json:1476) | "okunamadı" — tutar sütununda tutar yerine (`BillingClient.tsx:746,754,758`) | Kullanıcı fatura satırında para yerine bu kelimeyi görüyor. Destek sorusu: *"Faturamda tutar 'okunamadı' yazıyor, ne kadar ödedim?"* Tek başına duran bir kelime; **eylem yok, kanal yok.** Öneri: hücrede kısa kalsın ama satıra bir ipucu/tooltip: "Tutar okunamadı — fatura numarasıyla destek ile iletişime geçin." |
| `invoiceUnfiled` + `invoiceUnfiledHint` (tr.json:1478-1479) | "GİB'e gönderilmedi" / "Zarf numarası olmayan belge mali mühür taşımaz." | Doğru ve dürüst ✔ ama bugün **her satırda** görünüyor. `UNFILED_NOTICE` ile aynı soruyu üretir (Katman B). İkisi tek bir açıklamaya bağlanmalı. |

---

## 4) ⚠ Katman D — **asıl bulgu: metin OLMAYAN üç yol**

Bunlar envanterde "kötü metin" olarak görünmez, çünkü **hiç metin yok**. Destek yükü buradan gelir.

### D1 · Ödeme alındı, fatura kesilmedi, kullanıcıya **hiçbir şey** söylenmiyor  ⛔ EN YÜKSEK
`createInvoiceForPayment` altı ayrı gerekçeyle `skipped` dönebiliyor
(`invoice-writer.ts:80-95`): `buyer_identity_missing`, `vat_country_unknown`,
`amount_not_invoiceable`, `number_allocation_failed`, `fx_rate_unavailable`,
`fx_currency_unsupported`. Her biri `SystemAlert` yazıyor (İngilizce, iç kayıt).

**Ama iki çağıranın ikisi de dönen sonucu kullanmıyor:** `iyzico.ts:739` ve
`subscription-sync.ts:639` — dönüş değeri hiçbir yere atanmıyor, hiçbir dala girmiyor.
**Ödeme başarıyla tamamlanıyor, fatura satırı yazılmıyor, kullanıcıya tek kelime edilmiyor.**

Kullanıcı sonra Ayarlar → Faturalama'yı açıyor ve şunu okuyor (`tr.json:1473-1474`):
> "Henüz fatura düzenlenmedi — Bu kuruluş adına düzenlenmiş bir fatura kaydı yok. İlk fatura düzenlendiğinde burada listelenecek."

Bu, ürünün **en yanıltıcı metni**: sakin, normal ve olumlu bir cümle, **parası alınmış ama faturası
kesilmemiş** bir kullanıcıya gösteriliyor. Kullanıcı "demek daha kesilmemiş, beklerim" diyor.

- **Destek ne sorar:** *"Ödemem geçti, kartımdan çekildi, ama fatura yok. Muhasebem istiyor."*
  — ve destek ekranda bir hata göremediği için önce kullanıcıya inanmaz, sonra `SystemAlert`
  tablosuna bakması gerektiğini bilmesi gerekir. **Bu bir runbook boşluğu.**
- **En olası gerekçe `buyer_identity_missing`** ve bunun ayrı bir ağırlığı var:
  `TenantBillingIdentity` tablosuna **hiçbir yerden yazılmıyor** — `grep tenantBillingIdentity src`
  yalnız iki **okuma** buluyor (`invoice-writer.ts:377`, `checkout-tax.ts:59`); form, API veya seed
  yok. Yani kiracının fatura kimliğini **ne kullanıcı ne destek** dolduramıyor. Ticket açılır,
  destek çözemez, mühendisliğe gider — **her seferinde**.
- **Öneri (metin + akış):** (a) `skipped` sonucu kullanıcıya taşınsın — faturalama ekranında,
  "fatura yok" mesajının **yerine** bir uyarı: *"Ödemeniz alındı, ancak faturanız henüz
  düzenlenemedi. Ekibimiz bunun üzerinde çalışıyor; fatura hazır olduğunda bilgilendirileceksiniz."*
  (b) `buyer_identity_missing` için kullanıcının doldurabileceği bir fatura kimliği formu — bugün
  yok. (c) Runbook: "ödeme var, fatura yok" → `SystemAlert` tablosunda `paymentRef` ile ara.

### D2 · PDF açılmazsa **sessiz başarısızlık** (hata mesajı yok)
`handleInvoiceDownload` PDF için tıklama anında `window.open` çağırıyor
(`BillingClient.tsx:147`); tarayıcı engellerse `previewWindow` null oluyor ve `:164-165`'te
**ikinci bir `window.open`** deneniyor — o da engellenirse dönüş değeri kontrol edilmiyor.
Sonuç: spinner ("Fatura hazırlanıyor...") biter, **hiçbir şey açılmaz, hiçbir uyarı çıkmaz.**
İstek başarılı olduğu için `!res.ok` dalına da girmez.

- **Destek ne sorar:** *"PDF'e basıyorum hiçbir şey olmuyor."* — tekrar-üretimi zor
  (pop-up engelleyici kullanıcıya özel), destek "bende çalışıyor" der. Klasik zaman yakan ticket.
- **Öneri:** ikinci `window.open` null dönerse toast: *"Faturayı açmak için tarayıcınızın açılır
  pencere engellemesine izin verin ya da XML olarak indirin."*

### D3 · Ödeme adımında KDV çözülemediğinde **hiçbir açıklama yok**
`taxLineForTenant` kiracının ülkesini okuyamazsa `resolved: false` + `vatMinor: 0` dönüyor
(`checkout-tax.ts:54,66-80`) ve checkout yanıtı bu alanları taşıyor
(`checkout/route.ts:237-243`) — ama **hiçbir arayüz bunları basmıyor**
(`grep grossTotalMinor|tax.resolved|vatMinor src --include=*.tsx` → **0 sonuç**).
Bu arada fiyat sayfası şunu vaat ediyor (`tr.json:1260`, `:1438`):
> "Fiyatlar KDV hariçtir. KDV, ödeme adımında alıcının ülkesine göre eklenir (Türkiye %20, Kuveyt %0)."

Kullanıcı ödeme adımında **KDV satırı hiç görmüyor**, net tutarı ödüyor — ve `checkout-tax.ts:47-48`
yorumunun kendi ifadesiyle "no invoice is issued until the gap is closed", yani D1'e düşüyor.

- **Destek ne sorar:** *"Sitede KDV eklenecek yazıyordu, eklenmedi — faturamda KDV olacak mı?"*
  Bu bir **fiyat/vaat tutarsızlığı**; destek yanıtı hukuki sonuç doğurur, uydurulamaz.
- **Öneri:** ödeme özetinde KDV satırı her zaman gösterilsin; çözülemediğinde açık bir metin —
  ne söyleneceği **patron/finans kararı** (§6).

---

## 5) Katman E — bugün ulaşılamayan metinler (filing akışı bağlı değil)

`grep -rn "fileInvoice|fileThrough(" src` → `efatura-integrator.ts` ve `adapters/efatura.ts`
dışında **sıfır çağrı**. Bu yüzden `FilingOutcome` gerekçeleri (`not_configured`,
`provider_unsupported`, `rejected`, `blocked`, `unreachable`) ve
`createSandboxAdapter`'ın attığı İngilizce hata bugün **kullanıcıya dönmüyor** — kapsam dışı,
ama filing bağlandığında bu envanter tekrar açılmalı.

**Bir düzeltme:** hafızadaki "`ADAPTERS` sözlüğü bilerek boş" bilgisi artık doğru değil —
`efatura-integrator.ts:163-165` bir `sandbox` adaptörü kaydediyor. Güvenlik korunmuş
(`file()` → `rejected`, `filed` değil; `isFiledWithGib` damgayı kaldırmıyor, `:141-146` test modu
dışında `throw`). **Destek açısından tek not:** sandbox'ın reddetme mesajı `UNFILED_NOTICE`
(`:154`), yani bir *ret gerekçesi* olarak "ÖRNEK BELGE — GİB'e gönderilmemiştir…" cümlesi
görünecek — bu bir gerekçe değil, bir damga. Filing bağlanmadan önce ayrı bir metin verilmeli.

---

## 6) Öncelik — destek çağrısı üretme sırası

| # | Bulgu | Neden bu sırada | Sahip |
|---|---|---|---|
| 1 | **D1** — ödeme alındı/fatura yok, ekran "henüz fatura düzenlenmedi" diyor | Para + muhasebe + yanıltıcı sakin metin. Destek ekranda kanıt göremiyor; kullanıcı hiç uyarılmıyor. Fatura kimliği formu olmadığı için **kullanıcı da destek de çözemiyor** | billing/dev + patron (ne söz vereceğiz) |
| 2 | **D3** — fiyat sayfası KDV vaat ediyor, ödeme adımı hiç göstermiyor | Vaat/gerçek tutarsızlığı; yanıtı hukuki sonuç doğuruyor | patron/finans |
| 3 | **A1** — "kısa süre içinde tekrar deneyin" + "ekibimiz bilgilendirildi" (`SystemAlert` yok) | Tutulmayan söz + boşa tekrar denemeler | dev (metin + `SystemAlert`) |
| 4 | **D2** — PDF pop-up engellendiğinde sessiz başarısızlık | Tekrar-üretimi zor, "bende çalışıyor" ticket'ı | dev |
| 5 | **A6** — `invoice_lines_invalid`'e "birkaç dakika sonra deneyin" | Boşuna tekrar + aynı ticket'ın tekrarı | dev |
| 6 | **A7** — sunucu hatasında "internetinizi kontrol edin" | Kullanıcıyı haksız yere suçluyor | dev |
| 7 | **A2** — "fatura numarasını kontrol edin" (kullanıcı numara girmiyor) | Yanlış hedefte eylem | dev |
| 8 | **A5** — aynı koşul için "kuruluş"/"çalışma alanı" iki metin, iki çözüm | Tutarsızlık; destek iki farklı yanıt yazıyor | dev |
| 9 | **B** — `UNFILED_NOTICE` her faturada; ne yapılacağı söylenmiyor | Bilinçli tasarım, ama muhasebe sorusu kaçınılmaz | patron (taahhüt) |
| 10 | **B** — `foreignCurrencyFilingBlock`: bozuk Türkçe + müşteriye depo yolu | Bugün ulaşılmıyor; filing öncesi şart | dev |

---

## 7) Kanıt

```
$ grep -n "invoiceExport" src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx
126:        return t('invoiceExportUnavailable');
128:        return t('invoiceExportNotFound', { number: invoiceNumber });
130:        return t('invoiceExportUnsupportedFormat');
132:        return t('invoiceExportUnauthorized');
134:        return t('invoiceExportNoTenant');
137:        return t('invoiceExportSystemError');
139:        return t('invoiceExportGenericError');
156:        showToast(invoiceExportMessage(body?.error, invoiceNumber), 'error');
178:      showToast(t('invoiceExportGenericError'), 'error');

$ sed -n '119,128p' src/app/api/billing/invoices/[id]/export/route.ts
    if (error instanceof SupplierNotConfiguredError) {
      // ... `missing` used to ship the env var names straight to the
      // customer's browser (TASK-MTUH6YKP6OQAX).
      logger.error('invoice supplier identity not configured', { missing: error.missing });
      return NextResponse.json(
        { error: 'supplier_identity_not_configured' },
        { status: 503 }
      );

# D1 — TenantBillingIdentity'ye yazan hiçbir yer yok (yalnız 2 okuma):
$ grep -rn "tenantBillingIdentity" src --include="*.ts" --include="*.tsx" | grep -v test
src/lib/billing/invoice-writer.ts:108:export type InvoiceWriterDb = Pick<..., 'invoice' | 'tenantBillingIdentity'>;
src/lib/billing/invoice-writer.ts:377:  const identity = await db.tenantBillingIdentity.findUnique({
src/lib/billing/checkout-tax.ts:59:      tx.tenantBillingIdentity.findUnique({

# D3 — checkout KDV alanlarını hiçbir arayüz basmıyor:
$ grep -rn "grossTotalMinor|tax.resolved|vatMinor" src --include="*.tsx"
(çıktı yok)

# E — filing akışı hâlâ bağlı değil:
$ grep -rn "fileInvoice|fileThrough(" src --include="*.ts" --include="*.tsx" \
    | grep -v "efatura-integrator.ts|adapters/efatura.ts"
(çıktı yok)

# tr/en parite: 30/30 invoice anahtarı iki dilde de dolu (tr.json:1470-1499, en.json:1470-1499)
```

**Bayat çıkan ve bu iş kapsamında güncellenen hafıza kayıtları:**
- `fabrika-invoice-export-errors-leak-raw-json` — anlattığı iki sorun da düzeltilmiş (§0).
- `fabrika-preflight-gate-must-mirror-what-the-code-blocks` — örnek verdiği `INVOICE_VAT_RATE`
  2026-09-09'da koddan tamamen kaldırılmış (`grep -rn INVOICE_VAT_RATE src scripts` → 0 sonuç;
  yalnız `docs/`'ta tarihçe olarak duruyor). **Kaydın genel kuralı geçerli**, örneği bayat.
- `fabrika-einvoice-real-record-or-404` — "`ADAPTERS` bilerek boş" artık doğru değil, `sandbox`
  kayıtlı (§5). Güvenlik gerekçesi korunmuş.

---

## Değişen dosyalar
Yok — salt-okunur envanter. Bu rapor dosyası dışında hiçbir dosyaya yazılmadı, commit atılmadı.

## Riskler
- Rapordaki satır numaraları 2026-09-09 tarihli çalışma ağacına ait; `BillingClient.tsx` ve
  `messages/*.json` bu oturumda değiştirilmiş (`git status`'ta `M`), paralel bir ajan aynı
  dosyalara dokunuyorsa numaralar kayabilir. Kod alıntıları numaralardan daha güvenilir.
- D1'in kullanıcıya ne söyleyeceği bir **ticari taahhüt** — metni destek tek başına yazmamalı.

## Açık sorular (patron/finans kararı gerektirir)
1. **D1:** Ödeme alınıp fatura kesilemediğinde kullanıcıya ne söyleyeceğiz ve ne kadar süre
   taahhüt edeceğiz? ("Ekibimiz çalışıyor" mu, "X iş günü içinde" mi?)
2. **D3:** Ödeme adımında KDV çözülemediğinde kullanıcı net tutarı ödüyor — ekranda ne yazacak?
3. **B/`UNFILED_NOTICE`:** Entegratör bağlanana kadar müşteriye resmî fatura konusunda ne söz
   veriyoruz? (Bu metin bugün her faturanın üstünde.)
4. Kiracı fatura kimliği (`TenantBillingIdentity`) formu kimin kapsamında — bugün doldurma yolu yok.

## Sonraki adım
Bu rapor bir **envanter**; düzeltmeler ayrı kartlar olmalı. Önerilen bölünme:
- **Kart 1 (billing/dev, yüksek):** D1 — `createInvoiceForPayment` sonucunun kullanıcıya taşınması
  + "fatura yok" boş-durum metninin ödeme varken değişmesi + `SystemAlert` runbook'u.
- **Kart 2 (dev, orta):** A1/A2/A5/A6/A7 metin düzeltmeleri + A1 için `SystemAlert` + D2 pop-up toast'ı
  (hepsi `messages/{tr,en}.json` + `BillingClient.tsx`, tek PR).
- **Kart 3 (patron/finans, bloklayıcı):** §6'daki 4 açık soru yanıtlanmadan Kart 1 ve D3 yazılamaz.
- **Kart 4 (filing bağlanınca):** Katman E envanteri + `foreignCurrencyFilingBlock` metninin
  yeniden yazımı (bozuk Türkçe, depo yolu) + sandbox ret gerekçesi.
