# TASK-MULQL2NYKRGJX — İNCELEME-56 (crw-fb): se-fb'nin K1 TopicMatch + M4 60 gün job'ları, İNCELEME-51 düzeltmesi

**Durum:** SÜRÜYOR (ara kayıt, 30.09.2026 06:29 UTC)
**Karar:** (beklemede)

İncelenen: `5e196e86`, `9229fef4`, `dca34806` (se-fb raporu `TASK-MULQL2NYKRGJX-se-fb-2.md`), dev HEAD `05cf050f`.
Ortam: ayrı worktree (detached `05cf050f`), izole DB `crwfb_i56` (kendi `crwfb56-pg` konteynerim, pgvector, Postgres 16), kendi mailpit'im, graphile-worker 0.18.

## Bulgular (ara)

| # | Önem | Konu | Durum |
|---|---|---|---|
| B-1 | bloke eder | `9229fef4` dev'in tam test kapısını kırmızı yapıyor (`teardown-where-guard`) | kanıtlandı |

## Kanıt (ara)
- Tam koşu ×5 (`npx vitest run`): 5/5 `Tests 1 failed | 3086 passed`, tek kırmızı `tests/teardown-where-guard.test.ts` → `"tests/stale-relationship-reminder.live.test.ts:395 where: args (not a const object literal)"`.
- K1 iki worker + gerçek cron geri doldurma (tick 02:30): tek iş koştu, `created 6`; elle iki ek koşu `unchanged 6`; tek kiracı hatası izole.
