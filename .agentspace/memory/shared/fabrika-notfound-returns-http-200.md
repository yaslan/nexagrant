---
name: fabrika-notfound-returns-http-200
description: Fabrika'da notFound() çağıran sayfa doğru 404 EKRANINI gösterir ama sunucu HTTP 200 döner — "404 çalışıyor" kanıtını ekran görüntüsüne dayandırma, durum kodunu ayrıca ölç
metadata:
  type: project
  updatedAt: 2026-09-07
---

`(app)/[workspace]/...` altındaki bir sayfa `notFound()` çağırdığında kullanıcı doğru
"404 — Sayfa Bulunamadı" ekranını görür, ama **sunucu HTTP 200 döndürür**.

2026-09-07'de oturum çerezli curl ile ölçüldü (TASK-MTQW5BVFW6CMT):

```
uydurma-id-123/briefs        HTTP 200   <- gövde 404 sayfası, kod yanlış
uydurma-id-123/application   HTTP 200
uydurma-id-123/matching      HTTP 200   <- benim dokunmadığım eski kod, aynı
uydurma-id-123/evaluations   HTTP 200   <- aynı
/tr/main/zzzz                HTTP 404   <- eşleşmeyen rota: DOĞRU
```

Yani sorun tek bir sayfada değil, `notFound()` çağıran **her** sayfada. Eşleşmeyen bir rota
doğru 404 döndüğü için sebep büyük olasılıkla `src/app/not-found.tsx`'in `[locale]` segmentinin
**dışında** olması: sınır rota ağacının içinde çözülmüyor. (Kart: TASK-MTQYY136Q3CGG.)

**Why:** İki şeyi birden bozuyor — arama motorları var olmayan kaydı indekslenebilir sayfa
sanıyor, uptime/hata izleme 404'leri hiç görmüyor. Ayrıca doğrulama yaparken yanıltıyor:
`curl -w '%{http_code}'` "200" derken ekran "404" diyor; hangisine inanacağını bilmezsen
ya var olmayan bir hatayı kovalarsın ya da gerçek olanı atlarsın.

**How to apply:** Fabrika'da "404 veriyor mu" doğrulaması yaparken **gövdeye** bak, koda değil:
`grep -c 'Sayfa Bulunamadı'` = 1 **ve** `grep -c 'Fraunhofer\|<uydurma veri işareti>'` = 0.
Durum kodunu da ölç ama 200 görünce paniğe kapılma — bu bilinen, app geneli, senden önce
var olan bir kusur; raporunda "benim değişikliğim değil" diye ayrıca belirt ve karta bağla.

Kök `src/app/not-found.tsx` ayrıca i18n'siz: "Sayfa Bulunamadı" / "Ana Sayfaya Dön" sabit
Türkçe, İngilizce arayüzde de Türkçe çıkıyor (CLAUDE.md §8 ihlali, aynı kartta).

İlgili: [[fabrika-fabricated-fallback-antipattern]] · [[fabrika-workspace-url-segment-is-decorative]] · [[fabrika-runtime-verification-recipe]]
