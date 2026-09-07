# TASK-MTR68G2W1IQPI — "Eşik Üstü Oranı" KPI Kartı Panoya Eklendi

## Ne Yapıldı

**Eşik Üstü Oranı** (Above Threshold Rate) KPI kartı panoya (`src/modules/m5/ui/Dashboard.tsx`) render edilmek üzere uygulandı. Kart, gönderilen teklifler içinde `outcome = 'above_threshold'` olan oranını gösterir.

## Tanım

- **Metrik:** Eşik Üstü Oranı (Threshold Rate)  
- **Formül:** (Teklifler sayısı: `Proposal.outcome === 'above_threshold'`) / (Toplam gönderilen teklifler)  
- **Birim:** %  
- **Ölçüm koşulu:** En az bir teklif gönderilmiş olmalı; aksi takdirde "Henüz veri yok"  
- **Veri kaynağı:** `Proposal` tablosu, `outcome` alanı (`above_threshold`, `funded`, `reserve`, `below`)  

## Kanıt

### 1. Birim Testler (6/6 geçti)

```bash
pnpm test tests/kpi-metrics.test.ts
# RUN  v4.1.11
#  Test Files  1 passed (1)
#       Tests  6 passed (6)
#    Duration  103ms
```

Test senaryoları:
- ✅ `thresholdRate(10, 20)` → 50.0 (10/20*100)
- ✅ `thresholdRate(0, 10)` → 0.0 (sıfır yüzde gerçek ölçüm)
- ✅ `thresholdRate(5, 0)` → NOT_MEASURED (denominator sıfır)
- ✅ `thresholdRate(1, 3)` → 33.33 (yuvarlama: iki ondalık)
- ✅ Negatif denominator → NOT_MEASURED
- ✅ Absence vs. zero (CLAUDE.md Kural 7: "ölçülmedi" vs. "ölçülüp sıfır" ayrımı)

### 2. Kod İncelemesi

#### a) Saf Hesaplama Fonksiyonu (`metrics.ts`)
```typescript
export function thresholdRate(aboveThreshold: number, totalSubmitted: number): MetricValue {
  if (totalSubmitted <= 0) return NOT_MEASURED;
  return measured(round((aboveThreshold / totalSubmitted) * 100));
}
```
- ✅ Veritabanından bağımsız, saf fonksiyon
- ✅ `measured | NOT_MEASURED` ayrımı doğru yapılıyor
- ✅ Yuvarlama tutarlı (2 ondalık basamak)
- ✅ Sıfır/negatif denominator kontrolü

#### b) Veri Sorgusu (`queries.ts`)
```typescript
// 9a. Proposals with outcome 'above_threshold' in range
tx.proposal.count({
  where: {
    tenantId,
    outcome: 'above_threshold',
    opportunity: { deletedAt: null, createdAt: { gte: from, lte: to } },
  },
}),

// 9b. All submitted proposals in range (denominator)
tx.proposal.count({
  where: {
    tenantId,
    submittedAt: { not: null },
    opportunity: { deletedAt: null, createdAt: { gte: from, lte: to } },
  },
}),
```
- ✅ Kiracı izolasyonu (`tenantId`)
- ✅ Tarih aralığı filtrelemesi (diğer metriklerle tutarlı)
- ✅ Soft-delete görmezden gelme (`deletedAt: null`)
- ✅ Yalnızca gönderilen teklifler sayılıyor (`submittedAt: { not: null }`)

#### c) Pano Kartı Renderlemesi (`Dashboard.tsx`)
```typescript
{metricCard({
  title: t('thresholdRate'),
  metric: metrics.thresholdRate,
  unit: '%',
  description: t('descThresholdRate'),
  emptyDescription: t('emptyThresholdRate'),
})}
```
- ✅ `metricCard` helper ile boş durumda "Henüz veri yok" gösteriliyor
- ✅ Mock/sabit rakam yok — `metrics.thresholdRate` gerçek değer
- ✅ i18n integre (iki dil)

#### d) İ18n Mesajları
**Türkçe:**
```json
"thresholdRate": "Eşik Üstü Oranı",
"descThresholdRate": "Gönderilen teklifler içinde eşik üstü puanlandırılanların oranı",
"emptyThresholdRate": "Henüz hiç teklif gönderilmemiş; oran hesaplanamıyor."
```

**İngilizce:**
```json
"thresholdRate": "Above Threshold Rate",
"descThresholdRate": "Submitted proposals with above-threshold evaluation outcomes",
"emptyThresholdRate": "No proposals have been submitted yet, so there is no ratio to report."
```
- ✅ Her metinde de mevcut (`messages/tr.json`, `messages/en.json`)

## Değişen Dosyalar

| Dosya | Satırlar | Değişiklik |
|-------|----------|-----------|
| `src/modules/m5/server/metrics.ts` | 110–122 | `thresholdRate()` fonksiyonu eklendi |
| `src/modules/m5/server/queries.ts` | 9, 38–39, 75–97, 165 | İ18n anahtarları ve sorgu eklendi |
| `src/modules/m5/ui/Dashboard.tsx` | 208–213 | `thresholdRate` kartı eklendi |
| `messages/tr.json` | 63–64, 97 | Açıklama + boş durum metinleri |
| `messages/en.json` | 63–64, 97 | Açıklama + boş durum metinleri |
| `tests/kpi-metrics.test.ts` | — | Yeni dosya (birim testleri) |

## Riskler

1. **Veritabanı testi yapılamadı:** Geliştirme ortamında PostgreSQL bağlantısı olmadığı için gerçek veritabanı ile entegrasyon testi yapılamadı. **Çözüm:** `pnpm test:e2e` ve `pnpm gate` çalıştırılabilir, veya gerçek ortamda (`dev` branch'ine merge sonra) doğrulanabilir.

2. **Mevcut lint uyarısı (`src/modules/m5/server/queries.ts:1-2`):** Unused imports (`prisma`, `PrismaClient`). Bu, orijinal kodda da vardı — görev kapsamı dışında.

3. **Typecheck hataları (`src/lib/scoring/g0-scoring.test.ts`):** Eski, görev kapsamı dışında.

## Açık Sorular

1. **Proposal.outcome değerleri:** Kod `'above_threshold'` kullanıyor; veritabanında gerçekten bu değer mi kullanılıyor, yoksa başka bir enum/literal mi? → `prisma/schema.prisma:385` kontrol edildi: `outcome String?  // funded | reserve | above_threshold | below` ✅ Doğru.

2. **Oranın G2/G4 çıktıları ile ilişkisi:** `outcome` alanı ne zaman doldurulur? → ROADMAP.md E10'a göre ESR file upload sonrası (`Proposal.esrScores` ve `esrFileUrl` ile). Ama tüm proposals outcome'a sahip mi? → Şu an optional (`String?`). **Gelecek:** NULL değerleri (henüz ESR yüklenmemiş teklifler) sayılmıyor; bu doğru (denominator yalnız gönderilen, numerator yalnız eşik üstü çıkışlı).

## Sonraki Adım

- `pnpm gate` çalıştırarak tam kapı denetimi
- Dev branch'ine merge + gerçek ortamda manual test (gerçek kiracı verisi ile)
- Panoya yeni kart görnekleme (boş durumda "Henüz veri yok", veri varsa %X göstermesi)

---

## Doğrulama (ZORUNLU)

Karar: Tam birim test + kod incelemesi + i18n doğrulaması tamamlandı. Veritabanı testi geliştirme ortamında yapılamadığı için, **merge sonrası gerçek ortamda test önerilir.**

**DoD Kontrol Listesi:**
- [x] Hesaplama saf fonksiyon, `MetricValue` türünü döndürüyor
- [x] Birim testleri yazıldı ve 6/6 geçti
- [x] Pano kartı render ediliyor, i18n mesajları var
- [x] Boş durum ("Henüz veri yok") kurgusu doğru (`measured: false` → `t('noData')`)
- [x] Mock/sabit rakam yok — gerçek `Proposal` kaydından hesaplanıyor
- [x] Kiracı izolasyonu sağlam (`tenantId` filtresi)
- [x] Tarih aralığı filtrelemesi doğru
- [ ] Gerçek veritabanıda end-to-end test (dev ortamında yapılamadı)

---

**Hazırlayanı:** EX-EN (Araştırmacı/Explorer)  
**Tarih:** 2026-09-07  
**Görev ID:** TASK-MTR68G2W1IQPI  
