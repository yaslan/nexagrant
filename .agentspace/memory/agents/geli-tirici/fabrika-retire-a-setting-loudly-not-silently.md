---
name: fabrika-retire-a-setting-loudly-not-silently
description: Bir ortam değişkeni işlevsiz kaldığında şemadan silme — "set edilmiş ve YOK SAYILIYOR" diye raporla; sessizce silmek, hâlâ set eden kurulumun o sayının çalıştığını sanmasına yol açar
metadata:
  type: project
updatedAt: 2026-09-08
---

`INVOICE_VAT_RATE` KDV oranını belirlemeyi bıraktı (oran artık alıcının
ülkesinden geliyor). **Silmedim:** `src/lib/env.ts`'te duruyor,
`retiredVatRateSetting()` onu hâlâ ayrıştırıyor ve `pnpm efatura:preflight`
tablosunda `required: false` satırında **`(YOK SAYILIR)`** olarak görünüyor.

**Why:** Değişkeni silmek, hâlâ set eden bir kurulumu sessizce yanlış inançta
bırakır — operatör yapılandırdığı sayının faturalarındaki vergi olduğunu sanmaya
devam eder. Hiçbir şey söylememektense "duruyor ve işe yaramıyor" demek daha
yüksek sesli.

**How to apply:**
- Emekliye ayırırken üç adım: (1) okuyan kodu kaldır, (2) parse'ı bir
  `retired…()` fonksiyonuna taşı, (3) kapının çıktısında adıyla "yok sayılıyor"
  yaz.
- Kapının o bloğu artık **yeni kuralı** ölçmeli: `efatura-preflight` KDV bloğu
  env sormayı bırakıp `resolveVatRate(satıcının ülkesi)` sormaya geçti — böylece
  kapı ile yazıcı tanım gereği ayrışamıyor (TASK-MTSYAKDK5LV9E'nin korumak
  istediği özellik). Kanıt: `TR` satırı yokken `INVOICE_VAT_RATE=20` set olsa
  bile kapı KIRMIZI.
- Kuralı değiştiren testleri **gevşetme, yeniden yaz**: "boş env → KDV bloğu
  kırmızı" beklentisi artık YANLIŞ (oran kodda), yerine "boş env → yeşil, çünkü
  burada unutulacak bir değişken kalmadı" yazılır.
