---
name: fabrika-boss-keeps-a-red-gate-rather-than-hiding-it
description: Patron, gercek bir hatayi gosteren kapiyi gecici olarak gevsetmek yerine KIRMIZI birakmayi secti — kapsami kismak bir secenek olarak sunulmasin
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

2026-09-09: `pnpm gate` e2e'yi kapsamaya başladı (`1ffd154`) ve ilk koşuşunda 8 test kırmızı
verdi — sebep gerçek bir hataydı (aynı boş-durum `<h2>`'si sayfada iki kez basılıyor).
Seçenek olarak sundum: kapı kırmızı kalsın mı, yoksa e2e geçici olarak gate'ten çıkarılıp iş
bitince geri mi konsun?

**Patron: "Kırmızı kalsın."**

Yorum: bu ofiste kapıyı yeşile boyamak — testi gevşetmek, kapsamı kısmak, adımı geçici
kaldırmak — kabul edilen bir çözüm değil. Bir kapı gerçek bir hatayı gösterdiğinde doğru
hamle hatayı düzeltmektir, kapıyı kısmak değil. Bunu bir daha SEÇENEK olarak sunma; kapı
kırmızıysa doğrudan düzeltme kartını aç ve kırmızının kimi bloke ettiğini raporla.

(Blast radius burada küçüktü: depoda remote yok, `githooks/pre-push` tam gate koşsa da
fiilen kimsenin push'u durmuyordu.)

İlgili: [[fabrika-gate-includes-e2e-and-pre-push-runs-it]] ·
[[fabrika-a-checked-box-that-confesses]]
