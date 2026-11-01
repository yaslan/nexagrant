---
name: fabrika-a-template-may-carry-structure-not-content
description: Fabrika'da bir "varsayılan şablon" sabiti ne taşıyabilir — resmî iskelet (başlık/limit) EVET, yazar ve metin HAYIR; uydurma kimlik avında content alanlarına da bak
metadata:
  type: project
  updatedAt: 2026-09-08
---

Ürün kuralı (uydurma-kimlik kusur sınıfının şablon hâli). Bir sabit "varsayılan içerik"
dizisi **yalnız bir şablonun bilebileceğini** taşıyabilir:
- **Meşru:** resmî bölüm listesi, başlıklar, sayfa hedefi, kelime tavanı, sıra/gruplama.
- **Uydurma:** yazar/kurum alanları, `lastModifiedBy`, ve **yazılmış düzyazı**.

Gerekçe: kiracı ekranı ilk açtığında bu metni *kendi* teklifi olarak görür, ilerleme sayacı
yazılmamış sayfaları yazılmış gösterir ve DOCX/PDF dışa aktarımı onu kiracının imzasıyla
dışarı çıkarır. Boş `content` + açık boş-durum, sayacı da dürüst yapar (0 kelime).

**Av tüyosu:** uydurma isim ararken `leadAuthor`/`author` gibi ALANLARLA yetinme —
TASK-MTS6LZOD715WM'de aynı 4 kuruluş bölüm metninin *içinde* de vardı
(`WP1 (Lead: Demo SME Consultancy)`) ve kayıtsız rakamlar (`€4.2B`, `420,000 t CO2`, `%18`)
oradaydı. Alan temizliği tek başına kusuru yarı açık bırakırdı.

**Bir görev "X alanlarını temizle" derken metin de aynı uydurmayı taşıyorsa:** kapsamı
genişletmek meşru (aynı dosya, aynı kusur sınıfı, aynı dışa aktarım yolu) — ama **yerine
yeni metin YAZMA**, o uydurmayı sürdürür. Boşalt, boş-durumu i18n'le, raporda gerekçelendir.

Uygulanan yer: `src/modules/m11/types.ts` `DEFAULT_PART_B_SECTIONS` (commit `22b5406`),
kilit: `tests/fabricated-identity-strings.test.ts` "Part B template" describe'ı +
`tests/e2e/partb-template-identity.spec.ts`.

İlgili: [[fabrika-identity-fallback-doctrine]] · [[fabrika-m11-partb-local-verification-recipe]]
