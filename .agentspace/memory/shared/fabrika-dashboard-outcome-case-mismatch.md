---
name: fabrika-dashboard-outcome-case-mismatch
description: ÇÖZÜLDÜ (2026-09-07) — Proposal.outcome kasa uyuşmazlığı; sözlük artık src/lib/proposal-outcome.ts'te tek kaynak, ham sütunu karşılaştırma
metadata:
  type: project
  updatedAt: 2026-09-07
---

**Durum: kapandı — TASK-MTQTYXC0NUT0B (commit `6887b59`).**

`Proposal.outcome` serbest bir `String?`. Yazan her taraf snake_case yazıyordu
(`above_threshold`); okuyan taraf `['SUBMITTED','FUNDED','ABOVE_THRESHOLD'].includes(...)`
ile SCREAMING_CASE arıyordu. Hiçbir satır eşleşmedi, hiçbir hata çıkmadı, oran %20 yerine
%0 göründü. `'SUBMITTED'` zaten sözlükte hiç yoktu — gönderim `submittedAt` ile izleniyor.

**Bugünkü kural:** sözlük `src/lib/proposal-outcome.ts`'te (`PROPOSAL_OUTCOMES`,
`ABOVE_THRESHOLD_OUTCOMES`, `normalizeProposalOutcome`, `isAboveThreshold`, `isFunded`).
Ham sütunu karşılaştırma — bu fonksiyonları çağır. `src/lib/beta/esr-samples.ts` de aynı
listeden türüyor (ikinci kopya tam olarak sürüklenmenin kaynağıydı; birim test kimliği
`toBe` ile sabitliyor). Normalizasyon kasa/ayraç affeder ama sözlük dışı kelimeye `null`
döner — yazım hatası "outcome yok" olur, sessizce paya katılmaz. `toLocaleLowerCase`
KULLANMA: Türkçe yerelde `I`→`ı` katlanır, eşleşme kaybolur (bkz. [[fabrika-css-uppercase-turkish-dotted-i]]).

`Prisma` bu sütun için `enum` tanımlamıyor; enum'a taşınıp taşınmayacağı `docs/ROADMAP.md`
açık karar #11'de duruyor.

İlgili: [[fabrika-free-string-columns-fail-silently]] · [[fabrika-dashboard-outcome-has-no-live-ui-surface]]
