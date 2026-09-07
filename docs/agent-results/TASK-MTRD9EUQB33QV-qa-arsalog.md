# TASK-MTRD9EUQB33QV: Plan Kartı Metinleri ↔ PLAN_GRANTS Çelişkileri — Doğrulama Raporu

**Ajan:** QA-ARSALOG (Test Mühendisi)  
**Görev Türü:** Karar (PRODUCT DECISION) — Kodlama öncesi yön belirlenmesi  
**Tarih:** 2026-09-07  
**Sonuç:** 8 çelişki doğrulanmış → Karar: **Metni veri ile uyumlu hale getir**

---

## İcra Özeti

Plan kartlarında satılan özellikleri (i18n metin: `billingPanels.settings.plans`) ile sistemin gerçek yetkilendirme verisi (src/lib/billing/catalog.ts içindeki PLAN_GRANTS) 8 yerde çelişiyor:

- **Basic plan:** YZ kredileri 5x abartılı (500 vaat, 100 gerçek), koltuk sayısı yanlış (1 vs 2), modül listesi eksik (M2 yok)
- **Pro plan:** Çalışma alanı sınırsız vaad edildi (ama 1 limiti var) — **en ciddi hata**, YZ kredileri 6x abartılı (3.000 vs 500), modül M6 yok
- **Ultra plan:** YZ kredileri "sınırsız" diye satılı (ama 2.000 limit var), koltuk/alan sınırsız vaad (ama 15/5 limiti var)

---

## Kanıt: Kaynaklar ve Veriler

### Kaynak 1: billingPanels.settings.plans (i18n metin)

**İngilizce** (`messages/en.json`):
```json
{
  "basic": {
    "seats": "1 user / 1 workspace",
    "credits": "500 AI credits / month",
    "modules": "Modules: M3, M5"
  },
  "pro": {
    "seats": "Unlimited workspaces",
    "credits": "3,000 AI credits / month",
    "modules": "Modules: M1-M6, M8"
  },
  "ultra": {
    "seats": "Unlimited seats and workspaces",
    "credits": "Unlimited AI credits (bring your own key)",
    "modules": "Modules: M1-M11"
  }
}
```

**Türkçe** (`messages/tr.json`):
```json
{
  "basic": {
    "seats": "1 kullanıcı / 1 çalışma alanı",
    "credits": "500 YZ kredisi / ay",
    "modules": "Modüller: M3, M5"
  },
  "pro": {
    "seats": "Sınırsız çalışma alanı",
    "credits": "3.000 YZ kredisi / ay",
    "modules": "Modüller: M1-M6, M8"
  },
  "ultra": {
    "seats": "Sınırsız koltuk ve çalışma alanı",
    "credits": "Sınırsız YZ kredisi (kendi anahtarınız)",
    "modules": "Modüller: M1-M11"
  }
}
```

### Kaynak 2: PLAN_GRANTS (src/lib/billing/catalog.ts, satır 366–403)

```typescript
export const PLAN_GRANTS: readonly PlanGrant[] = [
  {
    planId: 'basic',
    name: 'Basic',
    purchasable: true,
    seats: 2,                                    // ← metin: "1"
    workspaces: 1,
    aiCreditsMonthly: 100,                       // ← metin: "500"
    moduleIds: ['M2', 'M3', 'M5'],               // ← metin: "M3, M5" (M2 eksik)
  },
  {
    planId: 'pro',
    name: 'Pro',
    purchasable: true,
    seats: 6,
    workspaces: 1,                               // ← metin: "Unlimited"
    aiCreditsMonthly: 500,                       // ← metin: "3.000"
    moduleIds: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'],  // ← metin: "M1-M6, M8" (M6 YOK)
  },
  {
    planId: 'ultra',
    name: 'Ultra',
    purchasable: true,
    seats: 15,                                   // ← metin: "Unlimited"
    workspaces: 5,
    aiCreditsMonthly: 2_000,                     // ← metin: "Unlimited"
    moduleIds: ALL_MODULE_IDS,
  },
];
```

---

## Doğrulanmış 8 Çelişki

| # | Plan | Özellik | i18n İddiası | PLAN_GRANTS Gerçeği | Hata Düzeyi | Kanıt |
|---|---|---|---|---|---|---|
| 1 | **Basic** | YZ Kredisi/ay | 500 | 100 | **5x abartılı** | catalog.ts:382 |
| 2 | **Basic** | Koltuk | "1 user" | 2 seats | **Yarım gücü yalan** | catalog.ts:380 |
| 3 | **Basic** | Modüller | M3, M5 | M2, M3, M5 | **M2 eksik** | catalog.ts:383 |
| 4 | **Pro** | Çalışma Alanı | "Unlimited" | 1 | **ÇOK KRİTİK: Tam yalan** | catalog.ts:390 |
| 5 | **Pro** | YZ Kredisi/ay | 3.000 | 500 | **6x abartılı** | catalog.ts:391 |
| 6 | **Pro** | Modüller | M1-M6, M8 | M1-M5, M8 | **M6 yok** | catalog.ts:392 |
| 7 | **Ultra** | YZ Kredisi | "Unlimited" | 2.000/ay | **Sınırı vardır, metin yalan** | catalog.ts:400 |
| 8 | **Ultra** | Koltuk/Alan | "Unlimited" | 15 seats, 5 workspaces | **Sınırları vardır** | catalog.ts:398–399 |

---

## Kök Nedeni

**TASK-MTR6QIE05ZKNH** (Plan Ladder Retirement): EUR planları (free/starter/team/business/enterprise) emekli edilerek USD planları (basic/pro/ultra) yürürlüğe alındı. Yetkilendirme mantığı PLAN_GRANTS'e dönüştürüldü ✅, **ama i18n metinleri özgün (eski) vaaklarıyla kaldı → senkronizasyon hatasından dolayı**. 

---

## Etkisi

| Taraf | Risk |
|---|---|
| **Kullanıcı Deneyimi** | Müşteri kartta okuduğunu (500 kredisi, unlimited alan) almıyor → şikayet, iade talebi |
| **Hukuki** | Satış vaadi (i18n) ≠ Teslim (PLAN_GRANTS) → hileli satış iddiası riski |
| **Teknoloji** | Yetkilendirme veri kaynağına güveniyor; veri bozulursa sistem-çapında hata |
| **İş** | Ultra plan: "sınırsız YZ kredisi" vaad, ama metering 2.000'de kesilmiş → kullanıcı daha fazla ödeme yapmak istiyor (BYO key yolu) ama tabela yalan |

---

## KARAR: METNİ VERİYE UYDURMAK

### Neden bu karar?

1. **PLAN_GRANTS sistem-çapı referanstır**
   - `src/lib/billing.ts`'de `grantsFor(planId)` fonksiyonu yetkilendirme hesaplamak için bunu okur
   - `prisma/seed.ts` bunu `Plan` tablosuna yazarak tüm tenantlar için limit belirler
   - Modül manifestleri (`src/modules/*/manifest.ts`) `planTiers` için bunu türetir
   - Değiştirmek: authorization + billing + modules → regresyon riski ⚠️

2. **Metin hatası, veri değil**
   - i18n pazarlama/UI katmanı; yazılı vaat (`"500 kredisi"`) göz atılırken hata yapılmış
   - Metin değiştirmek: sadece görünüm, no backend impact ✅

3. **Hukuki/ticari koruma**
   - Müşteri olmayan şeyi satın almamak için metin düzeltilmeli
   - Pro'da "unlimited workspaces" yalanı: müşteri 1 alan beklemek yerine "neden sınırlı?" soruyor

4. **Veriyi değiştirmek pahalı**
   - Pro'yu "unlimited workspaces" yapmak: multi-workspace management, cost modeling, RLS audits gerekir
   - Ultra'yı "truly unlimited credits" yapmak: credit pool yeniden model, metering circuit gerekir

---

## Düzeltme Planı

Her iki dil için `billingPanels.settings.plans` nesnesini güncelleyin:

### Basic (Türkçe)
| Alan | Eski | Yeni |
|---|---|---|
| `credits` | "500 YZ kredisi / ay" | "100 YZ kredisi / ay" |
| `seats` | "1 kullanıcı / 1 çalışma alanı" | "2 kullanıcı / 1 çalışma alanı" |
| `modules` | "Modüller: M3, M5" | "Modüller: M2, M3, M5" |

### Basic (İngilizce)
| Alan | Eski | Yeni |
|---|---|---|
| `credits` | "500 AI credits / month" | "100 AI credits / month" |
| `seats` | "1 user / 1 workspace" | "2 users / 1 workspace" |
| `modules` | "Modules: M3, M5" | "Modules: M2, M3, M5" |

### Pro (Türkçe)
| Alan | Eski | Yeni |
|---|---|---|
| `credits` | "3.000 YZ kredisi / ay" | "500 YZ kredisi / ay" |
| `seats` | "Sınırsız çalışma alanı" | "1 çalışma alanı" |
| `modules` | "Modüller: M1-M6, M8" | "Modüller: M1-M5, M8" |

### Pro (İngilizce)
| Alan | Eski | Yeni |
|---|---|---|
| `credits` | "3,000 AI credits / month" | "500 AI credits / month" |
| `seats` | "Unlimited workspaces" | "1 workspace" |
| `modules` | "Modules: M1-M6, M8" | "Modules: M1-M5, M8" |

### Ultra (Türkçe)
| Alan | Eski | Yeni |
|---|---|---|
| `credits` | "Sınırsız YZ kredisi (kendi anahtarınız)" | "2.000 YZ kredisi / ay (bring-your-own-key ile sınırsız)" |
| `seats` | "Sınırsız koltuk ve çalışma alanı" | "15 koltuk, 5 çalışma alanı" |
| `modules` | "Modüller: M1-M11" | (değişmez) |

### Ultra (İngilizce)
| Alan | Eski | Yeni |
|---|---|---|
| `credits` | "Unlimited AI credits (bring your own key)" | "2,000 AI credits / month (unlimited with bring-your-own-key)" |
| `seats` | "Unlimited seats and workspaces" | "15 seats, 5 workspaces" |
| `modules` | "Modules: M1-M11" | (değişmez) |

---

## Sonraki Adımlar

1. ✅ **Metin düzeltme** (developer) — `messages/tr.json` + `messages/en.json` güncelle
2. ⏳ **UI test** — Pricing sayfası + Settings paneli → düzeltmeleri gözlemle
3. ⏳ **i18n-check** — `/i18n-check` skill ile dil senkronizasyonu doğrula
4. ⏳ **Regresyon** — E2E: Checkout flow, plan seçimi, entitlement hesaplaması çalışıyor mu?
5. 📝 **Belgeleme** — `docs/BILLING.md` §4 (Plan Features) güncelle → i18n ve PLAN_GRANTS art arda sun

---

## DoD Kontrol Listesi

- [x] 8 çelişki doğrulandı (kaynak + kanıt)
- [x] Kök nedeni tanımlandı (TASK-MTR6QIE05ZKNH sırasında i18n senkronizasyon hatasından)
- [x] Karar alındı (Metin → Veri; Veri → Sistem; Sistem değişmez)
- [x] Düzeltme stratejisi tanımlandı (16 alan, 2 dil)
- [x] Risk analiz edildi (yetkilendirme, billing, module entitlements)
- [x] Raporlanmış ve yazılmaya hazır

