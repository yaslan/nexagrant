---
name: fabrika-ignored-result-claim-needs-a-destination-trace
description: "Dönüş değeri kullanılmıyor" iddiasını atama arayarak kurma — atanmış olabilir ama varış noktası kullanıcı değil bir webhook gövdesi olabilir; sinyali gideceği yere kadar izle
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

TASK-MTU64Y932HF96'nın ikinci geçişinde kendi raporumu düzelttim.

İlk geçişte "ödeme alındı ama fatura yok, kullanıcı hiç uyarılmıyor" bulgusunu şöyle kurmuştum:
*"iki çağıranın ikisi de dönen sonucu kullanmıyor"*. Ölçüm yöntemim `grep -rn "createInvoiceForPayment"`
çıktısında **`const x = await` var mı** diye bakmaktı. Stripe ayağında (`subscription-sync.ts:639`)
gerçekten yok. Ama iyzico ayağında (`iyzico.ts:739`) **vardı** — `invoice.status === 'skipped'`
kontrolü yapılıyor, `invoiceNumber: null` üretiliyor. Yani "kullanılmıyor" cümlem yanlıştı.

Bulgunun kendisi ayakta kaldı, çünkü sinyalin **varış noktası** kullanıcı değildi:
`handleIyzicoWebhook` dönüşü → `api/webhooks/iyzico/route.ts:70` →
`NextResponse.json({ received: true, ...result })` → cevabı **ödeme sağlayıcısının sunucusu** okuyor.

**Why:** "Dönüş değeri kullanılmıyor" destek raporlarında güçlü ve kolay bir cümle; atamanın yokluğuna
bakarak kurulabildiği için doğrulanmış hissettiriyor. Ama asıl soru "atanıyor mu" değil,
**"bu sinyal insana ulaşıyor mu"**. Atanmış bir değer bir log satırında, bir webhook gövdesinde ya da
kullanılmayan bir dönüş alanında ölebilir — kullanıcı yine hiçbir şey görmez, ama sebebi başkadır ve
**düzeltme maliyeti başkadır** (iyzico'da sinyal hazır, Stripe'ta yok). Kart yazan bunu bilmeli.

**How to apply:** Böyle bir iddiayı yazmadan önce zinciri sonuna kadar sür: atama var mı → atanan
değer nereye giriyor → o nesneyi kim okuyor → o okuyucu bir **insan arayüzü** mü? Son adım
`grep -rn "<alan adı>" src --include="*.tsx"` → 0 sonuç ile biter; asıl kanıt budur, atamanın yokluğu
değil. Raporda da "kullanılmıyor" yerine "kullanıcıya ulaşmıyor, çünkü varış noktası X" diye yaz.

İlgili: [[fabrika-payment-taken-no-invoice-is-silent]] · [[fabrika-text-inventory-must-hunt-missing-messages]]
