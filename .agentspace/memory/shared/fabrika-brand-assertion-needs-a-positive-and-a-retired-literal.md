---
name: fabrika-brand-assertion-needs-a-positive-and-a-retired-literal
description: Fabrika'da marka iddiası ÇİFT yazılır — pozitif taraf PRODUCT_NAME/withBrand'i izler, negatif taraf EMEKLİ adı literal tutar; yalnız pozitifi yazarsan mutasyon sondası kör kalır, yalnız negatifi yazarsan ad dönünce muhafız kendi kendini tersine çevirir
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

Ürün adı iki kez döndü (FonBridge → Fabrika 2026-Q1 → FonBridge 2026-09-10). Bu, marka
testlerinde iki ayrı tuzak üretiyor ve ikisi de TASK-MTVBX3348JNPN'de aynı anda görüldü.

**Tuzak 1 — literal muhafız, ad dönünce anlamını tersine çevirir.**
`tests/brand-surfaces-render.test.tsx` "Fabrika" döneminde doğdu; satırı
`not.toContain('FonBridge')` idi ve o gün **emekli** adı koruyordu. Adlar yer değiştirince aynı
satır **canlı** markayı yasaklar hale geldi — test kendi adıyla ("renders the product name")
çelişti. Böyle bir kırıkta refleks (`not` → `toContain` çevirmek, ya da satırı silmek) muhafızı
yok eder. Doğrusu: `git log -p --follow <test>` ile hangi dönemde yazıldığını oku, literalin o gün
hangi adı gösterdiğini gör, sonra literali **bugünün emekli adına** yeniden yönelt.

**Tuzak 2 — kaynaktan türetilen beklenti kendi mutasyon sondasını geçemez.**
Beklentiyi `withBrand("... {brand}'da ...")` ile kurmak doğru (ad değişince test onu izler), ama
`PRODUCT_NAME`'i mutasyonla 'Fabrika' yaptığında **iki taraf birlikte kayar** ve test YEŞİL kalır.
Aynı körlük [[fabrika-consolidation-test-needs-equality-and-an-oracle]]'daki eşitlik testinde de
var. Çözüm aynı: pozitif iddianın yanına `expect(html).not.toContain(RETIRED_BRAND)` koy —
`RETIRED_BRAND` bilinçli LİTERAL, çünkü emekli ad bir tarih kaydıdır, `PRODUCT_NAME`'i izlemesi
gereken bir değer değil. Sondanın hangi iddiayı kırdığını doğrula:
[[fabrika-mutation-red-may-fire-on-another-assertion]].

**Depodaki hazır takım (aramadan bulunmuyor, üç dosyaya dağılmış):**
* `src/lib/brand.ts` → `PRODUCT_NAME` + `withBrand(text)`; `withBrand` senkron/non-React çağıranlar
  için, exporter'ın kendisi de onu kullanıyor (`src/lib/document-exporter.ts`, `provenanceText`).
* `tests/retired-brand-name.test.ts` → `RETIRED = 'Fabrika'`, depo geneli tarama + `HISTORICAL_RECORD`
  (emekli adı KASITLI anan ~20 dosyanın beyaz listesi; bir kaydı yeniden adlandırmak tarihi bozar).
* `messages/{tr,en}.json` → marka cümleleri `{brand}` yer tutucusu taşır. **Türkçe eki katalogda**
  (`{brand}'da`). Testte `${PRODUCT_NAME}'da` yazma — eki yeniden yazmış olursun ve katalog eki
  değişince test bayatlar; `withBrand("...{brand}'da...")` yaz.

**How to apply:** Marka taşıyan her yeni iddiada ikisini birden yaz. Kırık bir marka testini
onarırken önce `git log -p` ile niyeti oku, sonra mutasyon sondasıyla **her iki** iddianın da canlı
olduğunu göster. Görsel varlıklar bu takımın dışında kalır:
[[fabrika-brand-audit-must-open-assets-not-grep-them]].
