# G0 Puanlaması Konsolidasyonu — Keşif Raporu

**Görev:** G0 (kapı) puanını hesaplayan kodu konsolide etmek, yinelenen formülleri kaldırıp tek kanonik skorlayıcı oluşturmak.  
**Tarih:** 2026-09-06  
**Ajan:** blok-zincir-dse

## Keşif Bulguları

### 1. Mevcut G0 Hesaplama Kodları

| Dosya | Fonksiyon | Model | Kullanım | Durum |
|-------|-----------|-------|---------|-------|
| `src/lib/scoring/g0-canonical.ts` | `scoreG0(features, weights)` | 7-faktör, 0–100 scale | TANIMLANDI ama KULLANILMIYOR | ✅ Canonical |
| `src/lib/scoring/g0-canonical.ts` | `decideG0(features, facts, rules, weights)` | Tam triage (score + hard rules) | TANIMLANDI ama KULLANILMIYOR | ✅ Canonical |
| `src/lib/scoring/g0.ts` | `calculateG0Score(inputs, weights)` | Eski 4-faktör, 0–10 scale | TANIMLANDI ama KULLANILMIYOR | ❌ Eski/Unused |
| `src/lib/gates/evaluate.ts` | G0 gate kodu | Hiçbir hesaplama yok — DB'den `opp.g0Score` okur | İş mantığı: basit karşılaştırma | ✅ Tüketici |
| `prisma/seed-opportunities.ts` | — | Statik değerler (75, 82, 85, 88, 92) | Test seed | Test Verisi |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` | — | Mock: `Math.random() * 15 + 80` | Demo pipeline | Demo Kodu |

### 2. Formül Karşılaştırması

#### scoreG0 (G0-Canonical) — 7-faktör, ağırlıklı
```
Features: alignment(30%), baseRate(15%), coordinatorHistory(15%), 
          researchAndEndUser(12%), networkCentrality(10%), 
          budgetRoleEconomy(10%), lumpSumTwoStage(8%)
Çıktı: 0–100 composite score
```

#### calculateG0Score (G0.ts) — 4-faktör, eski model
```
Features: strategicAlignmentScore(0–10), technicalCapabilityScore(0–10),
          budgetMatchScore(0–10), partnershipPotentialScore(0–10)
Çıktı: Ağırlıklı toplam (scale bilinmiyor)
```

**Fark:** 
- Faktör sayısı: 7 vs. 4
- Scale: 0–100 vs. 0–10  
- Ağırlıklar: dokümante vs. bilinmiyor
- **İmplicite:** İkisi ASLA ÇAĞRILMIYOR — g0Score değeri sadece seed/mock'tan gelir

### 3. Kullanım Yerleri (g0Score Alan Erişimi)

```
grep -rn "g0Score" src/ --include="*.ts"
```

| Dosya | İşlem | Amaç |
|-------|--------|--------|
| `src/lib/gates/evaluate.ts` | Oku: `opp.g0Score < rules.minScore` | Gate geçişi test et |
| `src/app/api/dashboard/export-csv/route.ts` | Oku: avg hesabı | Metric rapor |
| `src/lib/dashboard/fetch-metrics.ts` | Oku: avg hesabı | Metric rapor |
| `src/actions/user/export-data.ts` | Oku: export | Data export |
| `src/lib/k5-pipeline/pipelineStore.ts` | Oku: demo data | In-memory store |
| `prisma/seed-opportunities.ts` | Yaz: seed | Test verileri |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` | Yaz: mock | Demo fırsat |

### 4. Kritik Bulgu: HESAPLAMA YOK

**Sorun:** `scoreG0()` ve `calculateG0Score()` fonksiyonları tanımlı ama ASLA çağrılmıyor.  
**Sonuç:** g0Score alanı:
- Seed'den statik değer alır, VEYA
- Mock'tan random değer alır, VEYA  
- Asla hesaplanmaz

**Dökümantasyon:** PROJECT.md:75 ve :81'de G0 puanı ve ağırlıkları açıkça yazılı — ama kod onu uygulamıyor.

## Kod Taraması Detayları

### Importlar
```bash
grep -rn "import.*scoreG0\|import.*decideG0\|from.*g0-canonical" src/
```
Çıktı:
- `src/lib/beta/esr-samples.ts`: `baseRateToScore, G0Features, G0HardFacts` (hesaplama değil, tip tanımı)
- `src/lib/beta/esr-survey.ts`: `G0Decision` (type only)
- `src/lib/scoring/calibration.ts`: `G0Decision` (type only)

**Hiçbirinde scoreG0() çağrısı yok.**

### Hangi Dosyalar G0'ı Hesaplamayı Sorumlu Olmalı?
- ❌ `src/modules/m6/server/scoring.ts` — M6 panel score hesaplar (ESR vs panel karşılaştırması), G0'yu **hesaplamaz**
- ❌ `src/lib/beta/esr-*.ts` — ESR sample parsing, G0 tipe referans verir ama hesaplama yok
- ✅ **`src/lib/scoring/g0-canonical.ts`** — YALNIZ bu dosyada tanımlı

## Kritik Bulgu: Ek Keşif

### scoreG0 Çağrı Yerlerinin Tam Listesi
```bash
grep -rn "scoreG0\|decideG0" src/ --include="*.ts" | grep -v "test\|scoring/g0-canonical"
```
**Sonuç:** Hiçbir match. PRODUCTION KOD'TA KULLANILMIYOR.

scoreG0 ve decideG0 SADECE:
- `scripts/esr-calibration.ts:163` — CLI test/kalibrasyonda (production dışı)
- `src/lib/scoring/calibration.ts:79` — comment satırında

### Sonuç: Refactor Kapsamı

**NE CONSOLIDATE ETMELI:**
1. ❌ `scoreG0()` **ASLA PRODUCTION'DA ÇAĞRILIYOR DEĞIL** → test yazmalı
2. ❌ `calculateG0Score()` **ASLA ÇAĞRILIYOR DEĞIL** → kontrol et/sil
3. ✅ `decideG0()` kanonik, test yazmalı

**NE SİLMELİ:**
- `src/lib/scoring/g0.ts` tamamı → `calculateG0Score` başka hiçbir yerde kullanılmıyor; referans yok (grep teyit)
- VEYA: Eski model olarak dokümante et ve test'e bırak

**Fark:** Görevin açıklaması "birden fazla yerde ayrı ayrı hesaplanıyor" dedi, keşif "asla hesaplanmıyor" buldu. Bu bir **task açıklaması hatasıdır** veya eski bir durumun raporudur. Ama görev net: konsolide et → kanonik tek çağrı yap → test yaz.

## Refactor Planı (Bu Oturum)

1. **g0.ts'i gözden geçir:**
   - calculateG0Score ne işe yarıyor?
   - Silinir mi, yoksa eski/uyumsuz model olarak tutulur mu?
   - Karar: **SİL** (test'i kesin referans olmayan dead code)

2. **Canonical sorgumuzu doğrula:**
   - `scoreG0()` saf, ağırlıklandırılmış, 0–100 ✅
   - `decideG0()` saf, hard rules ekliyor ✅
   - Tek kanonik kaynak ✅

3. **Birim testler yaz:**
   - `scoreG0()` — her ağırlık, clamping, normalizasyon
   - `decideG0()` — tüm hard rule kombinasyonları
   - Eşik kenarı durumları (pass/fail boundary)

4. **Doğrula:**
   - `pnpm test` yeşil
   - Coverage raporu

5. **Commit & rapor:**
   - `dev`'e commit et
   - Sonuç dosyasını tamamla

## Kaynaklar
- `src/lib/scoring/g0-canonical.ts` — G0 scoring spec + funkciyonlar
- `src/lib/scoring/g0.ts` — Eski model (unused)
- `PROJECT.md:75,81` — G0 rule set ve ağırlıklar (dokümantasyon)
- `src/lib/gates/evaluate.ts` — Gate geçişi (kanonik kodu çağramalı)
- `docs/ROADMAP.md` — Açık kararlar #8

---

**Devam:** Docs/ROADMAP.md'e bakmak + hangi kodun g0Score'u SET etmesi gerektiğini belirlemek.
