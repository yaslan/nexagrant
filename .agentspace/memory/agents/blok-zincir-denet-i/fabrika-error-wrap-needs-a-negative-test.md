---
name: fabrika-error-wrap-needs-a-negative-test
description: Bir try/catch'in DAR tutulduğunu ancak negatif test kanıtlar — pozitif "doğru tipi fırlatıyor" testi, fonksiyonun tamamını saran aşırı-düzeltmede de yeşil kalır
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`generateCompletion`'a "sağlayıcıya ödendikten SONRA" hata sarmalama eklerken
(TASK-MTVBM0C2QWPCL) yalnız pozitif test yazmak yetmez: `AiUsageLog` yazımı
düşünce `AiUsageLogWriteError` gelmesini iddia eden test, `try`'ı fonksiyonun
BAŞINDAN saran yanlış düzeltmede de yeşil kalır — ve o düzeltme kredi-bakiyesi
okuma hatasını "ödendi ama kaydedilmedi" diye etiketleyerek yanlış alarm üretir.

**Neden:** Sarmalamanın değeri iki dalı AYIRMASINDA; pozitif test yalnız bir dalı
ölçer. Ayrımın kanıtı ancak "diğer dal bu tipi ALMAMALI" testidir.

**Nasıl uygula:** Her hata-sarmalama düzeltmesine en az bir negatif test koy —
çağrı-ÖNCESİ aynı biçimde (aynı `withTenant` sarmalayıcısı, aynı ham hata) düşen
bir yolun tipi ALMADIĞINI iddia et. Fabrika'da bunun somut hâli:
`creditLedger.aggregate` reddet (getCreditBalance), `not.toBeInstanceOf(...)` +
`expect(fetchMock).not.toHaveBeenCalled()`. Bu test aşırı-sarmalamada KIRMIZI olur —
bekçi budur. İlgili: [[fabrika-named-error-throw-is-half-the-contract]]
