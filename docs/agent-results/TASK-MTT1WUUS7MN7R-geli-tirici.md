# TASK-MTT1WUUS7MN7R — Fiyatlar KDV hariç + KDV müşterinin ülkesine göre

**Ajan:** geli-tirici (BE-EN) · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-09

## 1. Ne yapıldı

Kartın gövdesi (ülke tablosu, resolver, checkout ve fatura yazıcısı, i18n) `f681b96`
ile zaten inmişti; ancak o commit'in kanıt raporu `ADR-0002-geli-tirici-2.md`
adına yazılmıştı, bu GÖREV-ID altında rapor yoktu. Bu oturumda yapılanlar:

**(a) İndeni doğruladım — iddiaya değil, gerçek koşuya bakarak.** Her iki prob
gerçek veritabanına karşı koştu (işlem geri alınıyor, kalıcı yazma yok): TR %20,
KW %0, ve tablodaki 27 AB üyesi `regime: 'unknown'` olduğu için **fatura kesilmiyor**.

**(b) Gerçek bir kusur buldum ve kapattım: `money.ts` doğru olmayan bir şey iddia ediyordu.**
`vatOnNetMinor` docstring'i "bu kural daha önce üç yerdeydi — `invoice-writer.ts`,
`efatura.ts` ve `invoice-list.ts` — ve tesadüfen aynı sonucu veriyorlardı" diyordu.
Gerçekte **yalnız `invoice-writer.ts` dönüştürülmüştü**; diğer ikisi hâlâ kendi
`Math.round((net * rate) / 100)` kopyasını taşıyordu. Yani dosya, kendi işinin
tamamlanmış olduğunu iddia ediyordu — hafızamdaki *fabrication audit must cover
defaults* notunun tam olarak uyardığı tür: bir şey İDDİA EDEN metin de uydurmadır.

İki seçenek vardı — docstring'i gerçeğe indirmek ya da iddiayı doğru kılmak.
İkincisini seçtim: `efatura.ts` (filelenen belge) ve `invoice-list.ts` (fatura
paneli) artık `vatOnNetMinor`'ı **çağırıyor**, ikinci bir kopya taşımıyor.

**(c) Dönüşümün güvenli olduğunu ÖNCE kanıtladım, sonra yaptım.** `vatOnNetMinor`
negatif tutarda / 0-100 dışı oranda fırlatıyor; bu iki çağrı noktasında sayfa
çökmesi yaratır mıydı diye baktım:
- `totalsForLines` yalnızca `invoiceLinesSchema`'dan geçmiş satır alıyor
  (`invoice-list.ts:118`), o şema `vatRate: z.number().min(0).max(100)`,
  `unitPriceMinor: z.number().int().nonnegative()`, `quantity: z.number().positive()`
  ile zaten sınırlıyor → guard'lar burada ateşleyemez.
- İade/credit note modellenmiş **değil** ve yazıcı sıfır-veya-negatif tahsilatı
  reddediyor (`invoice-writer.ts:363-364`) → negatif satır bu yollara ulaşamaz.

**(d) Birleştirmeyi bir regresyon testiyle kilitledim** (`tests/vat-by-country.test.ts`),
ve testin gerçekten **reddettiğini** mutasyonla gösterdim (aşağıda).

## 2. Kanıt (kopyalanmış gerçek çıktı)

### Uçtan uca — checkout, gerçek DB
`docs/agent-results/TASK-MTT1WUUS7MN7R-evidence/probe-checkout-vat.txt`:
```
buyerCountry = Türkiye  → HTTP 200
{ "totalMinor": 4500, "tax": { "country": "TR", "ratePercent": 20, "vatMinor": 900, "resolved": true },
  "grossTotalMinor": 5400, "currency": "USD" }

buyerCountry = Kuveyt  → HTTP 200
{ "totalMinor": 4500, "tax": { "country": "KW", "ratePercent": 0, "vatMinor": 0, "resolved": true },
  "grossTotalMinor": 4500, "currency": "USD" }

buyerCountry = Belçika  → HTTP 200
{ "totalMinor": 4500, "tax": { "country": null, "ratePercent": 0, "vatMinor": 0, "resolved": false },
  "grossTotalMinor": 4500, "currency": "USD" }
```
`totalMinor` KDV hariç liste fiyatı olarak kalıyor; vergi ayrı alan. Belçika
`resolved: false` — oran tabloda var ama rejim `unknown`, yani tahsil edilmiyor.

### Uçtan uca — fatura, gerçek DB (işlem geri alındı)
`docs/agent-results/TASK-MTT1WUUS7MN7R-evidence/probe-vat-country.txt`:
```
reconciliation: net 4500 + VAT 900 = 5400  (charged 5400) -> MATCHES     [TR]
net stored equals the VAT-exclusive list price? YES
reconciliation: net 4500 + VAT 0 = 4500  (charged 4500) -> MATCHES       [KW]
net stored equals the VAT-exclusive list price? YES
(transaction rolled back — nothing persisted)
```

### Mutasyon kanıtı — test gerçekten reddediyor
`invoice-list.ts`'i geçici olarak yarım-yukarı yerine **kırpmaya** (`Math.floor`)
çevirdim:
```
--- MUTATION A (truncate) ---
AssertionError: panel @ 17% on 3: expected +0 to be 1 // Object.is equality
      Tests  1 failed | 30 passed (31)
--- restored ---
```
**Testin sınırı (dürüstçe):** düz bir `Math.round` kopyası geri konursa bu test
**yakalamaz** — negatif olmayan tutarlar için `Math.round(x)` ile
`Math.floor(x + 0.5)` sayısal olarak aynıdır. Test farklı bir yuvarlama kuralını
(kırpma, oranın yuvarlanması, major-unit float üzerinden hesap) yakalar; kaynağın
tekliğini ise kopyanın varlığı değil, çağrının kendisi sağlar.

### Kapılar
```
tsc --noEmit                     → 0 error
eslint (3 değişen dosya)         → exit 0
vitest run (tüm depo)            → Test Files 129 passed | 2 skipped (131)
                                   Tests 1543 passed | 8 skipped (1551)
vitest tests/vat-by-country.ts   → 31 passed
```

## 3. Değişen dosyalar
| Dosya | Ne |
|---|---|
| `src/lib/efatura.ts` | satır KDV'si artık `vatOnNetMinor` (yerel `Math.round` kopyası kaldırıldı) |
| `src/lib/billing/invoice-list.ts` | aynısı panel tarafı için + neden guard'ların ateşleyemeyeceğini yazan docstring |
| `tests/vat-by-country.test.ts` | belge/panel/yardımcı üçlüsünün 0–2000 net × {0,17,19,20,25,**25.5**,27} oranda aynı sonucu verdiğini kilitleyen test |
| `docs/agent-results/TASK-MTT1WUUS7MN7R-evidence/` | iki probun ham çıktısı |

## 4. Riskler
- **AB'ye fatura kesilemez** — 27 üye `regime: 'unknown'`. Bu kasıtlı: oranı bilmek
  onu tahsil etme kararı değil, ve Türkiye mukimi bir tedarikçi normalde AB KDV'si
  tahsil etmez (reverse charge / OSS). Bir AB müşterisi bugün **ödeme yapabilir ama
  fatura alamaz**. Mali müşavir rejimi belirlemeden `standard`'a çevrilmemeli.
- `TenantBillingIdentity` bugün üründe hiçbir yerden doldurulmuyor (TASK-MTSY71BUMBLWM);
  vergi ülkesi oradan geldiği için pratikte çoğu kiracı `resolved: false`.
- `calculateInvoiceTotals` hâlâ **major unit float** döndürüyor (`totalVatMinor / majorUnit`).
  CLAUDE.md kural 9 ile gergin; bu kartın kapsamı dışında bıraktım, testte ölçekleyerek
  karşılaştırdım. Ayrı kart konusu.

## 5. Açık sorular
1. AB rejimi: reverse charge mı, OSS kaydı mı? Mali müşavir kararı gerekiyor —
   `docs/MALI_MUSAVIR_SORULARI.md`'ye eklenmeli mi?
2. `INVOICE_VAT_RATE` artık hiçbir şeye karar vermiyor ama parse edilip
   "yok sayılıyor" diye raporlanıyor. Ne zaman tamamen silinecek?

## 6. Sonraki adım
- Mali müşavirden AB rejim kararı → tablodaki `regime` alanları güncellenir (veri
  değişikliği, kod değişikliği değil).
- `TenantBillingIdentity` doldurma akışı (TASK-MTSY71BUMBLWM) olmadan bu özellik
  gerçek müşteride büyük ölçüde `resolved: false` çalışır.
