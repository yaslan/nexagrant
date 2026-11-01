---
name: fabrika-text-inventory-must-hunt-missing-messages
description: Kullanıcı-metni envanterinde asıl bulgu "kötü metin" değil "hiç metin olmayan yol"dur — ve aynı görev-ID'li eski rapor bayat olabilir, iddialarını koda karşı doğrula
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

TASK-MTU64Y932HF96'da (e-Fatura metin envanteri) iki kere aynı derse çıktım.

**1) Envanter yalnız var olan dizgileri taramaz.** `grep`'lenebilir her metni toplayıp puanlamak
kolay iş; e-Fatura akışında var olan 7 hata metninin hepsi Türkçe ve makuldü. Gerçek destek yükü
**metin olmayan üç yolda**ydı: ödeme alınıp fatura kesilmediğinde hiçbir uyarı olmaması, PDF pop-up
engellenince sessiz başarısızlık (`window.open` dönüşü kontrol edilmiyor), ödeme adımında KDV
çözülemediğinde hiçbir açıklama olmaması. Yöntem: her erken-return / `skipped` / `catch` / `null`
dalını bul, sonra **"bu dal gerçekleştiğinde kullanıcı ne görüyor?"** diye sor. Cevap "hiçbir şey" ya
da "her şey yolundaymış gibi bir boş-durum metni" ise bulgu odur. `grep -rn "<alan>" src --include="*.tsx"`
→ 0 sonuç, bir sunucu alanının hiç basılmadığının en hızlı kanıtı.

**2) Aynı görev-ID'li eski raporu önce doğrula.** `docs/agent-results/`'ta bu ID zaten vardı
(başka ajan). En yüksek riskli iki bulgusu da aradan geçen görevlerde düzeltilmişti; o raporu
okuyup işe başlasaydım olmayan bir sorunu kovalar, gerçek boşlukları hiç görmezdim. Aynı şey
hafıza için de geçerli: üç kayıt bayat çıktı (`ADAPTERS` artık boş değil, `INVOICE_VAT_RATE`
2026-09-09'da koddan kaldırılmış, ham-JSON sızıntısı düzeltilmiş).

**Why:** Metin envanteri "iyi/kötü metin" tablosu üretmeye çok müsait bir görev; tablo dolu görünür
ve iş bitmiş sanılır. Oysa destek biletlerinin çoğu metnin kötü olmasından değil, olmamasından çıkıyor.

**How to apply:** Envanter/denetim görevine başlarken sırayla: (a) `ls docs/agent-results | grep <ID>`
— varsa iddialarını koda karşı tek tek doğrula ve raporun ilk bölümünde bayat olanları yaz;
(b) metinleri topla; (c) **sonra** dallanma noktalarını tara ve sessiz yolları ayrı bir bölümde
önceliklendir. Bayat çıkan hafızayı düzeltmeden bırakma.

İlgili: [[fabrika-payment-taken-no-invoice-is-silent]] · [[fabrika-parallel-agent-file-race]]
