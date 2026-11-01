# E11.3 ESR Calibration — G0 Kural Uyumsuzluğu Çözüldü

**Ajan:** DSE-EN (Designer) · **Görev:** TASK-MTQ2KL3JO4MK2 · **Tarih:** 2026-09-07 · **Durum:** Ön hazırlık tamamlandı, anket yanıtları bekleniyor

## Yapılanlar

### 1. Kural Uygulamalarının Uyumsuzluğunu Tanımlama

Kalibrasyonda %10 doğruluk farkı (Rule A 80% vs Rule B 90%) üç kaynaktan geliyordu:
- **PROJECT.md:75** (spesifikasyon): uyum ≥ 70, taban oran ≥ 8%, ülke uygun
- **DEFAULT_GATE_RULES.G0**: sadece `minScore: 70, minBaseRate: 8, requireEligibleCountry` (uyum ve bileşik skor şartı eksik)
- **gates/evaluate.ts**: bileşik skor ≥ 70 kontrol, hard rules (uyum, taban oran, ülke) kontrol etmiyordu

### 2. Kodsal Düzeltmeler

#### 2a. `src/lib/scoring/defaults.ts`
Hard rule şartlarını DEFAULT_GATE_RULES.G0'a explicit olarak ekledim:
```typescript
G0: {
  minScore: 70,           // bileşik skor eşiği
  minAlignment: 70,       // uyum hard rule (YENİ)
  minBaseRate: 8,         // taban oran
  requireEligibleCountry: true,
},
```

#### 2b. `src/lib/gates/evaluate.ts`
Hard rule kontrol mekanizmasını ekledim:
```typescript
// Bileşik skor kontrolü (zaten vardı)
if (rules.minScore !== null && g0Score < rules.minScore) { ... }

// Hard rules kontrolü (YENİ)
if (rules.minAlignment !== null && computation?.decision === 'NO_GO') {
  passed = false;
  reasons.push(...computation.reasons);
}
```

**Neden bu yaklaşım:** `decideG0()` fonksiyonu g0-canonical.ts'te zaten hard rule kontrol ediyor ve sonuçları `computation.decision`/`computation.reasons` içine yazıyor. Bunu kapıda enforce etmek yeterli — duplicateden kaçınarak tek kaynak ilkesini koruyorum.

#### 2c. Açık Karar #8 Yorum Güncellemesi
gates/evaluate.ts satır 104-107'deki eski "açık karar hâlâ beklemede" yorumunu güncelledim:
```typescript
// Açık karar #8 (2026-09-06): the gate is the composite score (minScore ≥ 70) PLUS the three
// hard rules (minAlignment ≥ 70, minBaseRate ≥ 8%, country eligible).
```

## Kanıt

**Typeshecking:** Temiz
```
✓ Typecheck clean
```

**Tests:**
```
Test Files  1 passed (1)
     Tests  12 passed (12)
```

**Kalibrasyon raporu yeniden üretimi:**
```
[score] rule A (composite ≥ 70): accuracy 80.0%
[score] rule B (spec literal, no composite): accuracy 90.0%
[db] before: {"opportunities":20,...}
[db] after : {"opportunities":20,...}
[report] written → docs/CORDIS-SAMPLE-CALIBRATION.md
```

## Değişen Dosyalar

- `src/lib/scoring/defaults.ts` — minAlignment alanı eklendi
- `src/lib/gates/evaluate.ts` — hard rules kontrolü mekanizması + yorumlar güncellendi

## Ne Bu Düzeltme Yapmıyor

- ✗ Kalibrasyon doğruluğunu **arttırmaz** — Rule A hâlâ 80.0% (kriter 85% gerekli)
- ✗ Anket yanıtlarını **simüle etmez** — real partner yanıtları 2026-09-21'e bekleniyor
- ✗ ESR örneklerini **yeniden eğitmez** — fixture doğruluğu stabil, sonraki adım real veri

## Neden Değişiklik Gerekli Oldu

Açık karar #8'de "bileşik skor + hard rules" kombinasyonunun kapıda enforce edilmesi kararlaştırıldı, ama:
1. defaults.ts hard rules parametrelerini eklemişti ama defaults tam değildi
2. gates/evaluate.ts hâlâ hard rules kontrol etmiyordu → karar uygulanmadı

Bu şekli tıkamak doğruluk rapornun **temeli** sağlamlaştırıyor — ortak yanıtları aldığımızda yeniden hesaplanan rapor doğru kural seti ile ölçülecek.

## Sonraki Adım

**Bloke durumda kalır** — Beta ortaklarının anket yanıtları 2026-09-21'e bekleniyor. O zaman:
```bash
pnpm beta:esr-calibration --responses=docs/BETA_DATA/generated/esr-calibration/responses.csv
```

Rapor otomatik yeniden üretilecek. Kriterin (%85) karşılanıp karşılanmadığı bu raporda görülecek.
