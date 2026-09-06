# BILLING.md — Planlar, eklentiler, yetkilendirme, ödeme

## 1. Katalog (seed: `prisma/seed.ts`)

| Plan id | Ad (tr/en) | Aylık | Yıllık (−20%) | Koltuk | Çalışma alanı | YZ kredi/ay | Varsayılan ON modüller |
|---|---|---|---|---|---|---|---|
| `free` | Keşif / Discover | €0 | €0 | 1 | 1 | 10 | M3 (lite: 50 kanıt), K1 (3 kayıtlı arama) |
| `starter` | Başlangıç / Starter | €59 | €566 | 2 | 1 | 100 | M3, M5, M2 (3 taslak/ay) |
| `team` | Ekip / Team | €249 | €2.390 | 6 | 1 | 500 | M1, M2, M3, M4, M5, M8 |
| `business` | İşletme / Business | €599 | €5.750 | 15 | 5 | 2.000 | + M6, M9, M10, M11 |
| `enterprise` | Kurumsal / Enterprise | ≥ €1.500 (sözleşme) | — | ∞ | ∞ | sözleşme | tümü + M7, API, beyaz etiket, SSO, SLA |

| Eklenti sku | Ad | Fiyat | Verir | Uygun planlar |
|---|---|---|---|---|
| `addon_m6` | Evaluator Lens | €99/ay | M6 | team |
| `addon_m11` | Full Application | €149/ay | M11 | team |
| `addon_m7` | TTO Accelerator | €129/ay | M7 | team, business |
| `addon_m8_pro` | Consortium Matching Pro | €79/ay | M8 | starter |
| `addon_workspace` | Ek çalışma alanı | €49/ay | +1 workspace | business |
| `addon_seat_starter/team/business` | Ek koltuk | €19 / €29 / €39 /ay | +1 seat | ilgili plan |
| `addon_credits_250` | 250 YZ kredisi | €49 tek seferlik | +250 kredi | tümü |

Kredi maliyeti: M2 taslak 1, M6 değerlendirme 3, M9 brifing 1, M10 belge 1, M11 bölüm 2, M1 profil özeti 1, M3 kaynak özeti 1. Kredi bitince YZ özellikleri "satın al" diyaloğu; diğer işlevler çalışmaya devam eder.

Deneme: `starter` ve `team` için 14 gün ücretsiz deneme (kart gerekli değil; deneme sonunda `free`'ye düşer, veri korunur).

## 2. Yetkilendirme hesabı

```
entitlements(tenant) = plan.defaults
  + Σ activeAddOns.grants
  + { seats: plan.seats + sub.seatsExtra, workspaces: plan.workspaces + sub.workspacesExtra }
allowedModules = plan.modules ∪ addOns.grantsModule
```

- `canEnable(module)`: `module ∈ allowedModules` **ve** bağımlılıklar `ON|PILOT`.
- Plan düşürme (downgrade): kapsam dışı kalan modüller `OFF` (kademeli), veri korunur; koltuk fazlası varsa kullanıcılar "askıda" (giriş yok) — sahip seçer.
- Plan yükseltme: yeni varsayılan modüller otomatik `ON` **değil**, `PILOT` yapılır ve sahibe "aç" önerisi gösterilir (bilinçli açma ilkesi).

## 3. Stripe akışı (MVP)

- Ürünler/fiyatlar Stripe'ta; id'ler `Plan.stripePrice*` ve `AddOnCatalog.stripePriceId`.
- Checkout Session (mode=subscription) → webhook `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.payment_failed` → `Subscription`, `AddOn`, `CreditLedger(monthly_grant)`.
- Eklenti: mevcut aboneliğe `subscription item` ekle (prorasyon) → webhook → `AddOn` + `enable(module, 'on')` (bağımlılık eksikse `PILOT` + uyarı).
- Stripe Customer Portal: kart, fatura, iptal.
- Vergi: Stripe Tax (AB KDV/OSS); Türkiye faturaları için e-fatura entegrasyonu faz 2 (Paraşüt/Logo API).

## 4. iyzico (faz 2, TL)

Aynı `Subscription.provider='iyzico'`; fiyat listesi TL olarak ayrı (`Plan.prices[]` JSON'a taşınır); abonelik API'si + webhook; kur güncellemesi aylık, fiyat değişimi 30 gün önce bildirilir.

## 5. Hizmet paketleri ve başarı primi

- Hizmetler `ServiceOrder` (faz 2) ile platformda takip edilir; ödeme Stripe fatura ya da banka havalesi.
- Başarı primi: sözleşmede "AB hibesinden ödenmez, uygun maliyet değildir" maddesi; hesaplama kademeli (örn. ilk €500 K %5, sonrası %3, tavan €40 K); fatura hibe sözleşmesi imzalandığında.
- Uyum notu: EIC Board danışman kılavuzu — başarı primi uygun maliyet değildir; kod ve sözleşme şablonları bunu yansıtır.

## 6. Pazar yeri ve API (v1.3)

- `MarketplaceListing` (danışman/hakem), `Engagement` (görev, tutar), `Commission` (%12, Stripe Connect ile bölüşüm).
- `ApiKey` (tenant, scope, rate limit) → `/api/v1/partners/*` (M1 verisi), €299/ay 10.000 çağrı; aşımda 429 + üst paket önerisi.

## 7. Raporlama

Yönetici: MRR, ARPA, churn, kredi tüketimi, eklenti oranı (PostHog + Stripe). Kiracı: fatura geçmişi, kredi geçmişi, koltuk kullanımı.
