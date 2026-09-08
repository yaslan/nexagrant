---
name: fabrika-unsourced-claims-hide-in-shared-components
description: Kaynaksız pazarlama iddiası taraması yalnız hedef sayfayı değil, o sayfada render edilen paylaşımlı bileşenleri (footer, navbar) de kapsamalı — dijit-odaklı regex kelime-formu iddiayı ("katlayın"/"accelerate") kaçırır
metadata:
  type: feedback
---

TASK-MTS6MRKDP168Q'da (Sep 2026) iki önceki tur (`3bbff6d`, `f5edd55`) `src/lib/blog.ts` ve
`src/app/[locale]/page.tsx`'i dijit + `%\d+` regex'leriyle tarayıp temizledi, ama
`src/components/PublicFooter.tsx` — 8 herkese açık sayfada (blog dahil) render edilen
paylaşımlı bileşen — aynı sınıf bir iddiayı (`"kazanma oranınızı katlayın"` /
`"Accelerate your win rates"`) rakamsız yazıldığı için taşımaya devam etti. Gerçek tarayıcıda
`readPage` ile kullanıcının GERÇEKTEN gördüğü metni okuyunca ortaya çıktı — statik grep,
hedef dosyanın dışına bakmadığı için kaçırdı.

**Neden:** "kaynaksız istatistik" taraması dosya bazlı değil, **render edilen sayfa bazlı**
olmalı — bir sayfanın gövdesi temiz olsa da paylaşımlı layout/footer/navbar bileşeni kirli
kalabilir. Ayrıca "artırıyor/katlıyor/misli/en iyi/garanti" gibi rakamsız-ama-aynı-sınıf
kelime kalıpları, `/\d/` tabanlı regex'lerin kör noktası — [[fabrika-blog-content-no-blank-line-heading]]
gibi bu da "kod okuman kâfi değil, tarayıcıda gerçek metni oku" dersiyle aynı aile.

**Nasıl uygulanır:** Bundan sonraki bir "kaynaksız iddia" taramasında: (1) yalnız hedef
dosyayı değil, o sayfanın render zincirindeki TÜM paylaşımlı bileşenleri (`PublicFooter`,
`PublicNavbar`, layout.tsx) da tara; (2) regex'e rakamsız kalıpları da ekle
(`katla|misli|garanti|kesin|en (iyi|yüksek)|kat art|guarantee|multiply`); (3) mümkünse
gerçek tarayıcıda `readPage`/`innerText` ile doğrula — statik grep script tag payload'unu
veya prose'u değil, kullanıcının gördüğü metni yakalar.
