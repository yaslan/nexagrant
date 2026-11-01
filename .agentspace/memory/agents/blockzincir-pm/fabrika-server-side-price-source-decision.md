---
name: fabrika-server-side-price-source-decision
description: "Aktif indirim kademesi nereden gelmeli" sorusunun Fabrika'daki cevabı: DB abone sayısı seed verisiyle kirli, env değişkeni seçildi — ve yıllık fiyatta indirim bir kez uygulanır
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTR6Q2IODYQRC'de verdiğim iki fiyat kararı ve gerekçeleri (yeniden sorulursa tekrar
ölçmeyeyim diye).

## Aktif kademe: env, DB sayımı değil

"Abone sayısına bağla" cazip görünüyordu. Ölçtüm: `Subscription` tablosunda **tek satır** var
(status ACTIVE) ve o satır seed edilmiş demo kiracı; `Tenant` de 1. Sayıya bağlansaydı bugün
"1 abone → %70 indirim" tohum verisinden okunacaktı. Tablo ödeyen müşteriyi demo/beta/seed
kiracıdan ayırt edemiyor, `SubStatus` TRIALING'i ACTIVE ile sayıyor.

→ `BILLING_ACTIVE_TIER` ortam değişkeni (`src/lib/env.ts`). Kademe eşikleri (5/15/35/85/185/385/885)
yine de `DISCOUNT_TIERS`'te duruyor; sayım denetlenebilir olduğunda `tierForSubscriberCount()`
hazır. **Genel kural:** bir iş kuralını DB sayımına bağlamadan önce o sayının içinde seed/demo
satır olup olmadığını SOR — CLAUDE.md kural 7 "gösterilen oran bir kayda bağlı olsun" der, seed
satırı kayıt değildir.

## Yıllık fiyat: indirimi yıllık toplama bir kez uygula

İki sıralama var ve fark ölçülebilir:
- `round(aylık-eşdeğer × (1−d)) × 12` → yarım kuruşu yukarı yuvarlar, hatayı 12 ile çarpar
- `round(yıllık-toplam × (1−d))` → tek yuvarlama

Basic %70'te fark yılda 6¢, müşterinin aleyhine. İkincisi seçildi; ayrıca Stripe yıllık aboneliği
**tek `unit_amount`** olarak tahsil ediyor, yani tam sayı cent olmak zorunda olan rakam yıllık
rakam. Gösterilen aylık figür `monthlyEquivalentMinor` olarak ayrı duruyor ve testte "asla tahsil
edilmez" diye sabitlendi.

Bkz. [[fabrika-client-priced-checkout-was-undercharging]]
