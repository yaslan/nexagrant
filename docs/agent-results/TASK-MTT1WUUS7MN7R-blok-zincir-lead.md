# TASK-MTT1WUUS7MN7R — KDV hariç fiyat + ülkeye göre KDV · LİDER DOĞRULAMASI

**Ajan:** blok-zincir-lead (LEED-EN) · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-09
**Ölçülen ağaç:** `bd125f3` (HEAD) · **Doğrulanan rapor:** `TASK-MTT1WUUS7MN7R-geli-tirici.md`

## Karar

**Kart kapanır (`done`).** Raporun her sayısal iddiası ağaca karşı kendi komutuyla ölçüldü ve
tuttu; ayrıca raporun kendi kapı koşusunun **HEAD'i ölçmediğini** fark edip kapıyı HEAD'de
yeniden koşturdum. Yolun üstünde **kayıtsız bir kusur** çıktı (aşağıda F-A) — düzeltmedim,
kart açtım: kapsam korunuyor.

## 1. Ne yapıldı

Rapor "birleştirdim" diyordu; ben "birleşti mi" diye sordum — metne değil koda.

**(a) Kapı atfı düzeltildi.** geli-tirici'nin kapı çıktısı ile QA'nın (`TASK-MTT1XL9NP2QYU`)
`pnpm gate` koşusu `d737759`'da alınmıştı; oysa KDV birleştirmesi `1547db2` ve gruplama
refaktörü `f5fd3c6` o commit'ten **sonra** indi. Yani hiçbir tam kapı bu iki değişikliğin
bir arada olduğu ağacı ölçmemişti. HEAD'de (`bd125f3`) yeniden koşturdum.

**(b) Tek-kural iddiası ölçüldü.** "İkinci bir kopya taşımıyor" iddiası grep ile doğrulandı.

**(c) Takip kartı iddiası ölçüldü.** QA raporu "F-1/b + F-2 için takip kartı açıldı" diyordu —
panoda gerçekten var: `TASK-MTTOUDNQ97X83` [todo].

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 KDV yuvarlaması artık gerçekten tek fonksiyon

```
$ grep -rn "vatOnNetMinor" src | grep -v "money.ts:"
src/lib/efatura.ts:188:            const vatMinor = vatOnNetMinor(lineTotalMinor, line.vatRate);
src/lib/billing/checkout-tax.ts:86:  vatMinor: vatOnNetMinor(netTotalMinor, vat.ratePercent),
src/lib/billing/invoice-list.ts:96:  const lineVatMinor = vatOnNetMinor(lineMinor, line.vatRate);
src/lib/billing/invoice-writer.ts:200: const vatMinor = vatOnNetMinor(netMinor, vatRate);
```
Dört çağrı yeri, sıfır ikinci kopya. Docstring'in iddiası artık doğru — rapor bunu
"iddiayı gerçek kıl" yönünde çözmüş, doğru seçim.

### 2.2 Kapı — HEAD'de (`bd125f3`), iki değişiklik de içerideyken

```
$ pnpm gate   -> EXIT=0
  lint       ✖ 2 problems (0 errors, 2 warnings)
  typecheck  exit 0
  test       Test Files 130 passed | 2 skipped (132)
             Tests     1547 passed | 8 skipped (1555)
  i18n       ✅ iki katalog uyuşuyor, src/'deki her anahtar çözülüyor
  rls:check  ✅ 43/43 kiracıya özel model
  rls:verify ✅ fabrika_app rolüyle (rolbypassrls=false) GERÇEKTEN ölçüldü —
             okuma/yazma/çapraz-yazma kiracı sınırında reddedildi
```
Tam log: `docs/agent-results/TASK-MTT1WUUS7MN7R-evidence/gate-at-HEAD-bd125f3.txt`

**İki uyarının atfı** (kod değil, kalıntı):
```
docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts   'R' assigned but never used
docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts   '_url' defined but never used
```
Başka bir kartın sonda kalıntısı; bu kartın değişen üç dosyasında 0 uyarı.

### 2.3 Takip kartı gerçekten açılmış

```
• TASK-MTTOUDNQ97X83 [todo] {E10} (cekirdek) — İmha işi sessizce başarısız olabiliyor +
  sahipsiz kalan ilişkiye yeni sahip atanamıyor
```

## 3. F-A — KAYITSIZ KUSUR: aynı hata, düzeltmenin bir satır altında

Birleştirilen KDV yuvarlaması tek fonksiyon oldu; ama **stopaj (tevkifat) yuvarlaması** tam
olarak yeni düzeltilen iki dosyada, hâlâ iki kopya:

```
$ grep -rn "withholding" --include="*.ts" src | grep -i round
src/lib/efatura.ts:192:            withholdingMinor = Math.round(vatMinor * line.withholdingRate);
src/lib/billing/invoice-list.ts:100: withholdingMinor += Math.round(lineVatMinor * line.withholdingRate);
```

Bugün ikisi aynı sonucu veriyor — `vatOnNetMinor`'ın birleştirilmeden önceki hâli gibi.
Kusur "yanlış sonuç" değil, **kaymaya açık olması**: biri değişirse belge ile panel sessizce
ayrışır ve bunu yakalayan test yok. Kartın kapsamı KDV'ydi; DÜZELTMEDİM, kart açtım
(`TASK-…` §6). Bu, hafızamdaki *partial-fix-check-all-surfaces* notunun aynısı.

Ayrıca `calculateInvoiceTotals` hâlâ **major unit float** döndürüyor (`totalVatMinor / majorUnit`)
— CLAUDE.md kural 9 ile doğrudan gergin. geli-tirici bunu dürüstçe raporlamış; aynı karta girdi.

## 4. Değişen dosyalar

Bu doğrulama turunda **ürün kodu değişmedi.** Yalnız:
- `docs/agent-results/TASK-MTT1WUUS7MN7R-blok-zincir-lead.md` (bu dosya)
- `docs/agent-results/TASK-MTT1WUUS7MN7R-evidence/gate-at-HEAD-bd125f3.txt`

## 5. Riskler

1. **AB'ye fatura kesilemiyor** (27 üye `regime: 'unknown'`). Bu kasıtlı ve doğru; ama bir AB
   müşterisi bugün **ödeyebilir, fatura alamaz**. Mali müşavir cevabı gelene kadar böyle kalmalı
   — soru zaten `docs/MALI_MUSAVIR_SORULARI.md` §4'te yazılı.
2. `TenantBillingIdentity` üründe hiçbir yerden doldurulmadığı için özellik gerçek müşteride
   büyük ölçüde `resolved: false` çalışır (TASK-MTSY71BUMBLWM).
3. Testin sınırı raporda dürüstçe yazılmış: düz bir `Math.round` kopyası geri konursa test
   yakalamaz. Tekliği sağlayan şey test değil, çağrının kendisi.

## 6. Açık sorular

1. AB rejimi (reverse charge mı, OSS mi) — mali müşavir. `MALI_MUSAVIR_SORULARI.md` §4'te sorulu.
2. `INVOICE_VAT_RATE` artık hiçbir şeye karar vermiyor ama hâlâ parse ediliyor. Ne zaman silinecek?

## 7. Sonraki adım

1. Kart `done`.
2. F-A için yeni kart (stopaj yuvarlaması + `calculateInvoiceTotals` float'ı).
3. `MALI_MUSAVIR_SORULARI.md` commit'lenmeli — bugün untracked, yani patronun hafta sonu
   görüşmesine götüreceği liste sürüm kontrolünde değil.
