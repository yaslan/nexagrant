---
name: fabrika-module-state-not-enforced
description: ModuleState (OFF/DEV/PILOT/ON) hiçbir route veya server action tarafından kontrol edilmiyor — checkModuleAccess/requireModule kod tabanında hiç çağrılmıyor, sistemik (M9'a özgü değil)
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/lib/modules/access.ts`'teki `checkModuleAccess`/`assertModuleAccess` ve
`src/lib/modules/hooks.tsx`'teki `requireModule` HOC'u tanımlı ve doğru yazılmış, ama
**hiçbir sayfa/route/server action bunları çağırmıyor**:

```
$ grep -rln "checkModuleAccess\|assertModuleAccess" src --include=*.ts --include=*.tsx
src/lib/modules/access.ts   # yalnızca kendi tanımı
```

Bu M9'a özgü değil — CLAUDE.md kural 3'ün öngördüğü "rota koruması `requireModule('M8')`
middleware'iyle" **hiçbir modülde uygulanmıyor**. Sonuç: `/admin/modules` ekranından bir modülü
bir kiracı için `OFF`/`DEV` yapmak, DB'ye doğru yazılıyor (state-machine + `AuditEvent` çalışıyor)
ama o kiracının kullanıcısı ilgili sayfayı **hâlâ tam olarak görüp kullanabiliyor**.

**Ampirik kanıt (2026-09-07, TASK-MTQV9DOEBLYES):** M9 bir beta kiracısında `DEV`'e çekildi,
o kiracının gerçek `TENANT_OWNER` oturumuyla `/opportunities/[id]/briefs` açıldı → sayfa tam
render edildi, hiçbir engelleme yok. Ekran kanıtı:
`docs/agent-results/TASK-MTQV9DOEBLYES-screenshots/01-beta-partner-briefs-attempt.png`. Takip
kartı: `TASK-MTQVUWC04VOKF` (P0, todo).

**Ek tasarım kusuru — gate eklendiğinde de dikkat:** `checkModuleAccess`'in `DEV` dalı yalnızca
`role === 'TENANT_OWNER'` kontrolü yapıyor, HANGİ kiracının owner'ı olduğuna bakmıyor. Her
kiracının kendi TENANT_OWNER'ı (dış müşteri dahil) `DEV` modülü görür. "DEV = yalnızca bizim iç
ekibimiz" anlamına gelmesi için platform-admin/iç-kiracı ayrımı eklenmesi gerekiyor.

**Nasıl uygulanır:** "Bu modülü şu kiracıda kapat/aç" türü bir işte, ModuleState değişikliği
DOĞRU YOLDAN (state-machine/admin UI) yapılabilir ve DB'ye doğru yazılır — ama "erişim gerçekten
engellendi mi" iddiası koda bakmadan yapılmamalı; şu an itibariyle hiçbir modül için gerçek
değil. `nav: []` olan modüller zaten kimseye görünmez (state'ten bağımsız) — "menüde yok" kanıtı
bu yüzden yanıltıcı olabilir.

İlgili: [[fabrika-done-reports-can-be-wrong]], [[fabrika-workspace-url-segment-is-decorative]].
