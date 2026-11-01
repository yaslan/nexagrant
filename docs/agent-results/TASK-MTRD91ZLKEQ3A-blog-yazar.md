# TASK-MTRD91ZLKEQ3A — Ayarlar → Faturalandırma paneli: uydurma rakam kalmadı

**Ajan:** blog-yazar · **Tarih:** 2026-09-07 · **Branch:** dev

## 1. Ne yapıldı

### Önce ölçtüm — kartın iddiası kısmen BAYAT

Kart "panel uydurma kota gösteriyor (3/6 koltuk, 500 kredi) + emekli `team` plan
id'si" diyor. Ölçüm:

| Kartın iddiası | Ölçüm | Sonuç |
|---|---|---|
| Panel 3/6 koltuk gösteriyor | Panel `getEntitlements()` + `Membership.count()` okuyor; demo kiracıda **11 / 6** çıkıyor | **Kart yanlış** — rakam gerçek |
| Panel 500 kredi uyduruyor | 500, kataloğun `pro` planının gerçek `aiCreditsMonthly` değeri (`catalog.ts:391`) | **Kart yanlış** — rakam gerçek |
| Emekli `team` plan id'si | `RETIRED_PLAN_IDS.team → 'pro'` zaten var (`catalog.ts:417`), üretim kodu emekli id kullanmıyor | **Kart yanlış** — zaten hizalı |
| — | "3/6, 500, `team`" **testin sabit fixture'ında** duruyordu: `tests/billing-settings-lifetime-badge.test.tsx:26-33` ve `currentPlanId="team"` | Kartın kaynağı bu fixture |

Yani kartın işaret ettiği üç rakam panelin değil, testin. **Ama panelde gerçek
uydurma vardı** ve kartın ruhu oradaydı:

### Gerçekten düzeltilen üç uydurma

1. **Sahte fatura satırları.** `BillingClient.tsx` içinde `DEMO_INVOICES` sabiti:
   `GIB202600000001` / `GIB202600000014`, 01.09.2026 / 01.08.2026, açıklama
   "**Team Plan** (Aylık) + M11 Full App", ₺32,220.00 ve ₺10,740.00 — hepsi
   "GİB fatura no" başlıklı sütunun altında. Hiçbiri kesilmemişti, tutarlar
   katalogla ilgisizdi. → **Gerçek `Invoice` satırlarına bağlandı**; kayıt yoksa
   boş durum, uydurma satır yok.
2. **Sahte mükellef kimliği.** Aynı kartta sabit "Demo Ar-Ge ve Danışmanlık Ltd.
   Şti." ve "Doğanbey V.D. / **2840958172**". → Kimlik artık **en yeni faturanın
   üzerindeki dondurulmuş alıcı bilgisinden** geliyor; fatura yoksa "ölçülmedi".
3. **Uydurma kota yedeği.** `page.tsx`, entitlement sorgusu patlarsa
   `seats: 6, workspaces: 5, aiCreditsMonthly: 1000` nesnesine düşüyordu — hiç
   satılmamış bir kapasite, gerçekmiş gibi. → Yedek nesne **kaldırıldı**; okunamayan
   her alan `null` ve panel "—" + "ölçülmedi" gösteriyor (CLAUDE.md kural 7).
   Aynı sebeple `tenantName` yedeği ("FonBridge Demo Kuruluşu" — başkasının
   kuruluş adı) kaldırıldı, yerine URL'deki workspace slug'ı.

Ek: "GİB'e gönderildi" rozeti **yalnız** `Invoice.gibEnvelopeId` doluyken
basılıyor; boşken "GİB'e gönderilmedi". Test fixture'ı da katalogla hizalandı
(`pro`, 6 koltuk / 1 çalışma alanı / 500 kredi).

## 2. Kanıt

### Birim + bileşen testleri (16 yeni test)

```
$ npx vitest run tests/billing-invoice-list.test.ts tests/billing-settings-invoices.test.tsx \
    tests/billing-settings-lifetime-badge.test.tsx
 Test Files  3 passed (3)
      Tests  22 passed (22)
```

### Gerçek tarayıcı, gerçek oturum, gerçek DB satırı (e2e)

```
$ npx playwright test tests/e2e/billing-invoice-history.spec.ts --reporter=line
Running 3 tests using 1 worker
[1/3] … › with no invoice on record it says so, and quotes nothing
[2/3] … › an invoice that exists is listed with its own stored total
[3/3] … › it claims a GİB filing only once the row carries an envelope id
  3 passed (4.3s)
```

Ekran görüntüleri (`docs/agent-results/TASK-MTRD91ZLKEQ3A-screenshots/`):

| Dosya | Ne gösteriyor |
|---|---|
| `billing-invoices-empty.png` | Kayıt yok → "Henüz fatura düzenlenmedi"; unvan/VKN/son fatura üçü de "ölçülmedi" |
| `billing-invoices-listed.png` | Gerçek `Invoice` satırı: no, 1 Eyl 2026, "Fabrika Pro Plan (1 ay)", ₺8.950,00 + ₺1.790,00, **₺10.740,00**, "GİB'e gönderilmedi", XML/PDF bağlantıları |
| `billing-invoices-filed.png` | Aynı satır `gibEnvelopeId='ENV-E2E-77'` yazıldıktan sonra → "GİB'e gönderildi" |
| `billing-quota-cards.png` | Gerçek kiracı verisi: PRO · 500/500 kredi · **11 / 6** koltuk · 1 / 1 çalışma alanı |

e2e, panelin gövde metninde şu altı ipin hiçbirinin kalmadığını da doğruluyor:
`GIB202600000001`, `GIB202600000014`, `Team Plan`, `32,220`, `Demo Ar-Ge`,
`2840958172`.

DB, testten sonra bıraktığım gibi: `select count(*) from "Invoice"` → `0`.

### Kapı

```
$ npx tsc --noEmit           # benim dosyalarımda hata yok (aşağıdaki riskler bölümüne bak)
$ npx eslint <değişen 9 dosya>   # çıktı yok
```

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/billing/invoice-list.ts` | **yeni** — satırdan liste: kuruş cinsinden toplamlar, okunamayan `lines` → tutar yok, `gibEnvelopeId` yoksa gönderilmiş sayılmaz |
| `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx` | `Invoice` sorgusu (`withTenant`, tenant filtreli, 24 satır), uydurma entitlement/tenantName yedekleri kaldırıldı |
| `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` | `DEMO_INVOICES` silindi; gerçek satırlar + boş durum + XML/PDF indirme; null kota → "—"/"ölçülmedi" |
| `messages/tr.json`, `messages/en.json` | `invoiceEmptyTitle/Body`, `invoiceUnreadable`, `invoiceAmountUnreadable`, `invoiceFiled/Unfiled/UnfiledHint`, `notMeasured`, `notMeasuredHint` eklendi; `invoiceDemo`, `invoiceStatusDemo`, `invoiceStatusValue`, `invoiceApproved` kaldırıldı; `invoiceBody` "örnek kayıtlar" ibaresinden temizlendi |
| `tests/billing-invoice-list.test.ts` | **yeni** — 9 test |
| `tests/billing-settings-invoices.test.tsx` | **yeni** — 7 test |
| `tests/billing-settings-lifetime-badge.test.tsx` | fixture katalogla hizalandı, `team` → `pro`, yeni prop'lar |
| `tests/e2e/billing-invoice-history.spec.ts` | **yeni** — 3 gerçek tarayıcı testi |

## 4. Riskler

- **Benim değil, bildiriyorum:** `tests/m11-partb-editor-buffer.test.tsx` (4 test)
  kırmızı — kök neden `src/modules/m11/ui/PartBCollaborativeEditor.tsx:114`
  (`useTranslations` bir Server Component'te). Bu dosya blockzincir-pm'de uçuşta,
  dokunmadım. Benim değişikliklerim o modülü import etmiyor.
- **Benim değil, bildiriyorum:** `tests/gdpr-data-subject.live.test.ts:41,182,249,317`
  typecheck hatası veriyor (`null` atanamaz, örtük `any`). Benim dosyalarımla ilgisi yok.
- **Bildirim (kapsam dışı):** demo kiracı **11 üyeyle 6 koltukluk** `pro` planda —
  panel bunu dürüstçe "11 / 6" gösteriyor ama kota aşımı için ne uyarı ne de
  yaptırım var. Ayrı bir kart konusu.
- Fatura tarihi UTC takvim günü olarak basılıyor (belgenin üzerindeki düzenleme
  tarihi), okuyucunun saat dilimine çevrilmiyor — fatura için doğru olan bu, ama
  CLAUDE.md kural 10'un "kullanıcı saat dilimi" cümlesiyle bilinçli bir farktır.

## 5. Açık sorular

- Fatura **yazan** taraf yok: `Invoice` satırlarını kim üretecek (Stripe/iyzico
  webhook'u mu, elle mi)? Panel artık okumaya hazır, yazan yok — bu yüzden
  gerçek kurulumda liste bugün her kiracıda boş görünecek.
- Panelin üst kısmındaki `UNPRICED_ADDONS` kartları (credits500/credits1500/addonM6)
  hâlâ satılamaz durumda duruyor (TASK-MTR6QIE05ZKNH notu). Kapsamıma girmedi.

## 6. Sonraki adım

- `Invoice` satırlarını üreten yolu bağlamak (ödeme sağlayıcı webhook'u).
- Kota aşımı (11/6) için ürün kararı: uyarı mı, koltuk satın alma çağrısı mı?
