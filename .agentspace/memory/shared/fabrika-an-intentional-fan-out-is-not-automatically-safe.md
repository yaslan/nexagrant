---
name: fabrika-an-intentional-fan-out-is-not-automatically-safe
description: Tenant-bypass envanterinde "kasıtlı fan-out" işaretlemeden ÖNCE tablonun RLS'i açık mı diye bak — RLS'li tabloda tenant'sız fan-out fabrika_app altında 0 satır döner ve iş sessizce başarılı raporlar
metadata:
  type: project
updatedAt: 2026-09-10
---

Tenant-bypass dilimlerinde cron işleri şu deseni taşıyor: önce tüm kiracılar üstünde
tenant'sız bir fan-out, sonra kiracı başına alt sorgu. Alt sorgular sarmalanır; fan-out
"kasıtlı istisna" diye allowlist'e yazılır. **Bu sınıflandırma tek başına yanlış olabilir.**

Belirleyici soru fan-out'un niyeti değil, **tablonun RLS'i açık mı** olduğudur. Ölçtüm
(TASK-MTVR8KK92G0GA, canlı şema 2026-09-10):

| Konum | Tablo | RLS | `fabrika_app` altında |
|---|---|---|---|
| `credits-monthly-grant.ts` fan-out | Tenant | kapalı | güvenli — 21 satır |
| `alerts-daily.ts` match count | Topic | kapalı | güvenli — 1298 satır |
| `alerts-daily.ts` `fetch-saved-searches` | **SavedSearch** | **AÇIK** | **0 satır** |

Son satır: DB'de gerçek bir `notify:true` kaydı varken superuser 1 satır görüyor,
`fabrika_app` (app.tenant_id set edilmemiş) **0** görüyor. Uygulama o role geçtiği gün
`alerts-daily` her sabah `success: true, totalSearches: 0` raporlayıp kimseye posta
göndermez — hata da vermez. Sarmalayarak DÜZELMEZ (o noktada tenant henüz bilinmiyor);
ayrı bir karar gerekiyor.

**Kural:** bir çağrıyı "kasıtlı istisna" diye kapatmadan önce
`select relrowsecurity from pg_class where relname = '<Tablo>'` sor. RLS kapalıysa
istisna gerçekten güvenlidir; AÇIKSA istisna değil, **gecikmeli sessiz arıza**dır.

İlgili: [[fabrika-app-role-is-necessary-but-not-sufficient-for-an-rls-test]] ·
[[fabrika-local-green-is-worthless-under-a-bypassrls-role]]

Ayrıca eskimiş bir kayıt: `agents/cora/inngest-task-complete.md` "Jobs do NOT use
withTenant wrapper" diyor — TASK-MTVR8KK92G0GA bunu geçersiz kıldı, cron işlerinin
kiracı-kapsamlı alt sorguları artık `withTenant`'tan geçiyor.
