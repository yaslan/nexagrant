# E10: KPI Panosu Veri Spec'i

**Görev:** Dashboard KPI kartlarını `Evidence` tablosuna bağlama (CLAUDE.md §7 "kanıt disiplini")  
**Tarih:** 2026-09-06  
**Tasarımcı:** DSE-EN (blok-zincir-dse)  
**Durum:** Spec yazıldı — mühendise handoff için hazır

---

## 1. Sorun ve Bağlam

ROADMAP E10: "KPI panosu hardcoded değerler problemi"
- Dosya: `src/modules/m5/server/queries.ts` (`getKpiMetrics`)
- İssue: Backend'te KPI metrikleri `Opportunity`, `Proposal`, `Effort` gibi raw tabloları **doğrudan** sorguluyor, `Evidence` tablosuyla **bağlı değil**
- CLAUDE.md §7 "Kanıt disiplini": "Kullanıcıya gösterilen her istatistik `Evidence` veya `TopicStat` kaydına bağlıdır; kod içine sabit rakam yazma"
- **Hedef:** Her KPI metriğini sistemsel olarak `Evidence` tablosundan türet

---

## 2. KPI Kartları ve Veri Kaynağı Haritası

### 2.1 Toplam Teklif (Total Proposals)

| Özellik | Değer |
|---------|-------|
| **Metrik Adı** | `totalOffers` |
| **UI Gösterimi** | Kartın baş satırı (örn. "12 Teklif") |
| **Mevcut Kod** | `tx.opportunity.count({ tenantId, createdAt: { gte: from, lte: to } })` |
| **Veri Kaynağı** | `Opportunity` tablosu — etkin (deleted_at IS NULL) kayıtlar |
| **Evidence Türü** | `kind='metric'`, `category='pipeline'`, `name='total_opportunities'` |
| **Evidence Kayıt Şeması** | `{ tenantId, kind: 'metric', category: 'pipeline', name: 'total_opportunities', value: <count>, unit: 'count', periodFrom, periodTo, sourceUrl: 'query:opportunity.count' }` |
| **Hesaplama** | `SELECT COUNT(*) FROM "Opportunity" WHERE "tenantId"=$1 AND "deletedAt" IS NULL AND "createdAt" BETWEEN $2 AND $3` |
| **Güncelleme Sıklığı** | Cron sonrası (K1/K2 günlük işler) + manuel tetikleme |

### 2.2 İsabet Oranı (Hit Rate / Başarı Oranı)

| Özellik | Değer |
|---------|-------|
| **Metrik Adı** | `successRate` (yüzde 0–100) |
| **UI Gösterimi** | "68.5%" (İsabet Oranı / Hit Rate kartında) |
| **Mevcut Kod** | `submittedProposals / g0ScoredOpportunities * 100` |
| **Veri Kaynağı** | <ul><li>Paylaç (numerator): `Proposal` sayısı WHERE `submittedAt IS NOT NULL`</li><li>Bölüm (denominator): `Opportunity` sayısı WHERE `g0Score IS NOT NULL`</li></ul> |
| **Evidence Türü** | `kind='metric'`, `category='gate'`, `name='g0_to_submission_rate'` |
| **Evidence Kayıt Şeması** | `{ tenantId, kind: 'metric', category: 'gate', name: 'g0_to_submission_rate', value: <percentage>, unit: '%', numerator: <submitted_count>, denominator: <g0_scored_count>, periodFrom, periodTo, sourceUrl: 'query:proposal.submitted|opportunity.g0scored' }` |
| **Hesaplama** | <pre>SELECT ROUND(100.0 * COUNT(DISTINCT p."id") / NULLIF(COUNT(DISTINCT o."id" FILTER (WHERE o."g0Score" IS NOT NULL)), 0), 2) FROM "Opportunity" o LEFT JOIN "Proposal" p ON o."id" = p."opportunityId" WHERE o."tenantId"=$1 AND o."deletedAt" IS NULL AND o."createdAt" BETWEEN $2 AND $3 AND p."submittedAt" IS NOT NULL</pre> |
| **Güncelleme Sıklığı** | Günlük (K5 pipeline tetiklemesi sonrası) |
| **Not** | G0 gate'ini geçen fırsatların kaçının submission'a dönüştüğü; kalite filtresi rolünü gösterir |

### 2.3 Kişi-Gün / Teklif (Person-Days Per Proposal)

| Özellik | Değer |
|---------|-------|
| **Metrik Adı** | `personDays` (ondalık sayı) |
| **UI Gösterimi** | "14.2 Gün" (Kişi-Gün/Teklif kartında) |
| **Mevcut Kod** | `(total_person_hours / 8) / total_proposals` |
| **Veri Kaynağı** | <ul><li>`Effort.hours` SUM — kişi-saat, proposal başına takvim zamanı</li><li>`Proposal` sayısı (etkin; deleted_at IS NULL)</li></ul> |
| **Evidence Türü** | `kind='metric'`, `category='effort'`, `name='person_days_per_proposal'` |
| **Evidence Kayıt Şeması** | `{ tenantId, kind: 'metric', category: 'effort', name: 'person_days_per_proposal', value: <decimal>, unit: 'days', totalPersonHours: <sum_hours>, totalProposals: <count>, periodFrom, periodTo, sourceUrl: 'query:effort.sum|proposal.count' }` |
| **Hesaplama** | <pre>SELECT ROUND(COALESCE(SUM(e."hours"), 0) / 8.0 / NULLIF(COUNT(DISTINCT p."id"), 0), 2) FROM "Effort" e RIGHT JOIN "Proposal" p ON e."opportunityId" = p."opportunityId" WHERE p."tenantId"=$1 AND p."deletedAt" IS NULL AND p."createdAt" BETWEEN $2 AND $3</pre> |
| **Güncelleme Sıklığı** | Haftalık (Çarşamba, 09:00 UTC) — çaba yönetimi kron'u |
| **Not** | AI hızlandırmasının işgücü verimliliğine etkisini ölçer; ayrı M2 Concept Note ve M6 Evaluator'dan ayrı tutulmalı |

### 2.4 G0→G2 Ortalama Süresi (Avg G0→G2 Days)

| Özellik | Değer |
|---------|-------|
| **Metrik Adı** | `g0ToG2Days` (tam sayı, gün) |
| **UI Gösterimi** | "12 Gün" (Ort. G2 Onay Süresi kartında) |
| **Mevcut Kod** | Moyenne zamanı G0→G2 geçişinde (her opp için) |
| **Veri Kaynağı** | `GateDecision` tablosu: gate IN ('G0', 'G2'), `decidedAt` zaman damgası |
| **Evidence Türü** | `kind='metric'`, `category='gate_timing'`, `name='g0_to_g2_days_avg'` |
| **Evidence Kayıt Şeması** | `{ tenantId, kind: 'metric', category: 'gate_timing', name: 'g0_to_g2_days_avg', value: <days_integer>, unit: 'days', sampleSize: <count_transitions>, minDays: <min>, maxDays: <max>, periodFrom, periodTo, sourceUrl: 'query:gatedecision.g0|gatedecision.g2' }` |
| **Hesaplama** | <pre>SELECT ROUND(AVG(EXTRACT(EPOCH FROM (g2_time - g0_time)) / 86400)) FROM ( SELECT o."id" opp_id, MIN(gd1."decidedAt" FILTER (WHERE gd1."gate"='G0')) g0_time, MIN(gd2."decidedAt" FILTER (WHERE gd2."gate"='G2')) g2_time FROM "Opportunity" o LEFT JOIN "GateDecision" gd1 ON o."id"=gd1."opportunityId" LEFT JOIN "GateDecision" gd2 ON o."id"=gd2."opportunityId" WHERE o."tenantId"=$1 AND o."deletedAt" IS NULL AND COALESCE(gd1."decidedAt", gd2."decidedAt") BETWEEN $2 AND $3 GROUP BY o."id" HAVING g0_time IS NOT NULL AND g2_time IS NOT NULL) t</pre> |
| **Güncelleme Sıklığı** | Aylık (ilk gün, 04:00 UTC) |
| **Not** | Pipeline momentum göstergesi; "hızlı track" eğitim kurumları için kritik |

### 2.5 Ortalama Değerlendirme Puanı (Average Evaluation Score)

| Özellik | Değer |
|---------|-------|
| **Metrik Adı** | `averageScore` (0–100 yüzde) |
| **UI Gösterimi** | "75.3" (Ortalama Puan kartında) — M6 Evaluator sütunlarının ortalaması |
| **Mevcut Kod** | `(excellence + impact + implementation) / 3` per Evaluation, sonra ortalama |
| **Veri Kaynağı** | `Evaluation` tablosu: `excellence`, `impact`, `implementation` alanları (1–5 ölçeği) |
| **Evidence Türü** | `kind='metric'`, `category='quality'`, `name='avg_evaluation_score'` |
| **Evidence Kayıt Şeması** | `{ tenantId, kind: 'metric', category: 'quality', name: 'avg_evaluation_score', value: <decimal>, unit: '%', sampleSize: <count_evaluations>, breakdown: { excellence_avg, impact_avg, implementation_avg }, periodFrom, periodTo, sourceUrl: 'query:evaluation.excellence|impact|implementation' }` |
| **Hesaplama** | <pre>SELECT ROUND(100.0 * AVG((e."excellence" + e."impact" + e."implementation") / 3.0) / 5.0, 1) FROM "Evaluation" e WHERE e."tenantId"=$1 AND e."deletedAt" IS NULL AND e."createdAt" BETWEEN $2 AND $3</pre> |
| **Güncelleme Sıklığı** | Haftalık (Pazartesi, 02:00 UTC) |
| **Not** | M6 Evaluator Lens (v1.1) ile ilgili; mevcut v1.0'da excellence/impact/implementation sütunları yok, prototype olabilir |

### 2.6 Aktif Modüller (Active Modules)

| Özellik | Değer |
|---------|-------|
| **Metrik Adı** | `activeModules` (tam sayı, 0–11) |
| **UI Gösterimi** | "11 / 11 Modül" (Aktif Sistem Modülleri kartında) |
| **Mevcut Kod** | `tx.moduleState.count({ status: 'ON' })` |
| **Veri Kaynağı** | `ModuleState` tablosu: `status = 'ON'` kayıtları |
| **Evidence Türü** | `kind='config'`, `category='modules'`, `name='active_modules_count'` |
| **Evidence Kayıt Şeması** | `{ tenantId, kind: 'config', category: 'modules', name: 'active_modules_count', value: <count>, unit: 'count', breakdown: { <module_id>: <status> }, recordedAt }` |
| **Hesaplama** | `SELECT COUNT(*) FROM "ModuleState" WHERE "tenantId"=$1 AND "status"='ON'` |
| **Güncelleme Sıklığı** | Gerçek-zaman (enable/disable işlemi sonrası) |
| **Not** | Konfigürasyon metriği, hesaplanan değer değil; yalnızca kiracının etkin kapsamını gösterir |

---

## 3. Evidence Tablosu Şeması

### Standart Alanlar

```typescript
interface Evidence {
  id: string;                    // UUID
  tenantId: string;              // Kiracı
  kind: 'metric' | 'config' | 'stat'; // Türü
  category: string;              // Kümesi: 'pipeline', 'gate', 'effort', 'gate_timing', 'quality', 'modules'
  name: string;                  // Anahtar: 'total_opportunities', 'g0_to_submission_rate', vb.
  value: number | string;        // Ana metrik
  unit: string;                  // Ölçü: 'count', '%', 'days', vb.
  sourceUrl: string;             // Sorgu kaynağı; "query:table.operation[|table2.operation]" formatı
  periodFrom: Date | null;       // Tarih aralığı başı (null = anlık)
  periodTo: Date | null;         // Tarih aralığı sonu
  validUntil: Date | null;       // Geçerlilik süresi (null = sürekli)
  metadata: JSONValue | null;    // Ek: { numerator, denominator, sampleSize, breakdown, ... }
  recordedAt: Date;              // İndeks zamanı
  deletedAt: Date | null;        // Soft delete
  
  // Tüm sahalar tenant_isolation RLS politikası ile korunur
  // @@index([tenantId, category, name, recordedAt])
  // @@index([tenantId, kind, validUntil])
}
```

### Prisma Schema Eklentisi

```prisma
model Evidence {
  id            String   @id @default(cuid())
  tenantId      String
  kind          String   // 'metric' | 'config' | 'stat'
  category      String   // 'pipeline', 'gate', 'effort', 'gate_timing', 'quality', 'modules'
  name          String   // 'total_opportunities', 'g0_to_submission_rate', ...
  value         Float
  unit          String   // 'count', '%', 'days', ...
  sourceUrl     String   // 'query:opportunity.count' or 'query:proposal.submitted|opportunity.g0scored'
  periodFrom    DateTime?
  periodTo      DateTime?
  validUntil    DateTime?
  metadata      Json?    // { numerator, denominator, sampleSize, breakdown }
  recordedAt    DateTime @default(now())
  deletedAt     DateTime?

  @@index([tenantId, category, name, recordedAt])
  @@index([tenantId, kind, validUntil])
  @@map("Evidence")
}
```

---

## 4. Backend Veri Aktarımı (Impl Spec)

### 4.1 `getKpiMetrics()` Refactor

**Mevcut:** `src/modules/m5/server/queries.ts`  
**Yeni Akış:**

```typescript
// Adım 1: Mevcut sorguları çalıştır (uyumluluk)
// Adım 2: Her metrik için Evidence kaydı oluştur (ya da güncelle)
// Adım 3: Metrik değerleri Evidence.value'dan oku (dönen KpiMetrics'te)

export async function getKpiMetrics(tenantId: string, from: Date, to: Date): Promise<KpiMetrics> {
  return withTenant(tenantId, async (tx) => {
    // Hesaplama yapıldı...
    const metrics = { totalOffers, successRate, /* ... */ };
    
    // Evidence kayıtlarını upsert et
    await upsertEvidenceMetrics(tx, tenantId, from, to, metrics);
    
    return metrics;
  });
}

async function upsertEvidenceMetrics(tx, tenantId, from, to, metrics) {
  const records = [
    {
      tenantId,
      kind: 'metric',
      category: 'pipeline',
      name: 'total_opportunities',
      value: metrics.totalOffers,
      unit: 'count',
      sourceUrl: 'query:opportunity.count',
      periodFrom: from,
      periodTo: to,
      validUntil: add(new Date(), { days: 30 }),
    },
    // ... her metrik için
  ];
  
  for (const r of records) {
    await tx.evidence.upsert({
      where: { tenantId_kind_name_periodFrom: { tenantId, kind: 'metric', name: r.name, periodFrom: from } },
      create: r,
      update: { value: r.value, validUntil: r.validUntil }
    });
  }
}
```

### 4.2 Cron İşleri (Inngest)

| İş | Sıklık | Trigger | Açıklama |
|-----|--------|---------|---------|
| `m5-kpi-metrics-daily` | 03:00 UTC | Günlük | Önceki günün KPI'larını hesapla, Evidence'a yazıyla |
| `m5-kpi-metrics-weekly` | Pazartesi 02:00 | Haftalık | Kalite/çaba metrikleri (ortalmaa puan, person-days) |
| `m5-kpi-metrics-monthly` | Ayın 1. günü, 04:00 | Aylık | G0→G2 timing, uzun-dönem trendler |

### 4.3 Frontend Okuma (`getKpiMetrics()` → `Dashboard.tsx`)

Mevcut mantık **değişmez** (uyumluluk):
- Backend `KpiMetrics` interface'ini döner
- `Dashboard.tsx` kart prop'larını besler
- KPI kartları Backend'teki metrikleri gösterir (Evidence'den hesaplanmış)

---

## 5. Kontrol Listesi (Kanıt Disiplini)

- [ ] Evidence tablosu Prisma schema'sına eklendi
- [ ] Migration yazıldı: `prisma/migrations/add-evidence-metric-tables.sql` (idempotent)
- [ ] RLS politikası: `tenant_isolation` Evidence tablosuna uygulandı
- [ ] Cron işleri: `src/lib/inngest/jobs/m5-kpi-metrics-*.ts` yazıldı
- [ ] `getKpiMetrics()` refactor: Evidence upsert mantığı eklendi
- [ ] Her metrik → Evidence.name eşlemesi doğrulandı
- [ ] Dashboard.tsx test: KPI kartları doğru değerleri gösteriyor
- [ ] Versiyon: `docs/DATA_MODEL.md` güncellendi (Evidence tanımı)

---

## 6. Ek Kaynaklar

- **ROADMAP:** `docs/ROADMAP.md` § E10 "KPI panosu"
- **Kanıt Disiplini Kuralı:** `CLAUDE.md` § 7
- **Mevcut Kod:** `src/modules/m5/server/queries.ts`
- **Frontend:** `src/modules/m5/ui/Dashboard.tsx`
- **Veri Modeli:** `docs/DATA_MODEL.md` § 4 "Kanıt (M3) ve YZ (K6)"

---

## 7. Sonuç

Spec hazırlandı: 6 KPI metriği, her biri:
- ✅ `Evidence` tablosunun türü ve şeması tanımlı
- ✅ Veri kaynağı (SQL sorgusu) netleşti
- ✅ Güncelleme sıklığı belirtildi (Inngest cron'u)
- ✅ Backend upsert mantığı draft

**Mühendise:** Bu spec uyarınca:
1. Evidence tablosu migrationini yaz
2. `getKpiMetrics()` refactor et (upsert mantığı)
3. Cron işlerini yaz
4. Test yaz (KPI metrikleri Evidence'a bağlı)

