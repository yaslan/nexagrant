---
name: g0-scoring-fixed
description: G0 puanı hesaplanma sorunu fix'lendi — scoreG0() production'da çağrılıyor (2026-09-07)
metadata:
  type: project
  updatedAt: 2026-09-07
---

## Bulgu

P0 bug "G0 puanı hiç hesalanmıyor" → **FIX'LENDİ** (commit c60dfe7, 2026-09-07 11:27).

## Mevcut Durum (2026-09-07)

✅ **Geçen:**
- Fırsat oluşturulduğunda: `rescoreOpportunityG0()` çağrılıyor (pipeline/actions.ts:241)
- Gate çalıştırıldığında: `computeG0ForOpportunity()` çağrılıyor (gates/evaluate.ts:108)
- Seed'de 5 fırsat rescored, scores DB'de (opp-1: G0 12, opp-2: G0 0, vb)
- Biunit testler: 703/703 passed

❓ **Kalan Eksiklik:**
- Fırsat güncellendiğinde (topic/role değişirse) g0Score yeniden hesalanmıyor
- Fakat UI'da fırsat edit akışı yok (updateOpportunity action yok)
- Lower-priority: rescoreOpportunityG0() moveOpportunityStage()/assignOpportunityOwner()'a eklenebilir

## Commit Referans
- **c60dfe7** (2026-09-07): "fix(k5): show the real G0 score and run the real gate"
- **46ab773** (2026-09-06): "refactor(gates): consolidate G0 scoring, remove dead code"

## Test Sonuç
TASK-MTQ63RR8Z0G8E raporu: ✅ YAYINAPATİK

## Why
Keşif raporu "G0 hiç hesalanmıyor" bulmuştu, ama kodu optimize ederken çağrılar eklenmişti.

## How to Apply
Fırsat düzenleme akışı eklenirse, rescoreOpportunityG0() çağrısı ekle. Şu an akış kapalı olduğundan no-op.
