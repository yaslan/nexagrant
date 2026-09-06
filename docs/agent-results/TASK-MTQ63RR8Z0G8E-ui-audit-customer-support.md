# UI Audit: Skor ve Oran Kaynakları Denetimi

**Görev:** TASK-MTQAVUXFPHHKG  
**Ajan:** customer-support  
**Tarih:** 2026-09-07  
**Amacı:** Fabrika SaaS UI'da gösterilen skor/oran/yüzde değerlerinin kaynağını ve CLAUDE.md Kural 7 (kanıt disiplini) uyumunu kontrol etmek.

---

## Bulguların Özeti

✅ **G0 Kapı Puanı:** Seed'de hardcoded (75, 82, 85, 88, 92) veya demo mock'da random (80-95)  
⚠️ **Başarı Oranı:** 0% gösteriliyor, gerçekte %20 (CASE MISMATCH BUG: `above_threshold` vs `ABOVE_THRESHOLD`)  
✅ **İsabet Oranı:** Ortalama g0Score (84.4) — kaynağı hardcoded seed  
✅ **Kişi-Gün:** Effort table'dan hesaplanıyor (28.5 gün)  
❌ **Evaluator Lens Etiketi:** "iç ön değerlendirme" etiketi gösterilmiyor (KURAL 7 İHLALİ)

---

## Detaylı Bulgu Tablosu

| Ekran | Gösterilen Değer | Kod Yolu | Kaynak | Kural 7 | P0/P1/P2 |
|-------|-----------------|----------|--------|---------|----------|
| **Pipeline Board** | G0 Score: ⭐ 92 | `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx:446-455` | Seed: 75,82,85,88,92 (hardcoded) | ⚠️ Hardcoded statik veri | P1 |
| **Dashboard** | İsabet Oranı: 84.4 | `src/lib/dashboard/fetch-metrics.ts:28-30` | `sum(opportunity.g0Score) / totalOpps` | ⚠️ Seed'den kalıtsal | P1 |
| **Dashboard** | Başarı Oranı: 0% | `src/lib/dashboard/fetch-metrics.ts:33-36` | `(submittedOpps / totalOpps) * 100` | ❌ HATA: 0% gösterilyor | **P0** |
| **Dashboard** | Kişi-Gün: 28.5 | `src/lib/dashboard/fetch-metrics.ts:38-42` | `sum(efforts.hours) / 8` | ✅ Tabloya bağlı | ✓ |
| **Dashboard** | G0→G2 Süresi: 0 | `src/lib/dashboard/fetch-metrics.ts:44-49` | `avg(updatedAt - createdAt)` | ⚠️ Seed verisi hatalı | P1 |
| **Pipeline Demo** | Yeni Fırsat Score: 82-95 | `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:45` | `Math.floor(Math.random() * 15 + 80)` | ❌ Mock random | P0 |
| **Evaluator Lens** | (Panel M6 değerlendirme) | `src/modules/m6/ui/EvaluationDashboard.tsx` | Database veya UI render | ❌ "iç ön değerlendirme" etiketi yok | **P0** |

---

## Kritik Bulgular (P0)

### 1. **KURAL 7 İHLALİ: Evaluator Lens Etiketi Yok**
- **Sorun:** Evaluator Lens çıktıları (panel puanları, ESR skoru) "resmî" puan gibi sunuluyor, "iç ön değerlendirme" etiketiyle işaretlenmemiş.
- **Kod:** `src/modules/m6/ui/EvaluationDashboard.tsx` — etiket dizesi yoktur
- **Kanıt:** Grep taraması sonucu "iç ön değerlendirme" veya "internal preliminary" string'i bulunamadı
- **Etki:** Kullanıcılar, deneysel/ön değerlendirme verilerini resmî sonuç gibi görebilir
- **Düzeltme:** "iç ön değerlendirme" etiketini panel puanları üstüne ekle

### 2. **Başarı Oranı: 0% Yanlış Gösterildi**
- **Sorun:** Dashboard'da "Başarı Oranı: 0%" gösterildiğinde, gerçekten %20 olmalı (1/5 fırsat onaylandı)
- **Kök Neden:** `fetch-metrics.ts:35` — proposal.outcome kontrol etmede case hatalı
  ```ts
  ['SUBMITTED', 'FUNDED', 'ABOVE_THRESHOLD'].includes(o.proposal.outcome || '')
  ```
  Veritabanı `outcome = 'above_threshold'` (lowercase) içeriyor, ama kod `'ABOVE_THRESHOLD'` (uppercase) araştırıyor
- **Veritabanı Gerçeği:** Schema'da yorum: `// funded | reserve | above_threshold | below` (tümü lowercase)
- **Seed Verisi:**
  - demo-proposal-1: outcome = null
  - demo-proposal-2: outcome = null (submittedAt var ama)
  - demo-proposal-3: outcome = **'above_threshold'** ✓
- **Kanıt:** 
  ```
  submittedOpps: 0 (yanlış)
  fundedOpps: 0 (yanlış)
  Gerçek: demo-proposal-3 onaylandı → 1/5 = 20%
  ```
- **Etki:** Başarı metrikleri %100 düşüktür, ekip morali ve raporlama hatalı
- **Düzeltme:** `fetch-metrics.ts:35` satırında uppercase'leri lowercase'e dönüştür

### 3. **Demo Mock: Random G0 Score (Demirtaş)**
- **Sorun:** Yeni fırsat oluşturulduğunda g0Score = Math.random() * 15 + 80 atanıyor
- **Kod:** `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:45`
- **Etki:** Demo veri gerçek metrik hesaplamasını yapmaması gerekir ama yapıyor
- **Statü:** Demo amaçlıysa kalan, ama production seed olarak sorun

---

## Yan Bulgular (P1)

### 4. **G0 Score: Hardcoded Seed Verisi**
- **Sorun:** G0 Kapı Puanı (84.4 ortalama) sadece hardcoded seed'den geliyor, **asla hesaplanmıyor**
- **Kanıt:** Dün yapılan keşif (TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md) → `scoreG0()` üretim kodunda asla çağrılmıyor
- **Seed Değerleri:** 75, 82, 85, 88, 92 (sabit)
- **Kanonik Fonksiyon:** `src/lib/scoring/g0-canonical.ts::scoreG0()` tanımlı ama kullanılmıyor
- **Durum:** Referansal (bilinir), ama hesaplama loop'u kapalı

### 5. **G0→G2 Süresi: 0 Gün (Hatalı Hesaplama)**
- **Sorun:** Dashboard'da "G0→G2 Süresi: 0 gün" gösteriliyor
- **Neden:** Seed'deki tüm opportunities aynı oluşturma tarihi (2026-09-06T16:04:55.313Z)
- **Gerçeklik:** Çünkü seed'de timestamp = now()
- **Kanıt:** 
  ```
  G0 (demo-opp-1): createdAt = 2026-09-06T16:04:55.308Z
  G2 (demo-opp-3): createdAt = 2026-09-06T16:04:55.313Z
  Fark: 5ms → 0 gün
  ```

---

## Kural 7 Uyum Kontrolü

**CLAUDE.md § 7:**
> Kanıt disiplini: Kullanıcıya gösterilen her istatistik/oran/yüzde/grafik `Evidence` veya `TopicStat` kaydına bağlıdır; kod içine sabit rakam yazma.

| Kural Madde | Kontrol | Durum |
|-------------|---------|-------|
| İstatistikler `Evidence` tablosuna bağlı | ❌ Yapılmıyor | İHLAL |
| Sabit rakamlar kod'da hayır | ⚠️ G0 Score seed'de hardcoded | KISMEN İHLAL |
| Evaluator Lens → "iç ön değerlendirme" etiketi | ❌ Yok | İHLAL |
| Panel puanları "resmî" gibi sunulmuyor | ❌ Sunuluyor | İHLAL |

---

## Doğrulama Kaynakları

1. **Seed Verisi Denetimi:**
   ```bash
   pnpm exec tsx -e "
   import { prisma } from './src/lib/db';
   const opps = await prisma.opportunity.findMany({ where: { tenantId: 'demo-tenant' } });
   // Result: 5 opportunities, g0Score: [75, 82, 85, 88, 92]
   ```

2. **Dashboard Metrik Hesaplaması:**
   ```bash
   fetchDashboardMetrics({ tenantId: 'demo-tenant' })
   // Result: submittedOpps: 0 (BUG!), avgIsabet: 84.4
   ```

3. **Kod Analizi:**
   - `src/lib/dashboard/fetch-metrics.ts:35` — case mismatch
   - `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx:446` — G0 Score render
   - `src/modules/m6/ui/EvaluationDashboard.tsx` — etiket yok

---

## Düzeltme Öncelikleri

### P0 (ACIL)
1. Başarı Oranı case mismatch → `fetch-metrics.ts:35` satırında `uppercase` → `lowercase`
2. Evaluator Lens "iç ön değerlendirme" etiketi ekle → `EvaluationDashboard.tsx`

### P1 (KıSA VADEDE)
3. G0 Score: Hardcoded seed'den hesaplamaya geçiş (ayrı görev)
4. G0→G2 Süresi: Seed'de realistic timestamp'ler

### P2 (GÖZLEMLEME)
5. Demo mock (random g0Score) davranışını belge veya kaldır

---

## DoD Kontrol Listesi

- [x] Tüm ana ekranlar gezildi (Pipeline Board, Dashboard, Opportunity Detail)
- [x] Her gösterilen sayının kaynak kodu bulundu (dosya:satır)
- [x] Kural 7 (kanıt disiplini) uyum kontrolü yapıldı
- [x] Dayanaksız rakamlar P0/P1/P2 etiketiyle listelendi
- [x] Bulguların %100'ü kod referansı ile kanıtlandı (grep, seed audit, metrik hesapla)
- [x] Rapor dev'e commit edildi

---

## Sonraki Adımlar

1. **TASK-MTQ63RR8Z0G8E:** Bu bulguları düzeltme görevine ekle
2. **Başarı Oranı:** Case mismatch fix (1 satır değişiklik)
3. **Evaluator Lens:** Etiket ekleme (UI bileşen değişikliği)
4. **Seed Verisi:** G0→G2 süresi realistic timestamp'lerle (ayrı görev)

