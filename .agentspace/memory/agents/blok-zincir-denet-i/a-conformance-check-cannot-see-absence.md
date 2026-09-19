---
name: a-conformance-check-cannot-see-absence
description: Doğru API'nin VARLIĞINA bakarak çalışan her denetçi, o API'nin YOKLUĞUNU göremez — yeşil kapıyı gördüğünde "kaç dosya bu kapıya hiç girmiyor" diye ölç
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Tekrar eden bir kapı deseni: denetçi önce "bu dosya ilgili API'yi kullanıyor mu" diye
bakar, kullanmıyorsa `continue` eder; sonra kullananlar arasında uygunluk ölçer. Böyle bir
kapı **uygunluğu** ölçer, **kapsamı** değil. Kuralı hiç uygulamamış dosya en yüksek puanı
alır — çünkü hiç ölçülmez.

Somut örnek: Fabrika `i18n:check` (bkz. [[fabrika-i18n-check-skips-files-with-no-t-call]]).
Katalog paritesi kusursuz, kapı yeşil; buna karşılık 50 dosyada 480 sabit metin ve on rota
`/en` altında tamamen tek dilde. Aynı desen başka yerlerde de aranmalı: `withTenant`
kullanmayan sorgu, `AiUsageLog` yazmayan LLM çağrısı, `Evidence`'a bağlanmamış rakam —
hepsi "doğru sarmalayıcıyı kullananlar" içinde denetleniyor.

QA refleksi: bir kapı yeşil raporladığında ilk soru "ne doğruladı" değil,
**"kaç dosya bu kapının hiç konusu olmadı"**. Cevabı `grep -rL <api>` ile bir dakikada
ölçülür ve genelde kapının kendi çıktısından daha büyük bir kusur çıkar.

İkinci ders: böyle bir borcu ölçtükten sonra kapıyı hemen sıkılaştırmayı önerme —
mevcut ihlal sayısı kapıyı anında kırmızıya kilitler ve ekip kuralı gevşetir.
Baseline'lı sıkılaştırma öner: liste büyürse kırmızı, küçülürse baseline güncellenir.
