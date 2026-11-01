---
name: fabrika-a-rename-breaks-test-guard-strings-too
description: Marka/sabit yeniden adlandırma kartının yarıçapı tests/ dizinini de kapsar — testler de call site'tır ve hem ÖLÜ hem YENİ adı literal tutarlar; yeni ad bir nöbetçi string'e çarpınca spec doğru üründe kalıcı kırmızı olur
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`src/lib/brand.ts`'in docblock'u kuralı koyuyor: *"the name is a value read from here,
never a string re-typed at the call site."* **Bir test dosyası da call site'tır** —
ve rename kartları `src/` + `messages/` tarayıp `tests/`'i atlıyor.

TASK-MTVT0VLF4AP19'da bunun iki hâli aynı dosyada çıktı
(`tests/e2e/document-export-tenant-isolation.spec.ts`):

1. **YENİ ad bir nöbetçiye çarptı.** Spec 2026-09-08'de, ürün adı `Fabrika` iken
   `expect(text).not.toContain('FonBridge')` yazmıştı — o gün `FonBridge` yalnızca
   uydurma kuruluşun (`FonBridge Teknoloji A.Ş.`) adıydı, nöbetçi olarak mantıklıydı.
   `9af3f63` (2026-09-10) `PRODUCT_NAME`'i `FonBridge`'e geri aldı; künye cümlesi
   ("… tarafından FonBridge'da hazırlanmıştır") nöbetçiyi tetikledi. Belge her alanında
   DOĞRUYDU; kırmızı olan testti. Kırmızı en az iki kart boyunca sahipsiz kaldı.
2. **ÖLÜ ad literal kaldı.** Aynı dosyada `toContain('… produced in Fabrika')`.
   Bu, [[rename-card-fix-the-value-not-the-52-copies]]'in "yeni adı da grep'le" kuralının
   `tests/` altındaki hâli.

**Why:** Bir nöbetçi string ("bu kelime çıktıda ASLA geçmesin") yalnızca o kelime
üründe hiçbir meşru anlam taşımadığı sürece geçerlidir. Marka/plan/rol adı gibi
DEĞİŞEBİLİR bir değeri nöbetçi yapmak, o değer meşrulaştığı gün spec'i kalıcı kırmızıya
çevirir — ve kalıcı kırmızı bilgi taşımaz ([[fabrika-a-permanently-red-assertion-carries-no-information]]).

**How to apply:**
- Rename kartının DoD'una `tests/` grep'i koy: HEM eski HEM yeni ad.
- Testte marka/sabit gerekiyorsa `import { PRODUCT_NAME } from '@/lib/brand'` ile OKU.
- Nöbetçi string yalnız **ölü fixture** için literal kalsın (`'FonBridge Teknoloji'` —
  uydurma KURULUŞ; marka değişse de o string ölü kalır, `PRODUCT_NAME`'den türetilemez).
- Kör `not.toContain(X)` yerine kusurun yaşadığı ALANI ölç: DOCX'i paragrafa ayırıp
  `expect(field('Kuruluş')).toBe(...)` gibi EŞİTLİK yaz — hem yeniden adlandırmaya
  dayanıklı hem daha güçlü.

İlgili: [[fabrika-deferred-to-another-card-is-not-fixed]] · [[fabrika-serial-describe-hides-the-reds-behind-the-first]]
