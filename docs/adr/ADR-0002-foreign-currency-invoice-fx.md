# ADR-0002 — Yabancı para birimli faturada TL karşılığı ve kur alanı

- **Durum:** **KABUL — Seçenek (b)** (patron kararı, 2026-09-08)
- **Tarih:** 2026-09-08
- **Bağlam kartı:** TASK-MTSWLWDONWA3W (ölçüm turu) · önceki tespit: TASK-MTRJSOWFH6B45 §2.4 · Sprint S12
- **Karar veren:** Patron (2026-09-08, LEED-EN aracılığıyla) · **Hazırlayan:** PM-EN
- **Bloke:** ~~Faz 2, TASK-MTSWL8ADKZKDM bitene kadar açılamaz~~ — **kalktı:** TASK-MTSWL8ADKZKDM 2026-09-08'de kanıtla kapandı. Faz 2 açılabilir.

## Bağlam

Fabrika'nın canlı fiyat kataloğu (plan `basic/pro/ultra`) **USD**'dir
(`docs/BILLING.md` §1, §9 — EUR merdiveni 2026-09-07'de emekliye ayrıldı).
`Invoice.currency` alanı `"TRY" | "EUR" | "USD"` kabul ediyor
(`prisma/schema.prisma:363`, `src/lib/efatura.ts:36`) ama şemada ne kur, ne de
TL karşılığı taşıyan bir alan var. UBL-TR XML üreticisi
(`src/lib/efatura.ts:213`) faturayı doğrudan `invoice.currency`'de yazıyor;
`InvoiceLineItem.unitPriceTRY` adı yanıltıcı — içine `currency` ne ise o
yazılıyor, TL'ye çevrilmiyor.

Bugün itibarıyla (2026-09-08) hiçbir `Invoice` satırı hiçbir ortamda
yazılmamış: yazma yolu (`src/lib/billing/invoice-writer.ts`) şu an
TASK-MTSWL8ADKZKDM kapsamında geliştiriliyor (bugün saat 19:58'de son
değişiklik, henüz commit edilmemiş). Yani bu, geçmişte olmuş bir hatayı
düzeltme değil — **ilk gerçek faturadan önce kapatılması gereken bir
tasarım eksiği.** `invoice-writer.ts` bugünkü haliyle `currency`'yi ödeme
olayından (`payment.currency`, Stripe) olduğu gibi alıp yazıyor; TCMB kuru
veya TL karşılığı hesaplamıyor.

Yasal risk teorik değil: **VUK 385 Sıra No.lu Genel Tebliğ**, yurt içi
işlemlerde döviz faturasının TL karşılığını göstermesini zorunlu kılıyor;
eksikse **VUK 352. madde II-7 bendi uyarınca ikinci derece usulsüzlük
cezası** uygulanır (kaynak: bkz. sonuç raporu §3).

## Gerçek müşteri dağılımı — ölçüldü, ama üretim değil

Bu ortamdan üretim (production) veritabanına erişim yok. Bağlı olan DB
`pnpm db:seed`'in yazdığı demo veri (`CLAUDE.md`): 5 kiracı (4 TR, 1 BE),
1 abonelik (etkin para birimi USD, plan kataloğundan), 0 fatura. Bu, gerçek
müşteri dağılımının **kanıtı değil**, sadece bu ortamda ölçülebilenin kaydı.
Üretimdeki gerçek dağılım (kaç kiracı hangi ülkede, kaç tanesi gerçekten
yurt dışı/ihracat niteliğinde) **prod DB erişimi olan biri tarafından ayrıca
ölçülmeli** — karar buna bağlı, bkz. sonuç raporu §2 ve "Açık sorular".

Yine de şu netleşti: `docs/BILLING.md` §4.2 (`TRY-FX-1`) zaten bugün
itibarıyla her `Subscription.provider = 'stripe'` olduğunu, TL tahsilatının
(iyzico) henüz açılmadığını doğruluyor. Yani **canlıya çıkacak ilk fatura
akışının tamamı USD üzerinden olacak** — bu bir kenar durum değil, varsayılan
yol.

## Karar

Üç seçenek değerlendirildi (P2'de kod yazılacak seçenek lider/patron
tarafından seçilecek):

### (a) Yalnız TRY fatura kes — döviz TL'ye ödeme/tahsilat anında çevrilsin
Abonelik USD fiyatlanmaya devam eder; fatura her zaman TRY kesilir, tutar
Stripe'ın tahsil ettiği anki karşılıktan TL'ye çevrilir.
- **Kod maliyeti:** Düşük — şema/XML değişmiyor, yalnız `invoice-writer.ts`
  içinde bir kur çevirme adımı eklenir.
- **Muhasebe etkisi:** Basit görünür ama VUK 280 fatura **tarihindeki** TCMB
  alış kurunu ister; Stripe'ın **tahsilat anındaki** efektif kuru bununla
  örtüşmeyebilir → kur farkı faturası ihtiyacı doğabilir, karmaşıklık
  faturalamadan muhasebeye kayar, kaybolmaz.
- **Çözdüğü segment:** Tüm müşteriler, ama yurt dışı kurumsal müşteri "USD
  fatura" beklentisini karşılamaz.
- **Risk:** Orta — kur farkı muhasebesi gizli borç gibi birikir.

### (b) Döviz faturası kes + kur/TL-karşılığı alanlarını ekle
`Invoice`'a kur ve TL karşılığı alanları eklenir; UBL-TR XML'ine
`PricingExchangeRate`/`TaxExchangeRate` blokları yazılır (bkz. sonuç
raporu §3 — alan adları ikincil kaynaklardan, birebir GİB şemasından teyit
edilmedi).
- **Kod maliyeti:** Orta-yüksek — migration, TCMB kur kaynağı entegrasyonu
  (bugün YOK, dış servis bağlanmalı), XML üretici değişikliği, hesaplama +
  yuvarlama testleri.
- **Muhasebe etkisi:** VUK 215/280/385'e tam uyumlu; en doğru çözüm.
- **Çözdüğü segment:** Tüm müşteriler, gelecekteki çok para birimli büyüme
  dahil.
- **Risk:** TCMB kaynağı olmadan bu faz açılamaz (dış bağımlılık); TCMB
  erişilemezse (bakım/kesinti) fatura kesme akışı ne yapacak — fallback
  politikası P2'de netleşmeli.

### (c) Yurt dışı müşteriye ihracat/istisna faturası (`invoiceType: ISTISNA`)
Şemada zaten var. Yalnız **gerçekten yurt dışı mukim** müşteri için TL
karşılığı zorunluluğu kalkar (VUK 385 yalnız yurt içi işlem için TL karşılığı
istiyor).
- **Kod maliyeti:** Düşük (tip zaten var) ama **tek başına yeterli değil** —
  dev DB'deki kiracıların çoğunluğu (4/5) TR; gerçek dağılım da benzerse
  müşteri tabanının çoğu bu seçeneğin kapsamı DIŞINDA kalır.
- **Risk:** Yanlış uygulanırsa (TR mukimi bir kiracıya istisna faturası
  kesilirse) haksız KDV istisnası = ayrı bir usulsüzlük riski. Kiracının
  gerçek mukimliği (VKN/TCKN + adres, `tenant.country` DEĞİL — bu alan
  şu an kendi beyanına dayanıyor) güvenilir şekilde doğrulanmalı.

## Öneri

**(b)'yi P2'nin ana çözümü olarak öner; (c)'yi (b)'den bağımsız, paralel bir
düzeltme olarak sürdür** — ikisi birbirini dışlamaz. Gerekçe: müşteri
tabanının bugün bilinen kısmı (dev DB'de 4/5) yurt içi, yani (c) tek başına
yetmiyor; (a) kur farkı muhasebesini faturalamadan sonraya öteliyor, sorunu
çözmüyor sadece taşıyor. (b), UBL-TR/VUK'a tam uyan tek seçenek ve gelecekteki
çok para birimli büyümeyi de karşılıyor. Bedeli TCMB entegrasyonudur — bu
bağımsız bir dış-servis kararı olarak ayrıca ele alınmalı (bkz. sonuç raporu
§4, TCMB soruları).

**Nihai kararı patron/lider verir** — bu ADR yalnız seçenekleri ve önerinin
gerekçesini sunar.

## Faz 2 DoD (taslağı — karar (b) ya da (c) çıkarsa)

Bkz. sonuç raporu §6.

## Etkilenen dosyalar (P2'de, bu turda DEĞİL)

- `prisma/schema.prisma` — `Invoice` modeline kur/TL-karşılığı alanları
- `prisma/migrations/*` — yeni migration
- `src/lib/efatura.ts` — XML üretimine `PricingExchangeRate`/`TaxExchangeRate`
- `src/lib/billing/invoice-writer.ts` — kur hesaplama adımı
- yeni: TCMB kur istemcisi (dış servis, henüz bağlı değil)
- `docs/BILLING.md`, `docs/DATA_MODEL.md`, `docs/EFATURA_SETUP.md`

---

## KARAR (2026-09-08 — patron)

**Seçenek (b) kabul edildi: döviz faturası kesilir, faturaya TCMB kuru ve TL
karşılığı alanları eklenir.** (a) ve (c) ana çözüm olarak reddedildi.

Bu kararın bağlayıcı sonuçları:

1. **Fatura kendi para biriminde kesilir** (USD/EUR), TRY'ye çevrilerek
   kesilmez. Abonelik fiyatlaması USD kalır.
2. **Kur esası VUK 280'dir:** fatura **düzenleme tarihindeki TCMB döviz alış
   kuru**. Stripe'ın tahsilat anındaki efektif kuru bu alana YAZILMAZ — (a)'nın
   reddedilme gerekçesi buydu.
3. **Kur ve TL karşılığı fatura kaydına yazılır** (yalnız XML'de hesaplanmaz):
   `Invoice` modeli kur alanlarını taşır, böylece kesilmiş bir fatura sonradan
   yeniden üretilebilir ve denetlenebilir (CLAUDE.md kural 7 — kanıt disiplini).
4. **`foreignCurrencyFilingBlock` engeli KALDIRILMAZ, koşullu hale gelir:**
   kur kaydı taşıyan belge geçer, taşımayan hâlâ `blocked` döner. Uydurma kur
   yazmak yasak — kur ya TCMB'den gelir ya da fatura kesilmez.
5. **(c) `ISTISNA` bu kararın kapsamı DIŞINDADIR.** Ayrı bir karar olarak açık
   kalır; gerçek mukimlik doğrulaması (`tenant.country` beyanı YETMEZ)
   çözülmeden uygulanmaz.

### TCMB kesintisi — KARARA BAĞLANDI (2026-09-08, patron: EVET)

**TCMB'ye ulaşılamadığında fatura kesme DURUR.** `SystemAlert` üretilir, ödeme
akışı kırılmaz, fatura TCMB dönünce kesilir. **Son bilinen kur KULLANILMAZ** —
"yeterince yakın" bir kur, mali belgeye uydurma rakam yazmaktır
(CLAUDE.md kural 6: işi kırma, alert üret; kural 7: kanıtsız rakam yok).

Uygulama notu (Faz 2 / TASK-MTT13PK0Z4ZLB):
- Kur çekilemezse `Invoice` satırı **yazılmaz** — yarım fatura üretilmez.
- `SystemAlert` tekrar koruması var (TASK-MTS79IGFJ6KRF); her denemede yeni
  satır yazılmamalı, aynı uyarı tekrarlanmamalı.
- Kesinti giderilince fatura kesilebilmeli — yani ödeme, faturasız kalmış
  olarak tekrar ele alınabilir durumda kaydedilmeli.

### Faz 2'de yapılacaklar — 2026-09-08 ağaç ölçümü

Zaten inen kısım (`c029e1c`): `EfaturaDocument.exchangeRate` tipi, UBL-TR
`PricingExchangeRate`/`TaxExchangeRate` blokları, `foreignCurrencyFilingBlock`,
`convertCurrencyMinor` (`src/lib/money.ts`), `tests/efatura-foreign-currency.test.ts`.

Eksik olan (ölçüldü, yok):
- `prisma/schema.prisma` → `Invoice` modelinde kur/TL karşılığı alanı **YOK**
  (yalnız `currency` var) → migration + RLS + `docs/DATA_MODEL.md`
- **TCMB kur istemcisi YOK** — repoda hiçbir TCMB çağrısı yok
- `src/lib/billing/invoice-writer.ts` → `exchangeRate` hiç geçmiyor; ödeme
  para birimini olduğu gibi yazıyor, kur adımı yok
- `docs/BILLING.md`, `docs/EFATURA_SETUP.md` güncellemesi

**Zamanlama:** GİB env'leri 2026-09-12/13 geliyor. Faz 2 o tarihe kadar
bitmezse USD abonelikler için hiç fatura gönderilemez (madde 4 gereği).

---

## Ara önlem — karar beklerken ne yapıldı (QA-EN, 2026-09-08, TASK-MTSWLWDONWA3W)

Bu ADR karara bağlanmadan kod yazılmadı; yalnız **karardan bağımsız** iki şey
kapatıldı. Üç seçenek de (a/b/c) bu ikisinde hemfikir:

1. **Belge kendi para birimini yazar.** Yazdırılabilir/PDF görünümünde her tutar
   hücresinde `₺` sabit kodluydu: "Para Birimi: USD" yazan bir belge tutarları
   `₺99,00` diye basıyordu — aynı belge iki farklı para birimi iddia ediyor ve
   tutarı günün kuru kadar eksik gösteriyordu. Kanıt (öncesi/sonrası + tarayıcı
   ekran görüntüsü): `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/`.
   Yanıltıcı `unitPriceTRY` / `subtotalTRY` … alan adları da para biriminden
   bağımsız adlara çevrildi; toplam hesabı artık faturanın kendi para biriminin
   minor unit'inde yuvarlanıyor.
2. **TL karşılığı olmayan yabancı para faturası GİB'e gönderilemez.**
   `foreignCurrencyFilingBlock` (`src/lib/efatura.ts`) + `fileThrough`
   (`src/lib/efatura-integrator.ts`) böyle bir belgeyi adaptöre hiç
   ulaştırmadan `blocked` ile geri çevirir. Uydurulmuş bir kur, mali bir belge
   üzerinde uydurulmuş bir rakam olurdu; kursuz gönderim ise VUK 352 II-7.
   Bu bir **ret**tir, tahmin değil — ve karar çıktığında tek bir yerden
   gevşetilir.

**Bunun kapatMADIĞI şey:** XML hâlâ TL karşılığı ve kur taşımıyor (F-2). Yani
karar hâlâ gerekli. Zamanlama riski: `TASK-MTRJSOWFH6B45`'e göre GİB env'leri
**2026-09-12/13** hafta sonu geliyor; karar o tarihten önce verilmezse TL dışı
abonelikler için hiç fatura GİB'e gönderilemez (yukarıdaki 2. madde gereği).
Bu, sessizce yanlış fatura kesmekten iyidir ama **fatura kesilememesi de bir
go-live blokerıdır** — kararın 12 Eylül'den önce verilmesi gerekiyor.
