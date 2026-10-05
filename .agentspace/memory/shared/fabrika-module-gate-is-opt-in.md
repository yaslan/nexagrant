---
name: fabrika-module-gate-is-opt-in
description: Fabrika'da modül kapısı sayfa başına opt-in — moduleGate() çağırmayan yeni bir sayfa kapalı modülü herkese açar; server action'da assertModuleAccess ilk satır olmalı
metadata:
  type: project
updatedAt: 2026-09-10
---

`ModuleState` kapısı 2026-09-07'de (TASK-MTQW8188AWOAT) bağlandı, ama **opt-in**:

- **Sayfa:** `moduleGate(moduleId, locale)` — `src/lib/modules/guard.tsx`. Sayfanın başında iki
  satır. Çağırmayı unutan yeni bir modül sayfası, modül `OFF`/`DEV` olsa bile herkese açık kalır.
  2026-09-10 itibarıyla ~20 sayfada var (`grep -rln "moduleGate(" src/app`) — sayı eskir, GREP'le.
- **Server action:** `assertModuleAccess(moduleId)` **ilk satır** olmalı. Sıra pazarlık konusu
  değil — `generateText()` / `generateCompletion()` (`src/lib/llm.ts` — `src/lib/ai/llm.ts` SİLİNDİ) ulaşıldığı anda `AiUsageLog` yazıp
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

**LLM çağrı envanteri `generateText` grep'iyle EKSİK çıkar (2026-09-10, TASK-MTVBL9HBML1ZH).**
Bir denetim kapısız üç çağrı bildirdi (m2/m7/m10 — üçü de doğruydu), ama dördüncüsünü kaçırdı:
`src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` adaptörün DİĞER dışa aktarımını,
`generateCompletion`'ı doğrudan çağırıyor. Envanter grep'i **her ikisini de** taramalı:
`grep -rn "generateText\|generateCompletion" src/`. Kapısız kalan çağrı yeri, sayfası
`moduleGate()` arkasında olsa bile deliktir — server action herkese açık bir POST uç noktasıdır
ve sayfa hiç render edilmeden çağrılabilir.

**Kapıyı eklemek mevcut testleri kırar — bu bir regresyon değil, testlerin kapıdan habersiz
olmasıdır.** Bir action'a `assertModuleAccess` ekleyince o action'ın test dosyaları gerçek kapıyı
koşar, `@/lib/auth` stub'sız olduğu için `NO_TENANT` reddi alır; bazıları `next-auth` →
`next/server` çözülemediği için hiç YÜKLENMEZ. Çözüm iddiayı gevşetmek değil, ortak stub:
`moduleAccessStub()` — `tests/helpers/tenant-scope-mock.ts` (`tenantModuleStub` / `dbModuleStub`
ile aynı sözleşme).

Kapı bugün (2026-09-10) 4 üretim AI action'ının hepsinde: M2 (iki yerde), M6, M7, M9, M10.
`src/modules/m6/server/esr-parser.ts` kasten kapısız — `'use server'` yok, üretimde çağıranı yok,
kapılayacak oturumu yok; bir action'a bağlanan gün çağıranın açması gerekir.

İlgili: [[fabrika-done-reports-can-be-wrong]] ·
[[fabrika-no-spend-claim-needs-the-real-llm-adapter]] ·
[[fabrika-server-action-replay-proves-a-gate]]
