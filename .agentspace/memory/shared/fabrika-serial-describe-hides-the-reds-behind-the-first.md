---
name: fabrika-serial-describe-hides-the-reds-behind-the-first
description: mode:'serial' bir spec dosyasında tek kırmızı kalan testleri hiç koşturmaz — bildirilen kırmızı tek kırmızı olmayabilir; triyajda "N did not run" satırını oku ve düzelttikten SONRA tekrar koş
metadata:
  type: project
  updatedAt: 2026-09-10
---

`test.describe.configure({ mode: 'serial' })` (paylaşılan fixture gerektiğinde meşru)
ilk kırmızıda kalan testleri **koşturmaz**, `-` ile atlar. Sonuç: bir spec dosyasındaki
tek bayat assertion, arkasındaki testlerin durumunu **ölçülemez** yapar.

TASK-MTVT0VLF4AP19, `tests/e2e/document-export-tenant-isolation.spec.ts`:

```
  ✘  2 … gets its OWN organisation, not FonBridge
  -  3 … tenant A asking for tenant B’s partId gets 404      ← kiracı izolasyonu
  -  4 … tenant B asking for tenant A’s partId gets 404      ← kiracı izolasyonu
  -  5 … the printable document follows the session language
  1 failed · 3 did not run · 1 passed
```

Yani **tek bayat string 3 kiracı-izolasyon testini birden karartıyordu** — haftalarca
"bu dosyada 1 kırmızı var" diye raporlandı, gerçekte 4 testin durumu bilinmiyordu.
Üstelik 2'yi düzeltince 5'te **ikinci** bir bayat assertion ortaya çıktı; onu da
düzeltmeden dosya yeşile gelmedi.

**Why:** "1 failed" satırı bir kırmızı SAYISI değil, ölçümün DURDUĞU yerdir. Sahipsiz
kırmızı kartlarında etki tahmini bu yüzden sistematik olarak eksik çıkıyor.

**How to apply:**
- Kırmızıyı raporlarken `N did not run` satırını da yaz; "1 kırmızı" deme, "1 kırmızı +
  N ölçülmedi" de.
- Düzeltmeden sonra dosyanın TAMAMINI tekrar koş ve yeşili öyle iddia et — ilk yeşil
  koşu genelde ikinci kırmızıyı açığa çıkarır.
- Kartı kapatırken kanıt olarak `N passed` satırının tamamını kopyala, tek testin
  `✓` satırını değil.

İlgili: [[fabrika-a-rename-breaks-test-guard-strings-too]] · [[fabrika-board-cards-go-stale]]
