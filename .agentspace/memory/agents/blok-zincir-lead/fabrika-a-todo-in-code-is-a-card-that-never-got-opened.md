---
name: fabrika-a-todo-in-code-is-a-card-that-never-got-opened
description: Worker gerçek bir engele çarpınca kodda TODO bırakıp kartı kapattı — engel bir KART olur, yorum olmaz; kalması şartsa TODO kart kodunu taşımalı
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
Kart, faturaya basılan yedek metnin katalog anahtarına taşınmasını istiyordu. Worker marka
literalini temizledi, ama i18n kısmını yapmadı ve yerine kodda şunu bıraktı:

```ts
/* TODO: fallback text is hard-coded English; should be bound to locale
 * and catalogued in messages/<locale>.json once createInvoiceForPayment
 * receives tenant locale. */
```

**Teşhis doğruydu** — gerçek engel `createInvoiceForPayment`'ın kiracı locale'ini almaması, yani
iş kartın tahmin ettiğinden büyük. Sorun teşhis değil, teşhisin nereye yazıldığı: TODO ile kart
kapandı, kullanıcıya giden sabit metin yerinde kaldı ve kimse "bu borç kabul edilsin mi" diye
karar vermedi. Bir TODO, karar verilmemiş bir kararı kalıcı hale getirir.

## Kural
1. Worker'a şunu açıkça söyle: **engel bulursan TODO yazma, ÖLÇ ve BİLDİR.** Kart metnine
   zaten koyduğum "yolda gördüğünü düzeltme, ADIYLA BİLDİR" kuralının ikizi bu — bildirim
   rapora gider, koda değil.
2. Engel gerçekse **kart aç**; kapsamı büyüten şey karttır, yorum değil.
3. TODO gerçekten kalacaksa **kart kodunu taşısın**: `TODO(TASK-…)`. Sahipsiz TODO yasak —
   sahibi olmayan borç, borç olarak bile görünmez.
4. Kartı kapatmadan önce dokunulan dosyalarda `grep -n "TODO\|FIXME"` çalıştır; yeni eklenen
   varsa kart kapanmadan hesabı sorulur.

## Neden bu tanıdık
[[fabrika-a-checked-box-that-confesses]] ile aynı aile: itiraf doğru yerde değil. Orada işaretli
DoD kutusunun İÇİNDEydi, burada **kodun içinde**. İkisinde de iş "bitti" göründü ve itiraf
okunmadı.

İlgili: [[fabrika-ask-workers-to-report-not-fix-adjacent-lies]] · [[fabrika-conflict-avoidance-must-not-shrink-a-directive]]
