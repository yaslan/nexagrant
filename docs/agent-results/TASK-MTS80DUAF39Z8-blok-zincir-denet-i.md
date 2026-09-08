# Bağımsız Doğrulama Raporu: TASK-MTS80DUAF39Z8

**Ajan:** blok-zincir-denet-i (Denetçi / QA Audit)  
**Tarih:** 2026-09-08  
**Sprint:** SPRINT-S12  
**Doğrulanacak Kart:** `TASK-MTS80DUAF39Z8` — SystemAlert'in tekrar koruması yoktu (P1)  
**İncelenen Rapor:** `docs/agent-results/TASK-MTS80DUAF39Z8-customer-support.md`  
**Hüküm:** **GEÇTİ**

---

## 1. Definition of Done (DoD) Maddelerinin Listesi ve Durumu

| DoD Maddesi | İddia Edilen Durum | Bağımsız Doğrulama Sonucu |
|---|---|---|
| **1. Çözülmemiş Uyarı Deduplikasyonu** | `recordAlert()` aynı kimliğe `(level, source, message, meta)` sahip çözülmemiş uyarıyı yeni satır açmak yerine sayaçla güncelliyor. | ✅ **DOĞRULANDI** — Arka arkaya 3 kez çağrılan özdeş uyarı tek satıra katlandı (`repeatCount: 3`). |
| **2. Farklı Uyarı İzolasyonu (Regresyon Yok)** | Farklı mesaj/seviyedeki uyarılar birleştirilmiyor, ayrı satır olarak kalıyor. | ✅ **DOĞRULANDI** — Farklı payload taşıyan 4. uyarı yeni bir satır olarak veritabanına yazıldı. |
| **3. UI Gösterimi (Sayaç Rozeti)** | `/admin/alerts` paneli tekrarlanan uyarıda `× N` rozetini basıyor. | ✅ **DOĞRULANDI** — Gerçek tarayıcıda kanıtlandı ve ekran görüntüsü alındı. |
| **4. Çözümleme Penceresi Kuralı** | Çözülmüş (`resolvedAt != null`) bir uyarı tekrar geldiğinde yeni satır açıyor. | ✅ **DOĞRULANDI** — `system-alert.ts` mantığı doğrulandı. |
| **5. Test Temizliği** | Üretilen test uyarıları doğrulama sonrasında temizlendi. | ✅ **DOĞRULANDI** — `audit_test_worker` kaynaklı test verileri silindi. |

---

## 2. Kendi Makinemizdeki Ölçüm ve Komut Çıktıları

### 2.1 Arka Arkaya 3 Tekrarlı Koşu + 1 Farklı Koşu Çıktısı

Yazılan bağımsız doğrulama betiği ile yapılan ölçüm:

```text
--- Calling recordAlert 3 times with identical payload ---
Run 1: { status: 'recorded', id: 'cmtsqgfvk0000foxkwqou1g00' }
Run 2: { status: 'recorded', id: 'cmtsqgfvk0000foxkwqou1g00', deduped: true, repeatCount: 2 }
Run 3: { status: 'recorded', id: 'cmtsqgfvk0000foxkwqou1g00', deduped: true, repeatCount: 3 }

--- Calling recordAlert 1 time with a DIFFERENT payload ---
Run 4 (distinct alert): { status: 'recorded', id: 'cmtsqgfvv0001foxk5044bsd2' }
```

Veritabanı Sonucu (4 çağrı sonucu yalnızca 2 satır oluştu):
```json
[
  {
    "id": "cmtsqgfvv0001foxk5044bsd2",
    "level": "error",
    "source": "audit_test_worker",
    "message": "Audit Distinct Test Alert: Database Error",
    "meta": { "job": "test-job", "attempt": 1 },
    "createdAt": "2026-09-08T13:56:27.883Z"
  },
  {
    "id": "cmtsqgfvk0000foxkwqou1g00",
    "level": "warn",
    "source": "audit_test_worker",
    "message": "Audit Recurrence Test Alert: Worker Timeout",
    "meta": {
      "job": "test-job",
      "attempt": 1,
      "alertLastSeenAt": "2026-09-08T13:56:27.881Z",
      "alertRepeatCount": 3
    },
    "createdAt": "2026-09-08T13:56:27.873Z"
  }
]
```

### 2.2 Gerçek Tarayıcı Kanıtı

* **[`docs/agent-results/TASK-MTS80DUAF39Z8-screenshots/01-alert-dedupe-and-distinct.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80DUAF39Z8-screenshots/01-alert-dedupe-and-distinct.png)** — `/tr/admin/alerts` ekranında 3 kez tekrarlanan uyarı ve bağımsız farklı uyarının gösterimi.

---

## 3. Tekrar Anahtarı ve Kiracı İzolasyon Analizi

**Tekrar Anahtarı Tanımı:**  
Tekrar anahtarı, `level`, `source`, `message` ve saklanan `meta` nesnesinin alfabetik sıralı JSON dizesinden (`alertIdentity`) oluşmaktadır.

**Kiracı İzolasyonu Değerlendirmesi:**  
`SystemAlert` veritabanı tablosu **kiracı bazlı değildir** (`tenantId` sütunu yoktur) ve RLS (Row Level Security) izolasyon politikalarına dahil edilmemiştir (global platform admin tablosudur).  
**Risk Bildirimi (Cross-Tenant Deduplication Risk):** Farklı kiracılardan tetiklenen tamamen aynı yapıdaki sistem uyarıları tek bir global satır altında birleşebilir. Ayrıca `meta` içerisine `tenantId` veya kiracıya özel veriler eklenirse global `/admin/alerts` ekranında görünürlük riski taşır (`sanitizeMeta` ile email/token gibi temel hassas terimler otomatik ayıklanmaktadır).

---

## 4. Sonuç ve Hüküm

**GEÇTİ**

**Gerekçe:** `SystemAlert` deduplikasyon koruması başarıyla çalışmakta, 3 tekrarlı koşu tek satırda sayaçla (`repeatCount: 3`) toplanmakta, farklı uyarılar ise ayrı satır olarak korunarak hiçbir regresyona yol açmamaktadır. Üretilen test verileri temizlenmiştir.
