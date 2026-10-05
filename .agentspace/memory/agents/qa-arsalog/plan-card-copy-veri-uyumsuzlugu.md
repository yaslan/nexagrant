---
name: plan-card-copy-veri-uyumsuzlugu
description: Plan kartı i18n metinleri (billingPanels.settings.plans) ile PLAN_GRANTS veri kaynağı 8 yerde çelişiyor — metin güncellenmelidir
metadata:
  type: project
  updatedAt: 2026-09-07
---

## Karar: Plan Kartı Metni ↔ PLAN_GRANTS Senkronizasyonu

**Durum:** Doğrulandı ✅ (TASK-MTRD9EUQB33QV)  
**Etki:** Müşteri kartta okuduğunu almıyor (satış vaadi ≠ teslim)  
**Çözüm:** Metin metode PLAN_GRANTS veri kaynağına göre düzelt

### Çelişkiler (8 toplam)

| Plan | Özellik | i18n | PLAN_GRANTS | Hata |
|---|---|---|---|---|
| **Basic** | YZ kredisi | 500/ay | 100/ay | 5x fazla |
| | Koltuk | 1 user | 2 seats | Yarım |
| | Modüller | M3, M5 | M2, M3, M5 | M2 eksik |
| **Pro** | Çalışma Alanı | Sınırsız | 1 | **TAM YALAN** |
| | YZ kredisi | 3.000/ay | 500/ay | 6x fazla |
| | Modüller | M1-M6, M8 | M1-M5, M8 | M6 yok |
| **Ultra** | YZ kredisi | Sınırsız | 2.000/ay | Sınırı var |
| | Koltuk/Alan | Sınırsız | 15/5 | Sınırları var |

### Why

PLAN_GRANTS (src/lib/billing/catalog.ts) sistem-çapı yetkilendirme kaynağı — `grantsFor()`, `Plan` tablo seed, modül manifestler buna göre çalışıyor. i18n metin pazarlama hatası (TASK-MTR6QIE05ZKNH'de EUR→USD geçişi sırasında metin senkronize edilmedi).

### How to Apply

Düzeltme tablosu (TASK-MTRD9EUQB33QV raporında):

- **Basic credits:** 500 → 100
- **Basic seats:** "1 user / 1 workspace" → "2 users / 1 workspace"
- **Basic modules:** "M3, M5" → "M2, M3, M5"
- **Pro seats:** "Unlimited workspaces" → "1 workspace"
- **Pro credits:** 3.000 → 500
- **Pro modules:** "M1-M6, M8" → "M1-M5, M8"
- **Ultra credits:** "Unlimited" → "2,000 AI credits / month (unlimited with BYO key)"
- **Ultra seats:** "Unlimited" → "15 seats, 5 workspaces"

Dosyalar: `messages/tr.json`, `messages/en.json` → `billingPanels.settings.plans`

Bağlı görev: [[fabrika-plan-ladder-retirement]] (TASK-MTR6QIE05ZKNH)
