---
name: fabrika-plan-card-copy-contradicts-plan-grants
description: Plan kartlarındaki özellik satırları (koltuk/kredi/modül) i18n metni — yetkilendirmenin koştuğu PLAN_GRANTS ile sekiz yerde çelişiyor, yani kullanıcı kartta okuduğunu almıyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fiyat ve ayarlar panellerindeki plan kartlarının "ne alıyorsunuz" satırları
**düz i18n metni** (`billingPanels.settings.plans.*`, `billingPanels.pricing.plans.*`).
Yetkilendirme ise `src/lib/billing/catalog.ts` → `PLAN_GRANTS` üzerinden koşuyor
(`getEntitlements`, `src/lib/billing.ts`). İkisi aynı ekranda iki farklı gerçek
söylüyor — TASK-MTR962OV5YGVX 2. turda ölçüldü:

| Kartın iddiası | `PLAN_GRANTS` |
|---|---|
| basic "500 YZ kredisi / ay" | `aiCreditsMonthly: 100` |
| basic "1 kullanıcı" | `seats: 2` |
| basic "Modüller: M3, M5" | `M2, M3, M5` |
| pro "3.000 YZ kredisi / ay" | `aiCreditsMonthly: 500` |
| pro "Sınırsız çalışma alanı" | `workspaces: 1` |
| pro "Modüller: M1-M6, M8" | M6 **yok** (Evaluator Lens pro'ya dahil değil) |
| ultra "Sınırsız YZ kredisi" | `aiCreditsMonthly: 2_000` |
| ultra "Sınırsız koltuk ve çalışma alanı" | `seats: 15`, `workspaces: 5` |

Bu kozmetik bir tutarsızlık değil: satılan şeyle verilen şey farklı. Fiyat rakamları
kataloğa bağlandı ([[fabrika-three-pricing-universes]]), ama **kapasite iddiaları hâlâ
prose**.

**Nasıl uygula:** plan kartı metnine dokunan her işte önce `PLAN_GRANTS`'i oku ve karşılaştır;
"düzeltelim" demeden önce yönünü sor — metin mi veriye uyacak, veri mi metne (ürün/fiyat
kararı, kod kararı değil). Kalıcı çözüm: özellik satırlarını `PLAN_GRANTS`'ten parametreli
i18n anahtarlarıyla üretmek (`{seats}`, `{credits}`), böylece çelişki tekrar doğamaz.
[[fabrika-billing-ui-lives-in-two-namespaces]] [[fabrika-fabricated-fallback-antipattern]]
