---
name: fabrika-board-cards-go-stale
description: Fabrika görev panosundaki in_progress kartlar bitmiş işi gösteriyor olabilir — kartı koda karşı doğrulamadan iş dağıtma
metadata:
  type: feedback
  updatedAt: 2026-09-06
---

Fabrika panosundaki kart durumu **güvenilir değil**. 2026-09-06'da "IN PROGRESS" sütunundaki
5 kritik kartın **beşi de** aslında bitmiş işti; kimse kartı taşımamıştı:

| Kart | Bitmiş olduğunun kanıtı |
|---|---|
| RLS Validation & CI Check | `pnpm exec tsx scripts/check-rls.ts` → 37/37 model geçiyor |
| i18n Message Catalog | `scripts/i18n-check.ts` → "All translation keys present in both languages" |
| Stripe Webhooks | `src/app/api/webhooks/stripe/route.ts` + `credits-monthly-grant.ts` |
| Authorization (can/authz) | `src/lib/rbac.ts:72` `can()` |
| K1 Adapter & Daily Cron | adaptörler + `k1-daily-calls.ts` (yalnız bu kısmi: SEDIA testleri kırık) |

**Why:** bayat karta iş dağıtmak, bitmiş işi ikinci kez yaptırır ve gerçek kalan işi gizler —
devir sonrası en pahalı karışıklık türü bu.

**How to apply:** Bir kartı ekibe vermeden ÖNCE kapsamını koda karşı doğrula — ilgili script'i
KOŞ (`check-rls.ts`, `i18n-check.ts`), dosyanın/cron'un varlığına bak, `git log`'a bak.
Bitmişse iş dağıtma; kartı `review`'a al ve kanıtı yaz. `docs/ROADMAP.md` de aynı şekilde
uzun süre hiç işaretlenmemişti — bkz. [[fabrika-team-handover-cekirdek]].
