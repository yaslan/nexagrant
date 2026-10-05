# TASK-MTSWLWDONWA3W — Yabancı para faturada TCMB kuru (QA 4. tur: HEAD'de kapanış)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-09 · **Tip:** doğrulama + kalıntı temizliği
**Ölçülen ağaç:** `d737759` (HEAD) · **Önceki tur:** `-blok-zincir-denet-i-3.md` (`8118b54`'te ölçüldü)

## Karar

**Kapanabilir.** 3. turda doğrulanan davranış HEAD'de bire bir duruyor ve 3. turun bıraktığı
tek açık iş — `NOT VALID` kısıt — bu turda kapatıldı. Yeni kusur bulunmadı.

## 1. Ne yapıldı

1. **Bayatlık kontrolü.** 3. tur `8118b54`'te ölçülmüştü; HEAD ile arasında yalnız
   `d737759` (hafıza notu, iki markdown dosyası) var — ürün kodunda tek satır değişiklik yok:
   ```
   $ git diff --stat 8118b54..HEAD
    .../a-record-is-not-a-document.md            | 23 ++++++
    .../my-own-verification-report-goes-stale.md | 19 ++++
   ```
   Buna rağmen ölçüm tekrarlandı: arada başka ajanların **commit'lenmemiş** KDV işi ağaçta
   duruyor (`src/lib/efatura.ts`'te `calculateInvoiceTotals` artık `vatOnNetMinor` kullanıyor)
   ve fatura toplamlarına dokunuyor.
2. **Aynı gerçek yol yeniden koşuldu** (canlı Postgres + gerçek TCMB bülteni + gerçek
   `fileThrough`), üretilen belgeler 3. turun commit'li kanıt dosyalarıyla **bayt bayt**
   karşılaştırıldı.
3. **3. turun Risk 3'ü kapatıldı:** kısıt `NOT VALID` durumundaydı, çünkü 2. turun bıraktığı
   iki sonda satırı (biri kursuz USD) veritabanında duruyordu. Satırlar **benim kendi
   kalıntım**; silindi ve `VALIDATE CONSTRAINT` koşuldu.

## 2. Kanıt

### 2.1 HEAD'de üretilen belge, 3. turdakiyle aynı belge

```
$ pnpm exec tsx docs/agent-results/.../probe-fx-verify-r3.mts   # yeniden üretti
$ git diff --stat docs/agent-results/TASK-MTSWLWDONWA3W-evidence/
 08-after-fx-note-TRY.html  | 2 +-
 08-after-fx-note-TRY.xml   | 2 +-
 08-after-fx-note-USD.html  | 2 +-
 08-after-fx-note-USD.xml   | 2 +-
```
Dört dosyanın tamamında değişen tek satır `<cbc:UUID>` (her kesimde yeni ETTN). Kur satırı,
TL karşılığı ve `cbc:Note` birebir aynı:

```
XML : <cbc:Note>TCMB döviz alış kuru (2026-09-08): 1 USD = 48,3727 TRY
      — ödenecek genel toplamın TL karşılığı: 4.788,90 TRY</cbc:Note>
HTML: TL karşılığı: ₺4.788,90
```
KDV işi ağaçtayken de toplam kaymadı: `document payable grand total: 99.00 USD (charge was 99.00) -> MATCH`.

Tam çıktı: `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/11-GREEN-r4-head-rerun.txt`

### 2.2 Kısıt artık NOT VALID değil

```
constraint before: [{"convalidated":false}]
fixture tenant: {"slug":"qa-fx-1788888018115"}          <- 2. turun sondası, 2026-09-08 17:20
invoices on it:  [{"number":"...-USD","fxRate":null}, {"number":"...-TRY","fxRate":null}]
invoices on any OTHER tenant: 0                          <- silinen hiçbir gerçek veri yok
invoices deleted: 2 | tenant deleted: 1
ALTER TABLE "Invoice" VALIDATE CONSTRAINT ...
constraint after:  [{"convalidated":true}]
invoice rows left in the database: 0
```
Kanıt: `.../12-validate-constraint.txt` · sonda: `.../probe-validate-constraint.mts`

Kısıt doğrulandıktan sonra aynı yol yine koşuldu ve davranış değişmedi:
```
TL math: round(9900 * 48.3727) = 478890 vs stored 478890 -> MATCH
fileThrough(USD, kurlu)    -> filed=true, reachedAdapter=true
fileThrough(rate-less USD) -> blocked FOREIGN_CURRENCY_NO_TL_EQUIVALENT, reachedAdapter=false
INSERT of a rate-less USD invoice: REJECTED -> Code 23514
Invoice rows after: 0 (delta 0)   <- bu tur hiçbir kalıntı bırakmadı
```

### 2.3 Kapı (bu turda, HEAD + diğer ajanların ağaçtaki işi)

```
$ pnpm gate   -> exit 0
  lint       0 error, 2 warning  (ikisi de TASK-MTSYH8LDGV5YU sondası — başka ajanın dosyası)
  typecheck  exit 0
  test       Test Files 130 passed | 2 skipped · Tests 1547 passed | 8 skipped
  i18n       ✅  ·  rls:check 43/43  ·  rls:verify fabrika_app rolüyle gerçekten ölçüldü
```
Tam log: `docs/agent-results/TASK-MTT1XL9NP2QYU-evidence/03-gate-full.txt` (tek koşu, iki kartı
birden kapsıyor).

### 2.4 Sondanın yanıltıcı görünen dört satırı (kusur değil)

Sonda çıktısındaki şu satırlar **3. turda da aynıydı** ve sonda tarafı biçim farkından
kaynaklanıyor, üründen değil:

| satır | neden false |
|---|---|
| `XML mentions a TRY amount anywhere?` | `currencyID="TRY"` arıyor; TL rakamı `cbc:Note` metninde, öznitelikli bir tutar elemanında değil (bilinçli — 3. tur Risk 1) |
| `XML/HTML TRY figure ... as a number?` | `4788.90` arıyor; belge tr-TR biçiminde `4.788,90` yazıyor |
| `HTML mentions kur?` | `/\bkur\b/` arıyor; belgede kelime "kuru" |

Belgede rakamın gerçekten olduğu, yukarıdaki `grep` çıktısı ve
`10-browser-USD-with-tl-equivalent.png` ekran görüntüsüyle sabit.

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/probe-validate-constraint.mts` (yeni sonda)
- `docs/agent-results/TASK-MTSWLWDONWA3W-evidence/11-GREEN-r4-head-rerun.txt`,
  `.../12-validate-constraint.txt` (kanıt)
- Ürün kodunda **değişiklik yok** (bu tur yalnız ölçüm + veritabanı kalıntısı temizliği).

## 4. Riskler

1. **Prod'da `VALIDATE CONSTRAINT` ayrıca koşulmalı.** Bu tur yalnız *dev* veritabanını
   doğruladı. Prod'da kursuz eski bir yabancı para satırı varsa komut hata verir — o satırlar
   önce elden geçirilmeli. Gönderim kapısı onları zaten `blocked` ediyor.
2. TL toplamının XML'de yapısal bir elemanda değil `cbc:Note`'ta durması (3. tur Risk 1)
   **hâlâ entegratöre sorulmadı**; 2026-09-12/13 GİB görüşmesinin sorular listesinde.
3. Ağaçtaki KDV işi (TASK-MTT1WUUS7MN7R) henüz commit'li değil; KDV oranı alıcının ülkesine
   göre değişince yabancı para faturasının **TL karşılığı da** değişir. Bu tur toplamların
   kaymadığını ölçtü, ama o kart inince aynı sonda bir kez daha koşulmalı.

## 5. Açık sorular

1. Entegratör TL toplamını yapısal olarak da istiyor mu? (vendor görüşmesi)
2. `ISTISNA` (ihracat) faturası kuraldan muaf mı? ADR-0002 kapsam dışı bıraktı.

## 6. Sonraki adım

- Kart kapatıldı (`done`).
- Prod açılışında: `.sql` migration'ları elle uygula → `VALIDATE CONSTRAINT` → aynı sondayı
  sandbox entegratöre karşı bir kez koştur.
