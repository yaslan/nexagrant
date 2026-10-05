---
name: fabrika-iyzico-billing-flow
description: Fabrika iyzico ödeme akışının kilit kararları — kiracı conversationId'den okunur, para sağlayıcıdan yeniden okunur, imza şeması sandbox'a karşı HENÜZ doğrulanmadı
metadata:
  type: project
  updatedAt: 2026-09-07
---

S10 / TASK-MTPZL9GK4TFS1'de `src/lib/iyzico.ts` + `src/app/api/webhooks/iyzico/route.ts`
tamamlandı (commit `5bd921a`). Koda bakınca hemen görünmeyen kararlar:

- **Kiracı atfı `conversationId` ile taşınır.** Checkout'ta `fabrika:<tenantId>:<planId>:<interval>:<nonce>`
  üretilir; iyzico bunu bildirimde ve ödeme detayında aynen geri verir. Webhook gövdesindeki
  `tenantId` alanı artık HİÇ okunmuyor — atfedilemez bildirim reddedilir.
- **Para ve statü sağlayıcıdan yeniden okunur** (`/checkoutform/auth/ecom/detail`); bildirim
  yalnızca "bir şey oldu" sinyalidir.
- **AÇIK RİSK:** bildirim imzasının kanonik dizgisi
  (`secretKey + iyziEventType + paymentId + paymentConversationId + status`) **sandbox anahtarı
  olmadığı için gerçek bir teslimle doğrulanmadı.** Tek fonksiyonda izole:
  `notificationSignaturePayload`. Canlıya almadan önce bir sandbox teslimiyle replay edilmeli.
- **TL fiyatları `TRY_PLAN_PRICES`'ta kuruş cinsinden kodda.** BILLING.md §4 bunların
  `Plan.prices[]` JSON kolonuna taşınacağını söylüyor; kolon henüz yok, kur güncellemesi deploy
  gerektiriyor.
- `src/lib/money.ts` bu görevde OLUŞTURULDU (CLAUDE.md kural 9 onu işaret ediyordu ama dosya
  yoktu). Kuruş↔decimal dönüşümü yalnız orada yapılır.

**Why:** Bu akışa dönen bir sonraki kişi "imza doğrulaması var, demek ki bitti" sanmasın —
şema doğrulanmamış bir varsayım. Ve fiyatın neden kodda olduğunu tekrar sorgulamasın.

**How to apply:** iyzico'ya dokunmadan önce bu dosyayı ve
`docs/agent-results/TASK-MTPZL9GK4TFS1-geli-tirici.md`'yi oku. İlgili:
[[fabrika-stripe-idempotency-guard-dead]], [[fabrika-next16-second-dev-server-refused]]
