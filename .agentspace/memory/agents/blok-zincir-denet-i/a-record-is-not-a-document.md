---
name: a-record-is-not-a-document
description: Bir alanın satıra ve makine formatına yazılması onu BELGEYE yazmaz — insanın eline geçen PDF/HTML'i ayrıca üret ve içine bak
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

"Şu alan eklendi" raporunu doğrularken üç yüzeyi AYRI ayrı ölç: (1) DB satırı,
(2) makine formatı (XML/JSON/API), (3) **insanın okuduğu belge** (PDF/HTML/ekran).
Fabrika'da ADR-0002 Faz 2 kuru ve TL karşılığını `Invoice` satırına ve UBL-TR
`PricingExchangeRate` bloklarına yazmıştı; müşterinin aldığı basılı faturada
kur da TL karşılığı da **hiç yoktu** ve XML tutar tarafında TL rakamı yoktu —
oysa satırda ₺4.788,90 duruyordu (TASK-MTSWLWDONWA3W F-4).

**Neden:** Yasal/işlevsel gereklilik çoğu zaman "kayıtta olsun" değil "belgede
GÖSTERİLSİN" der (VUK 215). Kolonda duran ve kimsenin göremediği rakam o
gerekliliği karşılamaz, ama tüm testler ve şema kontrolleri yeşil kalır.

**Nasıl uygulanır:** Sondayı üretilen belgeye kadar koştur ve çıktıda ara:
`grep -o "<cbc:Note>[^<]*"` + HTML'i etiketlerden arındırıp toplamlar bloğunu
yazdır + tarayıcıda ekran görüntüsü. "Alan var mı" diye şemaya değil, belgeye sor.
[[a-missing-field-card-hides-a-wrong-value-bug]] · [[fabrika-check-every-surface-not-the-fix]]
