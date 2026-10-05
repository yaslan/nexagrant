# ADR-0005 — Pazar yeri üründen kaldırılır

- **Durum:** **KABUL**, patron kararı
- **Tarih:** 2026-09-29
- **Uygulama kartı:** TASK-MULSEGTKZ7O7D (fe-fb) · iptal edilen kartlar: TASK-MULRTXZ5MCEOX, TASK-MULRUK9LKGOTP
- **Hazırlayan:** LEED-FB · **Karar veren:** patron

## Problem

`docs/BUSINESS_MODEL.md` §5.4, kurumlar arası bir pazar yeri öngörüyordu: danışman ve hakem hizmeti (%12 komisyon), konsorsiyum koltuğu ilanları (€99 premium) ve kent ortağı eşleşmesi. Kodda bunun yarım bir hali vardı (`src/modules/marketplace`, `MarketplaceListing`, `MarketplaceOrder`). Vitrin yoktu, ödeme bağlı değildi, komisyon kodda %10'du. Güvenlik incelemesi (TASK-MULQLVLW21FE2) bu alanda ek düzeltme kartları doğurdu.

## Karar

Patron: "Pazar yeri ve satış yok." Pazar yeri; kod, şema, çeviri, test ve belgelerden kaldırılır.

**Kalanlar:** abonelik, planlar, eklentiler, hizmet paketleri, faturalama (Stripe/iyzico, kamu TL paketleri), veri/API lisansı ve M8 Consortium Matching modülü (ortak eşleştirme). M8 satış içermez.

## Sonuçlar

- Gelir modeli beş kalemden dörde iner; pazar yerinin %6 hedefi dağıtılır ya da hedeflerden düşülür (`BUSINESS_MODEL.md` güncellenir).
- Şemadan `MarketplaceListing` ve `MarketplaceOrder` düşer. Yeni `drop-marketplace` migration'ı idempotent ve geri alınabilir yazılır. Eski migration dosyaları geçmiş olarak kalır.
- `docs/agent-results/` ve ajan hafızaları tarihsel kayıttır, değiştirilmez.

## Geri dönüş

İleride yeniden istenirse `drop-marketplace.down.sql` tabloları kurar, kod git geçmişinden (`e8a6b8e3`, `c8dcef26` öncesi ve sonrası) geri alınabilir.
