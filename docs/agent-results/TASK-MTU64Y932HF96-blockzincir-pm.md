# TASK-MTU64Y932HF96 — e-Fatura kullanıcı-dönen metin envanteri (salt okunur)

Kapsam: `src/lib/efatura.ts`, `src/lib/efatura-integrator.ts`, `src/lib/adapters/efatura.ts`,
`src/app/api/billing/invoices/[id]/export/route.ts`, `invoice-document.ts`, ve bu API'yi
tüketen tek ekran: `BillingClient.tsx` (Ayarlar → Faturalama). Kod değiştirilmedi, commit atılmadı.

## 1) Envanter — dosya:satır + metin + analiz

### A. API hata gövdeleri — `src/app/api/billing/invoices/[id]/export/route.ts`
Bu uç noktaya tarayıcıdan **doğrudan `<a href>` linki** ile gidiliyor (bkz. §2). Yani
buradaki her JSON gövde, hata anında kullanıcının ekranına **olduğu gibi** düşüyor —
aradan geçen hiçbir Türkçe katman yok.

| # | Konum | Durum | Gövde | Kullanıcı ne anlar | Destek hangi soruyu alır | Eyleme çağırıyor mu | Teknik sızıntı |
|---|---|---|---|---|---|---|---|
| 1 | route.ts:47-50 | 400 | `{error:"unsupported_format", supported:["xml","pdf","html"]}` | Hiç — İngilizce JSON | "Fatura indirirken bozuk bir sayfa çıktı" | Hayır | Orta (iç format listesi) |
| 2 | route.ts:56 | 401 | `{error:"unauthorized"}` | Oturumu düştüğünü anlamaz | "Fatura linkine tıkladım, hata verdi" | Hayır | Düşük |
| 3 | route.ts:61 | 403 | `{error:"no_tenant"}` | Hiçbir şey — "tenant" kelimesini bilmez | "no_tenant ne demek?" | Hayır | Orta (iç veri modeli terimi) |
| 4 | route.ts:100 | 500 | `{error:"invoice_lookup_failed"}` | Hiçbir şey | "Fatura sayfası çöktü" | Hayır | Düşük |
| 5 | route.ts:104 | 404 | `{error:"invoice_not_found"}` | Faturanın olmadığını sanabilir (oysa yetki/format sorunu da olabilir) | "Faturam kayboldu mu?" | Hayır | Düşük |
| 6 | route.ts:123-126 | 503 | `{error:"supplier_identity_not_configured", missing:["INVOICE_SUPPLIER_VKN", ...]}` | Hiçbir şey — ve **ortam değişkeni adları** müşteriye sızıyor | "Şirketinizin sistemi bozuk, VKN hatası veriyor" | Hayır | **Yüksek** — iç config anahtarları dışa sızıyor |
| 7 | route.ts:130 | 500 | `{error:"invoice_lines_invalid"}` | Hiçbir şey | "Fatura kalemleri bozuk diyor, param ne olacak?" | Hayır | Düşük |

### B. Belge içi uyarı/damga metinleri — `src/lib/efatura.ts`
Bunlar müşterinin gördüğü PDF/HTML/XML çıktısının kendisinde — mevcut hâliyle zaten
**Türkçe ve net**, ayrı bir çeviri gerektirmiyor, ama destek açısından not edildi:

| Konum | Metin | Not |
|---|---|---|
| efatura.ts:141-142 (`UNFILED_NOTICE`) | "ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur." | Net ve eyleme çağırıyor değil ama doğru: müşteri "bu fatura geçersiz mi?" diye destek açabilir — bilinçli tasarım kararı (TASK-MTRD9QBJ2G32E), metin sorunu değil. |
| efatura.ts:158-162 (`foreignCurrencyFilingBlock`) | "`{currency}` faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e gonderilemez (VUK 215 / 385 Sira No.lu Genel Teblig). Karar bekliyor: docs/adr/ADR-0002-...md" | **Şu an hiçbir route bunu çağırmıyor** (bkz. §3) — bugün kullanıcıya ulaşmıyor. Türkçe karakter kodlaması bozuk (`tasimadigi` vb. — ı/ş/ğ yok) ve **bir dosya yolunu** (`docs/adr/...`) son kullanıcıya söylüyor; bu iç geliştirici referansı, müşteri metni değil. |
| efatura.ts:769-773 | "TL karşılığı (kayıtlı tutar yok):" / değer yerine "—" | Belge üstünde sessiz bir boşluk — buyer'a "neden tutar yok" sorusu bıraktırabilir ama bu bir uç durum (satır 373'teki tip kontrolü hiç tetiklenmemeli, TL karşılığı her zaman `grandTotalTryMinor`'dan geliyor). |

### C. Ekran metinleri — `BillingClient.tsx` + `messages/tr.json` (bu API'nin tek tüketicisi)
Mevcut Türkçe metinler zaten iyi durumda (ör. `invoiceEmptyTitle/Body`, `invoiceUnreadable`,
`invoiceUnfiledHint`) — bunlar sorun değil, referans olması için listelendi:

| Anahtar | Metin |
|---|---|
| invoiceEmptyBody | "Bu kuruluş adına düzenlenmiş bir fatura kaydı yok. İlk fatura düzenlendiğinde burada listelenecek." |
| invoiceUnreadable | "Fatura geçmişi şu anda okunamadı. Bu, fatura olmadığı anlamına gelmez — sayfayı yenileyin." |
| invoiceUnfiledHint | "Zarf numarası olmayan belge mali mühür taşımaz." |
| invoiceAmountUnreadable | "okunamadı" |

## 2) Kritik yapısal bulgu — bu envanterin asıl sonucu

`BillingClient.tsx:711` ve `:717`, indirme linklerini düz `<a href="/api/.../export?format=...">`
olarak render ediyor — `fetch` + hata yakalama yok. **A bölümündeki 7 hata gövdesinin
hiçbiri kullanıcıya asla Türkçe olarak ulaşmıyor**; tarayıcı API'nin ham JSON'unu (veya
`unsupported_format` gibi İngilizce bir kelimeyi) doğrudan gösteriyor. `messages/tr.json`'daki
iyi metinler (`invoiceUnfiled`, `invoiceEmptyBody` vb.) yalnız *liste* ekranını kapsıyor;
"indir" tıklamasından sonraki hata yolunu kapsamıyor.

## 3) Kod tabanında bugün ulaşılamayan metinler
`efatura-integrator.ts` (blocked/rejected/not_configured/provider_unsupported outcome'ları,
sandbox adapter'ın throw ettiği hata) hiçbir route/UI tarafından çağrılmıyor — filing akışı
henüz bağlanmamış. Bu nedenle o metinler bugün "kullanıcıya dönen" kapsamında değil;
filing route'u eklendiğinde bu envanter tekrar gözden geçirilmeli.

## 4) En çok destek çağrısı üretecek 5 metin (öncelik sırası)

1. **`supplier_identity_not_configured` + `missing` dizisi** (route.ts:123-126) — **en yüksek risk**:
   müşteri ekranında `INVOICE_SUPPLIER_VKN` gibi bir ortam değişkeni adı görüyor, "hesabım
   hacklendi mi / sistem çökmüş" tepkisiyle destek açar.
   → Öneri: `t('invoiceExportUnavailable')`: *"Fatura şu anda oluşturulamıyor. Bu geçicidir ve
   sizinle ilgili değildir; ekibimiz bilgilendirildi, kısa süre içinde tekrar deneyin."*
   (missing listesi asla kullanıcıya gösterilmemeli — yalnız `logger.error` içinde kalmalı.)

2. **`invoice_not_found`** (route.ts:104) — müşteri "faturam silindi mi" diye endişelenip
   yazar; oysa çoğunlukla format/yetki karışıklığıdır.
   → Öneri: *"Bu fatura bulunamadı. Fatura numarasını ve hesabınızı kontrol edin; sorun
   sürerse destek ile paylaşın: [fatura no]."*

3. **`unsupported_format`** (route.ts:47-50) — kullanıcı hiç göremez normalde (linkler sabit
   xml/pdf), ama biri URL'i elle değiştirirse ham İngilizce JSON görür.
   → Öneri: *"Bu fatura biçimi desteklenmiyor. Lütfen XML veya PDF seçeneğini kullanın."*

4. **`unauthorized` / `no_tenant`** (route.ts:56, 61) — oturum düşmüşse müşteri "site bozuk"
   sanıp destek açar, oysa tek çözüm yeniden giriş.
   → Öneri (unauthorized): *"Oturumunuz sona ermiş. Devam etmek için tekrar giriş yapın."*
   → Öneri (no_tenant): *"Bu hesapla ilişkili bir kuruluş bulunamadı. Doğru hesapla giriş
   yaptığınızdan emin olun."*

5. **`invoice_lookup_failed` / `invoice_lines_invalid`** (route.ts:100, 130) — ikisi de "sistem
   hatası" sınıfında; kullanıcı ne yapacağını bilemez, tekrar denemek işe yarar mı bilmez.
   → Öneri (ortak): *"Fatura şu anda görüntülenemiyor. Birkaç dakika sonra tekrar deneyin;
   sorun devam ederse destek ekibimize fatura numarasıyla ulaşın."*

**Not:** Yukarıdaki 5 metnin tamamı için asıl kök neden aynı — API hataları Türkçe'ye hiç
çevrilmiyor çünkü indirme linkleri düz `<a href>`; bu yüzden metin düzeltmesi tek başına
yetmez, `BillingClient.tsx`'te linklerin `fetch` + hata yakalama + toast/inline mesaj akışına
taşınması gerekir (bu bir **öneri**dir, uygulanmadı — görev kapsamı salt okunur).

## Değişen dosyalar
Yok (salt okunur görev).

## Riskler
Yok — kod dokunulmadı.

## Açık sorular
- `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`'deki karar netleşince
  `foreignCurrencyFilingBlock` metni kullanıcıya mı yoksa yalnız operatöre mi gösterilecek?
  (Bugün hiçbir route çağırmıyor.)
- Filing (GİB'e gönderme) akışı bağlandığında `efatura-integrator.ts`'teki outcome mesajları
  için bu envanter genişletilmeli.

## Sonraki adım
Öneri: `BillingClient.tsx`'teki indirme linklerini `fetch`'e çevirip hata gövdelerini
`messages/tr.json`'a yukarıdaki önerilen karşılıklarla eklemek — ayrı bir görev (M8/billing
kapsamında `feat`/`fix` commit'i, bu görevin dışında).
