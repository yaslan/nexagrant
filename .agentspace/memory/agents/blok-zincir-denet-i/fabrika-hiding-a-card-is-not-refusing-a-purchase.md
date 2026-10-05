---
name: fabrika-hiding-a-card-is-not-refusing-a-purchase
description: Görünürlük kusurlarında listeyi ve satın almayı AYRI ölç — kart gizlendiği hâlde endpoint sku'yu elle kabul edebilir; ayrıca "yok" ile "senin değil" tek mesajla cevaplanmalı
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Fabrika'da `Plan.visibility='private'` + 0 atama iken kart herkese açık fiyat sayfasında duruyordu **ve** `POST /api/billing/checkout` aynı sku'ya `totalMinor: 4500` dönüyordu. Kartı gizlemek ilkini kapatır, ikincisini kapatmaz: istek bir karttan gelmek zorunda değil.

**Kural:** Bir "X, Y'ye görünmemeli" kusurunda iki ölçüm gerekir —
1. listede/ekranda YOK (`toHaveCount(0)`, ve boş-doğrulama olmasın diye "diğerleri hâlâ var" da iddia edilsin),
2. sku/id ELLE verildiğinde de reddediliyor (birden çok biçimde: `plan-basic`, `basic`, `BASIC`).

Doğru mimari: reddi, tutarın üretildiği yerde yap (`priceLineForTenant`), listeyi üreten **aynı** görünür kümeye karşı çöz — "gösterilen" ile "satın alınabilen" tek küme olsun, iki ayrı cevap olmasın.

**Sızıntı ayrıntısı:** "böyle paket yok" ile "bu paket senin değil" istemciye AYNI mesajla dönmeli, yoksa endpoint özel paketleri numaralandırmaya yarar. Ayrım yalnız sunucu log'unda (`reason: 'unknown' | 'not-visible'`).

Ölçüm rolü: [[fabrika-local-app-role-bypasses-rls]] — bu tür ölçümü `fabrika` (SUPERUSER) rolüyle yapmak yanlış yeşil verir.
