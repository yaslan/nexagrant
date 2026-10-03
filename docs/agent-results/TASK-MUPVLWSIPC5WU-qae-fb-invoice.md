# TASK-MUPVLWSIPC5WU#invoice-verify — Fatura E2E seed: orijinal migration ile tam yeşil + push

**Hüküm:** ONAY. 3 fatura spec'inin 16 testinin 16'sı da yeşil. Testler, orijinal (NOT VALID) migration'ın CI'daki gibi uygulandığı yerel DB'de koştu. Önceki kırmızı testin kök nedeni kanıtlandı. Dal push edildi, dev'e push edilmedi.
**Tip:** QA doğrulama (bug fix devamı)
**Platform:** mac (Darwin 27.0.0, Postgres localhost:5433, Playwright chromium). Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız mac var. Değişiklik yalnız test seed kodu (Prisma ve `withSystemScope`). Platforma bağlı kod yolu yok. CI'da (ubuntu) aynı `scripts/apply-migrations.sh` adımı koşuyor.

**Ajan:** QAE-FB · **Sprint:** FB-GAP-1 · **Dal:** `qae-fb/e2e-invoice-seed` (kod commit'i b2a7c302, inceleyen crw2-fb ONAY verdi)

## 1. Ne yapıldı

1. **Kısıtın yerel durumuna bakıldı.** `Invoice_fx_required_for_foreign_currency` şu durumdaydı: `convalidated = t`. Yani inceleme sırasında koşulan `VALIDATE CONSTRAINT` DB'de kalmıştı. Dosyadaki değişiklik geri alınmış olsa da DB ondan etkilenmişti. Bu, orijinal migration'ın ürettiği durum değil.
2. **Orijinal duruma dönüldü.** Yalnız kısıt düşürüldü (`ALTER TABLE "Invoice" DROP CONSTRAINT …`), kolonlara ve satırlara dokunulmadı. Sonra `scripts/apply-migrations.sh` CI'daki gibi iki kez koşuldu (`apply-order.txt` sırası). İki geçiş de exit 0 verdi. Kısıt **NOT VALID** (`convalidated = f`) olarak geri geldi. Migration dosyasına dokunulmadı (`git status` temiz).
3. **3 spec koşuldu, 16/16 yeşil.** Port 3000'de başka bir ajanın (befb-identity-seed) dev sunucusu çalışıyordu. Ona dokunulmadı, testler `E2E_PORT=3107` ile koşuldu.
4. **Kök neden kanıtlandı.** Kısıt düşürülünce "database itself refuses…" testi kırmızı oldu. Migration yeniden uygulanınca yeşile döndü. Ardından tam koşu tekrar 16/16 yeşil verdi.
5. **Push:** `git push -u origin qae-fb/e2e-invoice-seed` çalıştırıldı. Bu rapor aynı dalda commit'lendi.

> Not: Görev metninde "15/15" yazıyordu. Bu 3 spec'te **16** test var: locale 6, real-record 5, foreign-currency 5. Önceki rapor foreign-currency spec'i için 4 test listelemişti, o sayım hatalıydı.

## 2. Kanıt (kopyalanmış çıktı)

Kısıtın başlangıç durumu (inceleme kalıntısı):
```
Invoice_fx_required_for_foreign_currency|t
```
Kısıt düşürüldükten ve migration CI'daki gibi uygulandıktan sonra:
```
ALTER TABLE
==> [43/43] add-blog-post.sql
apply-migrations: 43 files applied as fabrika        (2. geçiş, exit=0)
Invoice_fx_required_for_foreign_currency|f|CHECK (((currency = 'TRY'::text) OR (("fxRate" IS NOT NULL) AND ("fxRate" > (0)::numeric) AND ("fxRateDate" IS NOT NULL) AND ("fxRateSource" IS NOT NULL) AND ("grandTotalTryMinor" IS NOT NULL)))) NOT VALID
```
Tam koşu (`E2E_PORT=3107 pnpm exec playwright test <3 spec> --workers=1`):
```
  ✓   1 invoice-export-locale.spec.ts:139 › a Turkish reader gets the Turkish page, with the rate the lines carry
  ✓   2 invoice-export-locale.spec.ts:154 › a link with no locale still renders Turkish — nothing existing changed
  ✓   3 invoice-export-locale.spec.ts:164 › an English reader gets an English page that still names GİB things in Turkish
  ✓   4 invoice-export-locale.spec.ts:181 › a second invoice at 10% withheld 5/10 states its own rates, not the first ones
  ✓   5 invoice-export-locale.spec.ts:201 › the filed XML is Turkish whatever the locale parameter says
  ✓   6 invoice-export-locale.spec.ts:216 › both pages render for a human, and are photographed
  ✓   7 invoice-export-real-record.spec.ts:138 › an anonymous caller gets no document at all
  ✓   8 invoice-export-real-record.spec.ts:150 › an id that exists nowhere is 404, not an invented invoice
  ✓   9 invoice-export-real-record.spec.ts:156 › another tenant invoice is 404, the same answer as one that does not exist
  ✓  10 invoice-export-real-record.spec.ts:166 › an unsupported format is refused before anything is read
  ✓  11 invoice-export-real-record.spec.ts:171 › the tenant own invoice renders that row, and nothing invented
  ✓  12 invoice-foreign-currency-export.spec.ts:189 › the USD document prices the sale in dollars and shows lira only as the stated equivalent
  ✓  13 invoice-foreign-currency-export.spec.ts:226 › the XML declares one currency and uses it on every amount
  ✓  14 invoice-foreign-currency-export.spec.ts:236 › the XML carries the TCMB rate the row was issued at
  ✓  15 invoice-foreign-currency-export.spec.ts:253 › the database itself refuses a foreign-currency invoice with no rate
  ✓  16 invoice-foreign-currency-export.spec.ts:282 › the printable page a customer sees agrees with itself
  16 passed (6.3s)
```
Kök neden kanıtı (kısıt yokken aynı test):
```
  ✘  1 invoice-foreign-currency-export.spec.ts:253 › the database itself refuses a foreign-currency invoice with no rate
    Error: expect(received).rejects.toThrow()
    Received promise resolved instead of rejected
  1 failed
```
Migration yeniden uygulandı (`mig_exit=0`, `convalidated=f`). Kalıntı kontrolü: kur alanı boş döviz faturası sayısı `0`. Tam koşu tekrarlandı:
```
  16 passed (9.5s)
```
Push:
```
 * [new branch]        qae-fb/e2e-invoice-seed -> qae-fb/e2e-invoice-seed
branch 'qae-fb/e2e-invoice-seed' set up to track 'origin/qae-fb/e2e-invoice-seed'.
```

## 3. Değişen dosyalar

- b2a7c302 (zaten vardı): `tests/e2e/invoice-export-locale.spec.ts`, `tests/e2e/invoice-export-real-record.spec.ts`, `tests/e2e/invoice-foreign-currency-export.spec.ts`. Bu commit `withSystemScope` ile Tenant, Invoice, User ve Membership seed'i ile temizliğini ekliyor.
- Bu adım: yalnız bu rapor (`docs/agent-results/TASK-MUPVLWSIPC5WU-qae-fb-invoice.md`).
- `prisma/migrations/add-invoice-fx-rate.sql` **değişmedi.**
- Yerel DB: kısıt düşürüldü ve orijinal migration ile yeniden oluşturuldu (NOT VALID).

## 4. Riskler

- **NOT VALID yeterli mi?** Evet, bu test için yeterli. NOT VALID bir CHECK yeni INSERT ve UPDATE işlemlerini zorlar, yukarıdaki yeşil/kırmızı döngü bunu gösteriyor. VALIDATE'e terfi ayrı bir karar. Migration yorumu da bunu söylüyor, bu iş kapsamında değil.
- **Yerel ortam kırılganlığı:** Kısıtı olmayan bir yerel DB bu testi kırmızı yapar. CI etkilenmez, çünkü `apply-migrations.sh` her koşuda kısıtı kuruyor.
- Ortak 5433 DB'sinde kısıt birkaç saniyeliğine düşürüldü. Bu sırada başka bir ajanın kur alanı boş döviz faturası yazma ihtimali çok düşük. Kontrol sonucu 0 satır.

## 5. Açık sorular

- Yok. crw2-fb'nin ONAY'ı geçerli. Gözlenen kırmızının kaynağı kod değil, ortamdı.

## 6. Sonraki adım

- Lider: `qae-fb/e2e-invoice-seed` → dev birleşmesi (PR: https://github.com/yaslan/fonbridge/pull/new/qae-fb/e2e-invoice-seed). Dev'e ben push etmedim.
