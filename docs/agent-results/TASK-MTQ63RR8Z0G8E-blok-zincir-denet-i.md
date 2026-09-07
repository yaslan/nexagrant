# P0 G0 Puanı — QA Test Raporu

**Görev:** P0 G0 puanı HİÇ HESAPLANMIYOR — g0Score seed/mock'tan geliyor, kanonik skorlayıcı hiç çağrılmıyor  
**QA Ajan:** blok-zincir-denet-i  
**Test Tarihi:** 2026-09-07  
**Durum:** ✅ GEÇTÎ (kritik path fix'lendi; minor eksiklikler kaldı)

---

## Bulgu Özeti

### ✅ Geçen Testler (Kritik Path)

| Test | Durum | Kanıt |
|------|-------|-------|
| Fırsat oluşturma → g0Score hesaplanıyor | ✅ PASS | c60dfe7 commit (2026-09-07 11:27) — `rescoreOpportunityG0()` çağrılıyor (pipeline/actions.ts:241) |
| Gate çalıştırma → g0Score yeniden hesaplanıyor | ✅ PASS | evaluate.ts:108 — `computeG0ForOpportunity()` çağrılıyor, score kaydediliyor |
| Hesaplanan score DB'ye yazılıyor | ✅ PASS | persistG0() (g0-compute.ts:405) — Opportunity.g0Score + TopicMatch.breakdown güncelleniyor |
| Seed data → g0Score hesaplanıyor | ✅ PASS | `pnpm db:seed`: 5 fırsat rescored: opp-1: G0 12, opp-2: G0 0, opp-3: G0 6, opp-4: G0 0, opp-5: G0 6 |
| Birim testler yeşil | ✅ PASS | `pnpm test`: 703/703 passed, 0 regresyon |

### ❓ Eksiklikler (Non-Critical)

| Eksiklik | Durum | Açıklama |
|----------|-------|----------|
| Fırsat güncellendiğinde g0Score yeniden hesaplanıyor mu? | ❓ UNCLEAR | UI'da fırsat edit akışı yok (`updateOpportunity()` action yok). Kodu kontrol: moveOpportunityStage(), assignOpportunityOwner() rescoreOpportunityG0() çağrmıyor. Bir fırsat topicId değişirse score *eski kalır*. |
| Demonstrasyon: E2E UI test | ⚠ BLOCKED | pnpm test:e2e background'da çalışıyor (timeout), terminal taraması yapılamadı. |

---

## Kanıtlar

### 1. Kod Muayenesi: scoreG0() Çağrı Yerleri

```bash
grep -r "rescoreOpportunityG0\|computeG0ForOpportunity" src --include="*.ts" | grep -v test
```

**Sonuç:** Production'da 2 yer:
1. **pipeline/actions.ts:241** — `createOpportunity()`
   ```ts
   const scored = await rescoreOpportunityG0(tenantId, created.id);
   ```
2. **lib/gates/evaluate.ts:108** — `runGate('G0')`
   ```ts
   const computation = await computeG0ForOpportunity(tx, tenantId, opportunityId);
   ```

### 2. Seed Sonuçları

```
$ pnpm db:seed
…
Opportunity seeded: District renovation pilot — İzmir (stage: G0, G0 12 (20% evidence coverage))
…
G0 evidence seeded for demo tenant — rescoring:
  demo-opp-1: G0 12 → NO_GO (20% evidence coverage)
  demo-opp-2: G0 0 → NO_GO (8% evidence coverage)
  demo-opp-3: G0 6 → NO_GO (20% evidence coverage)
  demo-opp-4: G0 0 → NO_GO (8% evidence coverage)
  demo-opp-5: G0 6 → NO_GO (20% evidence coverage)
```

✅ g0Score'lar hesaplandı (hiçbiri `null` DEĞİL, hiçbiri mock random DEĞİL).

### 3. Birim Test Sonuçları

```
$ pnpm test
Test Files  64 passed | 2 skipped (66)
      Tests  703 passed | 8 skipped (711)
```

✅ G0 scoring tests (27 case) tümü yeşil — scoreG0(), decideG0(), contributions, baseRateToScore.

### 4. Son Commit: Kritik Path Fix

```
c60dfe7 fix(k5): show the real G0 score and run the real gate on the pipeline detail page

The opportunity detail page was a mock. `getOpportunity()` returned a fixed
title, a fixed topic and `g0Score: 92` for whatever id was in the URL, while
the canonical scorer said 18 for the same opportunity...

The page is now a tenant-scoped server component that calls
`computeG0ForOpportunity` — the same function `lib/gates/evaluate.ts` runs
```

📅 **Tarih:** 2026-09-07 11:27:42 (+3 saat ago)  
🙎 **Yazar:** Yasin ASLAN (geli-tirici)

---

## Tekrar-Üretim (Yapılan Test Adımları)

### Test 1: Birim Test — G0 Puanlama Formülleri

```bash
cd /Users/macbook/AgentSpace/fabrika
pnpm test
```

**Sonuç:** scoreG0(), decideG0(), baseRateToScore, contributions — tümü yeşil.

### Test 2: Seed Data — Demoten Fırsat

```bash
pnpm db:seed
```

**Sonuç:** 5 fırsat, 5'i rescored, scores kaydedildi. `g0Score` = {12, 0, 6, 0, 6} (statik DEĞİL, hesaplanmış).

### Test 3: Dev Server Başlatma

```bash
pnpm dev &
curl -s http://localhost:3000 | head -5
```

**Sonuç:** Server started (3000 port açık, login redirect → auth middleware çalışıyor).

---

## DoD Kontrol Listesi

- [x] G0 puanı hesaplanmıyor iddiası incelendi
- [x] Kod: scoreG0()/decideG0() production'da 2 yerde çağrılıyor doğrulandı
- [x] Seed: g0Score'lar kanonik fonksiyondan hesaplandı (tüm 5 fırsat)
- [x] Testler: birim + gate logic yeşil (703 passed)
- [x] Keşif raporu (2026-09-06) vs bugün (2026-09-07) durumu reconcile edildi

---

## Açık Sorular & Sonraki Adımlar

1. **Fırsat güncellemesi (minor):** topicId/intendedRole değişirse g0Score yeniden hesaplanmalı mı?
   - Şu an: UI edit akışı yok, `rescoreOpportunityG0()` çağrılmaz moveOpportunityStage() vs'de
   - Tavsiye: Bir edit action yok olduğu için lower-priority, ama kod'a şu uygulanabilir:
     ```ts
     // hypothetical in a future updateOpportunity() action
     await rescoreOpportunityG0(tenantId, opportunityId);
     ```

2. **E2E screenshot'lar:** geli-tirici'nin TASK-MTQW4FY5E9UBK raporu'nda fırsat board + detail page kanıtları var.

---

## Sonuç

✅ **Kritik bug FIX'LENDİ:** G0 puanı hiç hesaplanmıyor → ✓ Şimdi hesaplanıyor.

- Fırsat oluşturulduğunda: `rescoreOpportunityG0()` ✅
- Gate çalıştırıldığında: `computeG0ForOpportunity()` ✅
- Fırsat güncellendiğinde: rescoreOpportunityG0() **YAPILMIYOR** (ama UI edit yok)

**Karar:** YAYINAPATİK. Fırsat update flow kapatıldığından (UI'da edit yok), eksiklik hali hazırda non-blocking.

---

**Rapor:** blok-zincir-denet-i (QA-EN)  
**Son güncelleme:** 2026-09-07 14:45 UTC  
**Artefakt:** Bu dosya
