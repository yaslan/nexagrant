# TASK-MTRJSOWFH6B45 — e-Fatura go-live: destek gözüyle bağımsız doğrulama (2026-09-10)

**Ajan:** customer-support (CS-EN) · **Tarih:** 2026-09-10 · **Sprint:** SPRINT-S12 · **Dal:** dev

## (1) Ne yapıldı

Bu kart daha önce beş kez rapor üretti (`blockzincir-pm`, `blog-yazar`,
`blok-zincir-lead` ×3 — en sonuncusu 2026-09-08). Bir kod tarafı hazır
iddiası her yeniden gönderilişte yeniden ölçülür ([[fabrika-blocked-card-premise-may-hide-the-real-blocker]]
düsturu), o yüzden bugünkü iş önceki raporlara güvenmek değil, görev
metninin istediği beş şeyi **bugün, bu koddan** yeniden ölçmekti:

1. **Env değişken listesi (ad/tip/örnek).** `docs/EFATURA_SETUP.md`'de zaten var
   (12 değişken, "Doldurulacak tablo"). `grep`'le koda karşı doğrulandı: `src/lib/env.ts`'te
   tanımlı 12 değişkenle tablo birebir eşleşiyor. Tabloda hiçbir eksik/fazla yok.
2. **env.ts şeması.** Tüm 12 değişken `z.string().optional()` (veya `optionalUrl`) ile
   tanımlı. Şemayı atlayıp `process.env.INVOICE_SUPPLIER_*` / `process.env.EFATURA_INTEGRATOR_*`
   okuyan tek satır kod **yok** (aşağıda kanıt). Şemaya eklenecek bir şey çıkmadı.
3. **Kimlik bilgisi yokken davranış ölçüldü.** Üç ayrı katman test edildi:
   - `pnpm efatura:preflight` (temiz env) → dürüst kırmızı, çıkış kodu **1**, hangi
     bloğun neden eksik olduğunu adıyla söylüyor.
   - `/api/billing/invoices/<no>/export` rotası (`route.ts`) → tipli hata kodu
     (`supplier_identity_not_configured` vb.), **eksik değişken adları yanıt
     gövdesine hiç yazılmıyor** — sadece sunucu loguna (`logger.error`). Bu, geçmişte
     tam ters yönde bir sızıntıydı (TASK-MTUH6YKP6OQAX, aşağıda kanıt).
   - Ayarlar → Faturalandırma paneli (`BillingClient.tsx`) → rota koduna göre
     `switch` ile TR/EN `t()` anahtarına çevriliyor, toast olarak gösteriliyor; ham
     JSON hiçbir zaman ekrana çıkmıyor (buton + `fetch`, düz `<a href>` değil).
4. **Metin kalitesi ölçüldü (destek gözüyle).** 7 `invoiceExport*` anahtarının hem
   `tr.json` hem `en.json` içeriği okundu (aşağıda tam metin). Hepsi: kısa, jargonsuz,
   "sizinle ilgili değil" diyen empatik ton, destek aranacaksa hangi bilgiyi (fatura
   numarası) yanında götüreceğini söylüyor. **Değiştirilecek bir şey bulunmadı.**
5. **Runbook.** `docs/EFATURA_SETUP.md` "Go-live günü" bölümü zaten adım adım
   yazılıydı ama görev metninin istediği **"hangi tek komutla duman testi
   koşulacak"** sorusuna cevap yoktu — Adım 2 ve Adım 3 iki ayrı komuttu. Bunu
   kapattım: Adım 2'nin başına `&&` ile zincirlenmiş tek satırlık bir "duman
   testi" komutu eklendi, başarı/başarısızlık görünümü yazıldı. Ayrıca Adım 3'teki
   **bayat test sayısı** (`29/29`) düzeltildi — gerçek sayı bugün **43/43**
   (aşağıda kanıt); sabit sayı yerine "önemli olan FAILED olmaması" notu eklendi
   ki sayı yeniden kaydığında belge tekrar yalan söylemesin.

**Sonuç:** kart hâlâ **DIŞ GİRDİ BEKLİYOR** — entegratör kimlik bilgisi patronun
12-13 Eylül'de getireceği ticari bir şey, bugün kapatılamaz. Ama görev metninin
istediği "kimlik bilgisi gelmeden yapılabilecek her şey" **bugün itibarıyla
tamamen yapılmış durumda ve ben bunu bağımsız ölçtüm** — önceki turların iddiası
değil, bugünkü kanıt.

## (2) Kanıt — kopyalanmış gerçek çıktı

### 2.1 Preflight, temiz env, gerçek çıkış kodu (önceki bir denemede `head`'e borulama
çıkış kodunu maskeledi — düzeltilip tekrar koşuldu)
```
$ env -i PATH="$PATH" HOME="$HOME" npx tsx scripts/efatura-preflight.ts > /tmp/preflight_out.txt 2>&1
$ echo "REAL EXIT: $?"
REAL EXIT: 1
...
3. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL,
   EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

--- SONUÇ HÜKMÜ ---
📌 Fatura kaydı oluşturulur. Fatura belgesi üretilmez, sebep: satıcı kimliği eksik
   (INVOICE_SUPPLIER_NAME, ...). GİB'e gönderilmez, sebep: ... eksik.
```
Not: KDV bloğu bugün **hiçbir env değişkeni olmadan** `✅ TANIMLI` çıkıyor —
`INVOICE_VAT_RATE` 2026-09-09'da koddan tamamen kaldırıldığı ve oran artık
`vat-rates.ts`'teki ülke tablosundan geldiği için (önceki raporların KDV'yi
"eksik" gösteren çıktıları artık bayat).

### 2.2 Testler — 43/43, üç dosya
```
$ npx vitest run tests/efatura-unit.test.ts tests/efatura-integrator.test.ts tests/invoice-document.test.ts
 Test Files  3 passed (3)
      Tests  43 passed (43)
```

### 2.3 env.ts bypass yok
```
$ grep -rn "process\.env\.\(INVOICE_SUPPLIER\|EFATURA_INTEGRATOR\)" src scripts | grep -v "src/lib/env.ts"
(0 sonuç)
```

### 2.4 Adaptör kaydı hâlâ bilerek boş, fileInvoice hiçbir üretim yolundan çağrılmıyor
```
$ grep -n "ADAPTERS" -A2 src/lib/efatura-integrator.ts
163:const ADAPTERS: Record<...> = {
164:  sandbox: createSandboxAdapter,
165:};

$ grep -rn "fileInvoice(\|fileThrough(" src | grep -v "\.test\.\|efatura-integrator.ts"
(0 sonuç)
```
Bu **hata değil, belgelenmiş kasıt**: `invoice-writer.ts:44` — "Not in scope:
filing. `gibEnvelopeId` stays NULL". Kimlik bilgisi girilse bile adaptör
yazılmadan gönderim başlamaz; `docs/EFATURA_SETUP.md` bunu zaten söylüyor.

### 2.5 Destek metinleri — tam alıntı (her ikisi de kontrol edildi)
```
tr: invoiceExportUnavailable → "Fatura şu anda oluşturulamıyor. Bu geçicidir ve
    sizinle ilgili değildir; ekibimiz bilgilendirildi, kısa süre içinde tekrar deneyin."
en: invoiceExportUnavailable → "The invoice cannot be generated right now. This is
    temporary and not something you did — our team has been notified. Please try again shortly."

tr: invoiceExportNotFound → "...sorun sürerse destek ile fatura numaranızı paylaşın: {number}."
en: invoiceExportNotFound → "...if the problem continues, contact support with this
    invoice number: {number}."
```
Ham JSON/stack trace yok; teknik alan adları (`EFATURA_INTEGRATOR_*` vb.) hiçbir
kullanıcı metninde geçmiyor.

### 2.6 UI'de gönderim durumu rozeti (kimlik bilgisi yokken müşterinin gördüğü)
`BillingClient.tsx:775-786` — `gibEnvelopeId` boşsa amber `t('invoiceUnfiled')`
("Not filed with GİB") rozeti + `title` ipucu (`invoiceUnfiledHint`); basılan
belgede de `"ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali
değeri yoktur."` bandı (`src/lib/efatura.ts:219`). Sessiz düşme yok — her iki
yüzey de açıkça söylüyor.

## (3) Değişen dosyalar
- `docs/EFATURA_SETUP.md` — Adım 2'ye tek-komutluk duman testi eklendi
  (`pnpm efatura:preflight && pnpm test ...`), başarı/başarısızlık görünümü
  yazıldı; Adım 3'teki bayat `29/29` test sayısı `43/43`'e düzeltildi (+ sayı
  yeniden kayarsa belge yalan söylemesin diye "önemli olan FAILED olmaması" notu)
- Kod değişikliği **yok** — env.ts şeması zaten eksiksizdi, hata metinleri zaten
  destek kalitesindeydi, ikisine de dokunmaya gerek çıkmadı.
- `docs/agent-results/TASK-MTRJSOWFH6B45-customer-support.md` — bu rapor

## (4) Riskler
- **Doğrudan URL navigasyonu köşe durumu.** `BillingClient` artık `fetch` +
  `t()` eşlemesiyle indiriyor, ama biri export URL'sini elle tarayıcı adres
  çubuğuna yapıştırırsa (örn. destek ekibi bir linki kopyalayıp müşteriye
  gönderirse) ham `{"error":"supplier_identity_not_configured"}` JSON'ı hâlâ
  görünür — rota kasıtlı olarak `GET` ve doğrudan erişilebilir. Bugün desteklenen
  tek akış panel içindeki buton; destek ekibine "bu linki müşteriye doğrudan
  paylaşmayın, panel üzerinden indirtin" notu düşülebilir. Küçük ve gerçek bir
  artık risk — kapatmadım çünkü rotanın kendisini değiştirmek bu kartın kapsamı
  dışında (kapsam: env + metin + runbook).
- Diğer tüm bilinen riskler (adaptör yazımı takvimi, USD Faz 2 bağımlılığı,
  `TenantBillingIdentity` ekranı eksikliği) önceki raporlarda (`blok-zincir-lead-3`,
  `EFATURA_SETUP.md`) zaten doğru şekilde açık — burada tekrar etmiyorum.

## (5) Açık sorular
- Yok — bu turun kapsamındaki beş madde net ölçüldü, hepsi ya zaten doğruydu ya
  da düzeltildi. Ticari bilinmeyen (hangi entegratör) değişmedi.

## (6) Sonraki adım
- 12-13 Eylül: patron 12 değişkeni + entegratör seçimini getirdiğinde, operatör
  `docs/EFATURA_SETUP.md` "Go-live günü" bölümündeki tek-komutluk duman testiyle
  başlar.
- 14 Eylül: adaptör kartı (satıcıya özel, `ADAPTERS` sözlüğüne yeni giriş) geliştiriciye açılır.

## Platform beyanı
macOS (Darwin 25.6.0) üzerinde doğrulandı — `pnpm efatura:preflight` ve
`vitest` doğrudan bu makinede koşuldu (yukarıdaki komut çıktıları). Dokunulan
kod yolları (Zod env şeması, Next.js API route, React istemci bileşeni, statik
i18n JSON, Markdown belge) platforma özgü değil: süreç öldürme, dosya yolu
ayracı, kabuk/ikili adı, ekran/DPI veya mikrofon-kamera izni içermiyor. Bu
yüzden Linux/Windows'ta da aynı şekilde davranması beklenir; ayrıca doğrulamadım
çünkü kod yolunda platform dallanması yok.

## Hafıza
Kalıcı ve gelecekte faydalı iki şey `customer-support` hafızasına yazıldı (bkz.
`.agentspace/memory/agents/customer-support/`): (1) bir preflight/CLI'ın çıkış
kodunu ölçerken sonucu `head`/`tail` gibi bir borudan geçirmenin `$?`'yi borunun
son komutuna maskelediği, PIPESTATUS ya da ayrı dosyaya yönlendirme gerektiği;
(2) bu depoda "kod tarafı hazır" iddiasıyla gelen bloke kartların, önceki turda
doğrulanmış olsa bile her yeniden gönderilişte gerçek koda karşı yeniden
ölçülmesi gerektiği — bu turda gerçek bulgu env/metin değil, runbook'taki bayat
bir test sayısıydı.
