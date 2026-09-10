# TASK-MTTUSZF4QSFGU — Faturadaki KDV/tevkifat etiketleri ve her dilde Türkçe kalan rol etiketleri

**Ajan:** geli-tirici (BE-EN) · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-10
**Platform:** macOS (Darwin 25.6.0) — ayrıntı için "Platform beyanı" bölümü.

---

## 1. Ne yapıldı

Kart iki yarıya ayrılmayı istiyordu; kod da tam olarak öyle ayrıldı.

### (A) GİB'e giden, hukuken Türkçe kalan terimler — ÇEVRİLMEDİ

Bunlar ürün metni değil, GİB ve UBL-TR 1.2.1'in bir şeye verdiği addır; İngilizcesi
mevzuatta var olmayan bir şeyi adlandırırdı. `src/lib/efatura.ts` içinde
`GIB_TURKISH_TERMS` adıyla tek bir yerde, gerekçeleriyle birlikte listelendi:

| Terim | Nerede | Neden Türkçe kalıyor |
|---|---|---|
| `VKN` / `TCKN` | XML'de `cac:PartyIdentification/@schemeID`, sayfada alıcı kutusu | Vergi Kimlik Numarası / T.C. Kimlik Numarası. Sayfa ile XML aynı numarayı farklı adla anmamalı. |
| `ETTN` | XML `cbc:UUID`, sayfa başlığı | Evrensel Tekil Tanımlama Numarası — GİB şemasında İngilizce karşılığı yok. |
| `e-Fatura` / `e-Arşiv Fatura` | Sayfa belge tipi başlığı | Belge türlerinin kendi adı. "e-Invoice" başka (mevzuatsız) bir şeyi adlandırır. |
| `KDV` / `Tevkifat` | XML `cac:TaxScheme/cbc:Name` | Dosyalanan vergi şeması adları. |
| `TICARIFATURA` / `TEMELFATURA` / `EARSIVFATURA`, `SATIS` / `ISTISNA` / `TEVKIFAT` | XML ve sayfa "Senaryo" / "Fatura Tipi" değerleri | UBL-TR kod değerleri. Belgeden doğrudan basılıyor, hiçbir etiket tablosundan geçmiyor. |

Bilinçli bir ayrıntı: `GIB_TURKISH_TERMS.kdvSchemeName` / `withholdingSchemeName`
**XML üretici tarafından okunmuyor** — XML kendi literal'lerini koruyor. Böylece bu
modülde bir etiket düzenleyerek GİB'e gidenin değiştirilmesi mümkün değil; sabitler
yalnız "bilinçli küme" tek yerde grep'lenebilsin diye orada.

Ayrıca `UNFILED_NOTICE` (XML'in `cbc:Note` alanına giden "ÖRNEK BELGE — GİB'e
gönderilmemiştir…" cümlesi) **Türkçe bırakıldı**; yazdırılabilir sayfa artık kendi
çevrilmiş uyarısını basıyor. Yani banner'ın çevrilmesi dosyalanacak belgenin tek
kelimesini değiştiremiyor.

### (B) Kullanıcıya gösterilen ürün metni — `messages/{tr,en}.json` → `invoice.*`

`generateEfaturaHtml()` içindeki 28 sabit Türkçe metin katalogda `invoice.*` ad alanına
taşındı (iki dile de eklendi, CLAUDE.md kural 8). `tr` değerleri şablonun bugüne kadar
taşıdığı literal'lerin **karakteri karakterine** aynısı — Türkçe sayfa değişmedi
(kanıt: §2.2 diff).

Kalıp icat edilmedi, `src/lib/document-exporter.ts`'teki `CATALOGS` deseni yeniden
kullanıldı: `generateEfaturaHtml` React dışı senkron bir fonksiyon, `useTranslations()`
de `await getTranslations()` de kullanamaz; katalog `messages/<locale>.json`'dan doğrudan
okunuyor, bir dilde eksik anahtar burada **tip hatası** oluyor.

Locale yolu da mevcut desenden alındı (`src/app/api/documents/export/route.ts:46`):
`?locale=en` → İngilizce sayfa, parametresiz → Türkçe. `BillingClient` locale'i yalnız
`format=pdf` (HTML görünüm) için gönderiyor; **XML'e locale gitmiyor**.

### KDV / tevkifat oranları: zaten veriden türüyor, doğrulandı

Kart "kodda sabit yazılmış oran varsa veriden türet" diyordu. Süpürme sonucu:

- KDV oranı: `src/lib/billing/vat-rates.ts` (kaynaklı ülke tablosu) → `vat-rate.ts:resolveVatRate`
  → `invoice-writer.ts:411` → satırın `vatRate` alanı → sayfa. Kodda sabit oran **yok**.
- Tevkifat oranı etiketi: `withholdingRateLabel()` (TASK-MTU2Y588AL1XQ, commit `ccc15b7`)
  satırların kendi `withholdingRate` değerinden türüyor. Sabit "9/10" **yok**.
- Bu turda yapılan: iki etiketin **çevresindeki** metni de sabit olmaktan çıkarmak ve
  yüzde işaretinin yerini dile bağlamak (`%20` / `20%`).

### Yan etki olarak düzelen gerçek hata: birim etiketi

`${l.quantity} Adet` satırı `unitCode`'u tamamen yok sayıyordu. `invoice-writer.ts` her
abonelik satırını `unitCode: 'MON'` ile yazdığı için, dosyalanan XML `unitCode="MON"`
derken **sayfa aynı satırı "1 Adet" diye faturalıyordu** — aynı satışı iki belge farklı
anlatıyordu. Bunu "Adet" adında bir katalog anahtarına taşımak yalanı sabitlemek olurdu;
birim artık satırın kendi `unitCode`'undan türüyor (`C62` → Adet/pcs, `MON` → Ay/month),
**tanınmayan kod için kelime uydurulmuyor**, ham kod basılıyor (VAT tablosunun kaynaksız
ülkeye yaptığının aynısı). Bu kartın kapsamındaki tek davranış değişikliği budur ve
Türkçe sayfadaki tek diff satırıdır.

---

## 2. Kanıt

### 2.1 UBL-TR XML değişmedi (kartın istediği diff)

4 fikstür fatura (20/10/0 KDV × 9/10, 5/10, tevkifatsız) değişiklik öncesi ve sonrası
aynı üreticiyle render edildi:

```
### XML files compared (must be byte-identical):
  IDENTICAL  vat0-nowh.xml
  IDENTICAL  vat10-wh9.xml
  IDENTICAL  vat20-wh5.xml
  IDENTICAL  vat20-wh9.xml

### cbc:Name fields in the filed XML, before vs after:
  (no difference)
```

### 2.2 Türkçe sayfanın TAMAMI aynı — tek istisna, yukarıdaki birim hatası

```
### Turkish page diff (vat20-wh9.tr.html):
96c96
<       <td style="... text-align: center;">1 Adet</td>
---
>       <td style="... text-align: center;">1 Ay</td>
```

### 2.3 İki tevkifat oranı × iki KDV oranıyla GERÇEK render (her iki dilde)

Üretici çıktısından çekilen toplamlar satırı:

```
----- vat20-wh9 [tr] -----          ----- vat20-wh9 [en] -----
  Ara Toplam (Matrah):                Subtotal (taxable base):
  Hesaplanan KDV (%20):               VAT charged (20%):
  Tevkifat Tutarı (9/10):             Withholding — tevkifat (9/10):
  ÖDENECEK GENEL TOPLAM:              TOTAL PAYABLE:

----- vat20-wh5 [tr] -----          ----- vat20-wh5 [en] -----
  Hesaplanan KDV (%20):               VAT charged (20%):
  Tevkifat Tutarı (5/10):             Withholding — tevkifat (5/10):

----- vat10-wh9 [tr] -----          ----- vat10-wh9 [en] -----
  Hesaplanan KDV (%10):               VAT charged (10%):
  Tevkifat Tutarı (9/10):             Withholding — tevkifat (9/10):

----- vat0-nowh [tr] -----          ----- vat0-nowh [en] -----
  Hesaplanan KDV (%0):                VAT charged (0%):
  (tevkifat satırı basılmadı)         (no withholding row)
```

### 2.4 Gerçek HTTP — canlı route üzerinden, gerçek DB kaydıyla

`tests/e2e/invoice-export-locale.spec.ts` iki fatura yazar (20% KDV / 9-10 tevkifat ve
10% KDV / 5-10 tevkifat, ikisi de `unitCode: 'MON'`), oturum çereziyle route'u çağırır:

```
Running 6 tests using 1 worker
  ✓  1 › a Turkish reader gets the Turkish page, with the rate the lines carry (996ms)
  ✓  2 › a link with no locale still renders Turkish — nothing existing changed (40ms)
  ✓  3 › an English reader gets an English page that still names GİB things in Turkish (47ms)
  ✓  4 › a second invoice at 10% withheld 5/10 states its own rates, not the first ones (45ms)
  ✓  5 › the filed XML is Turkish whatever the locale parameter says (42ms)
  ✓  6 › both pages render for a human, and are photographed (239ms)
  6 passed (6.9s)
```

Kareler (gerçek tarayıcı, gerçek route):
- `docs/agent-results/TASK-MTTUSZF4QSFGU-screenshots/invoice-9-10-tr.png`
- `docs/agent-results/TASK-MTTUSZF4QSFGU-screenshots/invoice-9-10-en.png`

İngilizce karede görünen: `SAMPLE DOCUMENT`, `BILL TO (BUYER)`, `VAT charged (20%)`,
`Withholding — tevkifat (9/10)`, `TOTAL PAYABLE`, `1 month` — ve aynı sayfada Türkçe
kalanlar: `e-Fatura`, `VKN`, `ETTN`, `TICARIFATURA`, `TEVKIFAT`, `tevkifat`.

### 2.5 i18n kapısı

```
$ pnpm i18n:check
  Keys in messages/tr.json: 1440 → (invoice.* sonrası her iki katalogda +28)
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
```

### 2.6 Birim testler

```
$ pnpm test
 Test Files  141 passed | 2 skipped (143)
      Tests  1684 passed | 8 skipped (1692)
```

Yeni `tests/invoice-i18n.test.ts` — 14 test. Aralarında (A) yarısını kilitleyen üç test
var: gelecekte "hepsini çevirelim" geçen bir düzenleme `<cbc:Name>VAT</cbc:Name>`
üretirse burada kırmızıya döner.

### 2.7 `pnpm gate`

Kapı, **kendi başlattığı sunucuya karşı**, izole bir worktree'de koşturuldu (gerekçe
aşağıda, Riskler §1):

```
$ pnpm gate     # db:generate → lint → typecheck → test → i18n:check → rls:check → rls:verify → test:e2e
...
  1 failed
    [chromium] › tests/e2e/m9-ics-download.spec.ts:67:7 › M9 .ics download › …
  1 skipped
  151 passed (3.9m)
```

Kapı **YEŞİL DEĞİL** ve saklamıyorum: 152 e2e testinden 1'i kırmızı. O tek test benim
değişikliğimden bağımsız — aynı worktree'de dosyalarımı `git checkout` ile HEAD'e geri
alıp tek başına koşturdum, **aynı şekilde kırmızı**:

```
$ git checkout -- src messages tests      # benim değişikliğim yok
$ npx playwright test tests/e2e/m9-ics-download.spec.ts
  ✘  1 › the downloaded file is RFC 5545 conformant and keeps one identity per brief (0ms)
    Unique constraint failed on the constraint: `User_email_key`
  1 failed
```

Ana ağaçta ayrıca doğrudan koşturulanlar:

```
$ pnpm typecheck   → temiz
$ pnpm lint        → 0 error, 2 warning (ikisi de başka bir kartın docs/agent-results/
                     TASK-MTSYH8LDGV5YU-evidence/ dosyalarında, önceden var)
$ pnpm rls:check   → ✅ 44 tenant-scoped model, hepsinin politikası kayıtlı
$ pnpm rls:verify  → ✅ 44 tabloda izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

### 2.8 Commit

`c7dab14` — `i18n(invoice): translate the printed invoice, keep the GİB terms Turkish`

```
$ git show --name-only --oneline HEAD
c7dab14 i18n(invoice): translate the printed invoice, keep the GİB terms Turkish
docs/agent-results/TASK-MTTUSZF4QSFGU-geli-tirici.md
docs/agent-results/TASK-MTTUSZF4QSFGU-screenshots/invoice-9-10-en.png
docs/agent-results/TASK-MTTUSZF4QSFGU-screenshots/invoice-9-10-tr.png
src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx
src/app/api/billing/invoices/[id]/export/route.ts
src/lib/efatura.ts
tests/e2e/invoice-export-locale.spec.ts
tests/invoice-i18n.test.ts
```

(Bu satır, raporun kendisi commit'e dahil olduğu için bir `--amend` turu sonrası
düzeltildi; kod içeriği değişmedi, yalnız hash satırı `c7dab14`'e getirildi.)

Commit'te **yalnız kendi dosyalarım** var; `messages/*.json` yok, çünkü içeriği
zaten §6.3'te anlatılan `6513085` ile HEAD'e girmişti. Commit öncesi
`git log --oneline -3`, sonrası `git show --name-only` koşturuldu; pre-commit kapısı
(`eslint` + `tsc --noEmit`) "✓ Kapı temiz (staged kapsamı)" verdi.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/efatura.ts` | `InvoiceLocale`, `INVOICE_CATALOGS`, `GIB_TURKISH_TERMS`, `percentLabel()`, `unitLabel()`; `generateEfaturaHtml(invoice, locale='tr')` — 14 sabit metin katalogdan okunuyor. XML üreticiye dokunulmadı. |
| `src/app/api/billing/invoices/[id]/export/route.ts` | `?locale=` okunuyor, yalnız HTML üreticisine geçiyor. XML yolu değişmedi. |
| `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` | İndirme isteğine `&locale=` ekleniyor (yalnız `format=pdf`). |
| `messages/tr.json`, `messages/en.json` | `invoice.*` — 28 anahtar, iki dilde. **Yalnız bu blok** eklendi. |
| `tests/invoice-i18n.test.ts` | Yeni, 14 birim testi. |
| `tests/e2e/invoice-export-locale.spec.ts` | Yeni, 6 gerçek-HTTP e2e testi. |
| `docs/agent-results/TASK-MTTUSZF4QSFGU-screenshots/*.png` | 2 kanıt karesi. |

---

## 4. Riskler

1. **Kapı, ödünç alınan dev sunucusuna karşı koşturulamaz.** :3000'de başkasının
   başlattığı bir `next dev` çalışıyor ve `INVOICE_SUPPLIER_*` değişkenleri onda yok;
   `reuseExistingServer` yüzünden Playwright onu devralıyor ve fatura e2e'leri **503**
   alıyor. Next 16 aynı dizinde ikinci bir dev sunucusuna izin vermiyor
   ("Another next dev server is already running"). Kardeş süreci öldürmek yasak olduğu
   için kapı, `git worktree` ile açılmış izole bir kopyada (ayrı port 3111, ayrı `.next`)
   koşturuldu. **Bu benim değişikliğimin değil, ortamın durumu** — ama şu an bu makinede
   `pnpm gate` çalıştıran herkes aynı 503'leri alır.
2. **Para biçimi her iki dilde de `tr-TR`.** İngilizce sayfada tutarlar hâlâ
   `₺2.500,00` biçiminde. Bilinçli bırakıldı: mali bir belgede binlik/ondalık ayıracını
   dile göre değiştirmek, dosyalanan XML'in ondalık gösterimiyle sayfayı ayrıştırır.
   Yine de İngilizce okuyan biri için yanlış okuma riski var — karar bir sonraki tura.
3. **`exchangeRateStatement()` Türkçe kaldı** ("TCMB döviz alış kuru …"). Bu cümle
   yazdırılabilir sayfa ile **XML'in `cbc:Note` alanı arasında paylaşılıyor**; çevirmek
   dosyalanan belgeyi değiştirirdi. Dövizli faturanın İngilizce çıktısında bu tek satır
   Türkçe görünecek. Bilinçli; §5'te açık soru olarak duruyor.
4. **`footerFiled` İngilizce'ye çevrildi.** VUK 213 atfı ve kurum adları Türkçe
   korunarak ("Vergi Usul Kanunu", "Gelir İdaresi Başkanlığı") İngilizce bir okuma
   verildi. Mali belge dosyalanan XML'dir, HTML onun sunumudur — yine de bunun bir mali
   müşavir onayı olmadığını açıkça belirtiyorum (§5).

---

## 5. Açık sorular

1. Dövizli faturanın İngilizce çıktısındaki TCMB cümlesi (Risk §3) çevrilsin mi, yoksa
   XML ile birebir aynı kalması mı doğru? Mali müşavir sorusu.
2. `footerFiled` İngilizce metni (Risk §4) mali müşavir onayından geçmeli mi?
3. `unitLabel` bugün yalnız `C62` ve `MON` tanıyor — `invoice-writer.ts` başka bir
   UN/ECE kodu yazmaya başlarsa sayfa ham kodu basar (bilinçli). Katalog büyütülecekse
   hangi kodlar?

## 6. Yolda görülen, DÜZELTİLMEYEN bitişik sorunlar (adıyla bildiriliyor)

1. **`tests/e2e/m9-ics-download.spec.ts` — `User_email_key` çakışması.** Fixture
   `m9-e2e@fabrika.test` e-postalı kullanıcıyı **id ile** upsert ediyor, e-posta ise
   benzersiz; paylaşılan DB'de aynı e-postayı başka bir id taşıdığı anda beforeAll
   patlıyor. Pristine HEAD'de de kırmızı (kanıt §2.7). Panodaki
   TASK-MTUI9ZBK7W4JY'nin ("paylaşılan kiracıyı kirletiyor") aynı sınıfı.
2. **`.env` yerel dev ortamında `INVOICE_SUPPLIER_*` yok**, bu yüzden elle başlatılmış
   bir dev sunucusuna karşı fatura e2e'leri 503 alıyor (Risk §1). Değişkenler yalnız
   `playwright.config.ts`'in kendi başlattığı sunucuya veriliyor.
3. **`messages/{tr,en}.json` üzerindeki `invoice.*` bloğum başkasının commit'ine girdi.**
   28 anahtarın tamamı `6513085 i18n(pipeline): move the board header into the
   catalogues…` (blok-zincir-dev, TASK-MTV4YSO4SEMGG) commit'inde. Veri kaybı yok,
   içerik birebir doğru — yalnız **atıf yanlış**. Paylaşılan `dev` dalında geçmişi
   düzeltmeye çalışmadım; not olarak bırakıyorum.

## 7. Sonraki adım

- §5'teki iki mali-müşavir sorusu bir karta bağlanmalı.
- Bitişik sorun #1 ve #2 kendi kartlarını hak ediyor (ikincisi kapıyı bu makinede
  sistematik olarak yanıltıyor).

---

## Platform beyanı

- **Doğrulandığı platform:** macOS (Darwin 25.6.0, arm64). Birim testler, `i18n:check`,
  `rls:check`, `rls:verify`, `lint`, `typecheck` ve Playwright/Chromium e2e'leri burada
  koştu; kareler burada alındı.
- **Windows / Linux: koşulamadı** — bu oturumda o platformlar yok.
- **Dokunduğum kod yolu platforma bağlı DEĞİL** ve bunu koddan söylüyorum: değişiklik
  saf string/şablon üretimi (`src/lib/efatura.ts`), bir query parametresi okuması
  (`route.ts`) ve bir `fetch` URL'i (`BillingClient.tsx`). Süreç öldürme, dosya yolu,
  kabuk/ikili adı, kısayol metni, ekran/DPI, mikrofon-kamera izni **yok**. Katalog
  `import`'ları bundler üzerinden çözülüyor, `path.join` yok. Dolayısıyla Windows ve
  Linux'ta çıktı aynıdır.
- **Platforma bağlı olan tek şey doğrulama yöntemiydi**, ürün değil: izole worktree
  kurulumu `cp -al` (APFS hardlink) kullanıyor. Linux'ta aynısı çalışır; Windows'ta
  `cp -al` yoktur, orada worktree'ye ayrı bir `pnpm install` gerekir.
