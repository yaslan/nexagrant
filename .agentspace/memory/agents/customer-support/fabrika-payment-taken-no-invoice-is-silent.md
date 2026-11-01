---
name: fabrika-payment-taken-no-invoice-is-silent
description: Fabrika'da ödeme alınıp fatura kesilemediğinde kullanıcıya HİÇBİR ŞEY söylenmiyor — faturalama ekranı "henüz fatura düzenlenmedi" diyor; TenantBillingIdentity'ye yazan hiçbir kod yok
metadata:
  type: project
  updatedAt: 2026-09-09
---

TASK-MTU64Y932HF96 (e-Fatura metin envanteri) sırasında ölçüldü.

`createInvoiceForPayment` altı gerekçeyle `skipped` dönebiliyor (`src/lib/billing/invoice-writer.ts:80-95`:
`buyer_identity_missing`, `vat_country_unknown`, `amount_not_invoiceable`, `number_allocation_failed`,
`fx_rate_unavailable`, `fx_currency_unsupported`). Her biri `SystemAlert` yazıyor — **İngilizce, iç kayıt**.

**İki çağıranın ikisi de sinyali kullanıcıya taşımıyor — ama farklı biçimde** (2026-09-09 2. geçişte
düzeltildi; ilk yazımda "ikisi de atamıyor" demiştim, yanlıştı):
- **Stripe** `src/lib/billing/subscription-sync.ts:639` — `await createInvoiceForPayment(...)`,
  dönüş değeri hiçbir yere atanmıyor; `skipped` sinyali **tamamen kayboluyor**.
- **iyzico** `src/lib/iyzico.ts:739` — `const invoice = ...` ve `:757`'de
  `invoiceNumber: invoice.status === 'skipped' ? null : invoice.number` olarak **kullanılıyor**; ama
  gittiği yer `handleIyzicoWebhook`'un dönüşü → `api/webhooks/iyzico/route.ts:70`
  `NextResponse.json({ received: true, ...result })` — yani cevabı **iyzico'nun sunucusu** okuyor,
  kullanıcı değil.

Net etki aynı: ödeme tamamlanıyor, fatura satırı yazılmıyor, kullanıcıya tek kelime edilmiyor.
**Düzeltme maliyeti aynı değil:** iyzico'da sinyal zaten üretiliyor (ucuz), Stripe'ta önce yakalanması
gerekiyor. Kart yazan buna göre bölmeli. Kullanıcı Ayarlar → Faturalama'yı açıyor ve
`invoiceEmptyTitle/Body`'yi okuyor: *"Henüz fatura düzenlenmedi — …İlk fatura düzenlendiğinde burada
listelenecek."* Yani **parası alınmış** bir kullanıcıya **sakin ve olumlu** bir metin gösteriliyor;
"demek daha kesilmemiş" deyip bekliyor. Ürünün en yanıltıcı metni bu.

En olası gerekçe `buyer_identity_missing` ve bunun ayrı ağırlığı var:
`grep -rn "tenantBillingIdentity" src` → yalnız **iki okuma** (`invoice-writer.ts:377`,
`checkout-tax.ts:59`). Yazan form/API/seed **yok**. Yani kiracının fatura kimliğini ne kullanıcı ne
destek dolduramıyor — ticket her seferinde mühendisliğe gidiyor.

Aynı boşluğun ödeme adımındaki ikizi: `taxLineForTenant` ülkeyi çözemezse `resolved:false` + `vatMinor:0`
dönüyor, checkout yanıtı bunu taşıyor (`checkout/route.ts:237-243`) ama **hiçbir .tsx basmıyor**
(`grep grossTotalMinor|tax.resolved|vatMinor src --include=*.tsx` → 0). Fiyat sayfası ise
"KDV ödeme adımında eklenir" diyor (`messages/tr.json:1260,1438`) — vaat/gerçek tutarsızlığı.

**Faturalama paneli bu durumu GÖREMEZ — kimlik bloğu döngüsel** (2026-09-09 ölçümü):
`settings/billing/page.tsx:209` kimliği `latestBuyerIdentity(records)` ile **düzenlenmiş faturalardan**
türetiyor (`invoice-list.ts:151-161`, "en yeni faturanın taşıdığı anlık görüntü"), `TenantBillingIdentity`
tablosunu **hiç okumuyor**. Yani kimlik eksik → fatura kesilemiyor → gösterilecek fatura yok → kimlik
bloğu `notMeasured` ("ölçülmedi", `tr.json:1500`) yazıyor. Panel bu yüzden **"hiç satın almadı"** ile
**"parası alındı ama fatura kesilemedi"** durumlarını birbirinden ayıramıyor; uyarıyı kime göstereceğini
bilmiyor. Uyarı kartı yazan önce sayfaya bu ayrımı yapacak veriyi vermeli
(`TenantBillingIdentity` okuması + ödeme/`skipped` durumu), yoksa uyarı ya herkese ya kimseye çıkar.

**Altı gerekçenin yalnız BİRİ kullanıcının düzeltebileceği şey:** `buyer_identity_missing`. Diğer beşi
(`vat_country_unknown`, `amount_not_invoiceable`, `number_allocation_failed`, `fx_rate_unavailable`,
`fx_currency_unsupported`) operasyon/mühendislik işi. Tek bir genel "fatura bilgilerinizi giriniz"
uyarısı, vakaların 6'da 5'inde kullanıcıyı **haksız yere** kendi veremeyeceği bir eyleme yönlendirir.

**Why:** "Ödemem geçti ama fatura yok" ticket'ında destek ekranda hiçbir hata göremez ve önce
kullanıcıya inanmaz. Bu bir metin kusuru gibi görünmüyor çünkü ortada **hata metni yok**.

**How to apply:** Böyle bir ticket geldiğinde ekrana değil `SystemAlert` tablosuna bak, `paymentRef`
ile ara — gerekçe orada, İngilizce. Faturalama/ödeme UX'ine dokunan bir göreve girersen bu boşluğu
bilinen-açık say. Kullanıcıya ne söyleneceği bir **ticari taahhüt**, destek tek başına yazmamalı.
Tam envanter ve öneri metinleri: `docs/agent-results/TASK-MTU64Y932HF96-customer-support.md`;
doğrulama + delta (16/16 iddia hâlâ geçerli): `…-customer-support-2.md`.

İlgili: [[fabrika-text-inventory-must-hunt-missing-messages]] ·
[[fabrika-einvoice-real-record-or-404]] (aynı akışın filing tarafı, hâlâ bağlı değil)
