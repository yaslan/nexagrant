---
name: rename-card-fix-the-value-not-the-52-copies
description: Bir "ölü ürün adı N dosyada" kartını yeni adı N yere yazarak kapatma — adı tek bir değere (brand.ts + katalogda {brand}) bağla, yoksa aynı kusuru yeni ad altında yeniden üretirsin
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTSWM36QWC36Z: "FonBridge" 52 yerde. En hızlı kapanış `sed s/FonBridge/Fabrika/`
olurdu — ve kartın kendi teşhisini görmezden gelirdi. Kusur ADIN YANLIŞ OLMASI değil,
adın 52 yere KOPYALANMIŞ olması; bir sonraki değişimde yine 52 yer taranacaktı.

Yaptığım: `src/lib/brand.ts` → `PRODUCT_NAME` + `withBrand()`; katalog stringleri ürün adını
hiç yazmıyor, `{brand}` tutuyor; React çağıranları `t('key', { brand: PRODUCT_NAME })`.

Kritik ayrıntı: `messages/*.json`'da ZATEN DÜZELTİLMİŞ 5 anahtar literal `Fabrika` taşıyordu
(`DocumentExport.provenanceNotice`, `templateBody`, `docxFallbackBody`, iki `footer`). Bunlar
"temiz" görünüyordu çünkü grep'i `FonBridge` idi. Aynı kusurun yeni ad altındaki hali. Onları
da `{brand}`'e çevirmezsem bir sonraki değişim yine 40 dosya olurdu.

**Why:** "Ölü ad N dosyada" kartlarında N, semptomdur. Kapanış ölçütü N'i sıfırlamak değil,
N'i 1 yapmaktır.

**How to apply:** Böyle bir kartta ÖNCE tek kaynağı kur, SONRA çağıranları ona bağla. Ve
YENİ adı da grep'le — hâlihazırda "düzeltilmiş" kopyalar aynı borçtur.

İlgili: [[type-gate-proof-needs-a-rejection-not-zero-errors]] · [[grep-count-dod-can-hit-a-legitimate-string]]
