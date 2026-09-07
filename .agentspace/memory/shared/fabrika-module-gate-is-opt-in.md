---
name: fabrika-module-gate-is-opt-in
description: Fabrika'da modül kapısı sayfa başına opt-in — moduleGate() çağırmayan yeni bir sayfa kapalı modülü herkese açar; server action'da assertModuleAccess ilk satır olmalı
metadata:
  type: project
updatedAt: 2026-09-07
---

`ModuleState` kapısı 2026-09-07'de (TASK-MTQW8188AWOAT) bağlandı, ama **opt-in**:

- **Sayfa:** `moduleGate(moduleId, locale)` — `src/lib/modules/guard.tsx`. Sayfanın başında iki
  satır. Çağırmayı unutan yeni bir modül sayfası, modül `OFF`/`DEV` olsa bile herkese açık kalır.
  Bugün yalnız 3 yerde: `opportunities/[id]/briefs`, `.../evaluations`, `.../evaluations/panel`.
- **Server action:** `assertModuleAccess(moduleId)` **ilk satır** olmalı. Sıra pazarlık konusu
  değil — `generateText()` (`src/lib/ai/llm.ts`) ulaşıldığı anda `AiUsageLog` yazıp
  `CreditLedger`'dan düşer. M9'un `generateMeetingBrief`'i LLM hatasını yutup krediyi YİNE DE
  düşüyor, yani geç kontrol gerçekten para kaybettirir.
- Rota kapısı server action'ı korumaz ve tersi de doğru: **ikisi de gerekir.** Bir server action
  herkese açık bir POST uç noktasıdır; UI'da düğmeyi gizlemek kapı değildir.

Durum anlamı tek pure fonksiyonda: `canAccessStatus()` — `src/lib/modules/state-machine.ts`.
`OFF` = hiç kimse (platform admin dahil) · `DEV` = yalnız `isPlatformAdmin` · `PILOT` = kiracı
yöneticileri + ekip · `ON` = tüm üyeler. Gerekçe: `docs/adr/ADR-0001-module-state-access-gate.md`.

**Tuzak:** `DEV` eskiden `role === 'TENANT_OWNER'` bakıyordu. Her kiracının bir sahibi vardır —
beta ortağının sahibi de `TENANT_OWNER`. Yani "iç ekip" demek için rol YETMEZ, `isPlatformAdmin`
gerekir. Aynı hata başka bir kapıda tekrarlanabilir.

Yeni bir modül sayfası yazan herkes kapıyı elle eklemeli. Yapısal çözüm kartı: `TASK-MTQZ85NESC17T`.
**Plan kapısı 2026-09-07'de (TASK-MTQZ8MVAU3J7I) `checkModuleAccess`'in İÇİNE bağlandı** —
artık ayrı bir kapı değil: aynı çağrı önce hak edişe (`getEntitlements`), sonra
`canAccessStatus`'a bakıyor. Kapsamayan plan → `PLAN_UPGRADE_REQUIRED`. Yani `moduleGate()` /
`assertModuleAccess()` çağıran bir sayfa ya da action **ikisini birden** almış olur; ayrıca
plan kontrolü yazma (kopya kapı yasak). CLAUDE.md'nin andığı `PlanEntitlement` tablosu ve
`src/lib/authz` depoda YOKTUR: [[fabrika-entitlement-is-getentitlements-not-planentitlement]].

İlgili: [[fabrika-done-reports-can-be-wrong]]
