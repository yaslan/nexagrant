---
name: module-gate-not-enforced
description: ModuleState değiştirmek (OFF/DEV/PILOT/ON) hiçbir modülde erişimi fiilen etkilemiyor — checkModuleAccess/requireModule hiçbir route'ta çağrılmıyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/lib/modules/access.ts`'teki `checkModuleAccess`/`assertModuleAccess` ve
`src/lib/modules/hooks.tsx`'teki `requireModule` HOC'u tanımlı ama **hiçbir sayfa veya server
action'dan çağrılmıyor** (`grep -rln "checkModuleAccess\|assertModuleAccess" src` yalnızca kendi
tanım dosyasını bulur). Bu M9'a özgü değil, sistemik: `ModuleState` tablosunda bir kiracının bir
modülünü `OFF`/`DEV` yapmak **DB'ye doğru yazılır** (state-machine + admin UI çalışıyor,
`AuditEvent` de doğru üretiliyor) ama sayfa/route bu durumu hiç sormadan render eder.

**Nasıl doğrulandı (2026-09-07, TASK-MTQV9DOEBLYES):** M9'u `beta-anadolu-teknoloji` kiracısında
gerçek admin panelinden `DEV`'e çektim, ardından o kiracının gerçek `TENANT_OWNER` oturumuyla
`/opportunities/[id]/briefs` açtım → sayfa tam render edildi, hiçbir engelleme yok. Ekran kanıtı
`docs/agent-results/TASK-MTQV9DOEBLYES-screenshots/01-beta-partner-briefs-attempt.png`.

**Ek tasarım kusuru (gate eklendiğinde de geçerli olacak):** `checkModuleAccess`'in `DEV` dalı
yalnızca `role === 'TENANT_OWNER'` kontrolü yapıyor, HANGİ kiracının owner'ı olduğuna bakmıyor.
Her kiracının kendi TENANT_OWNER'ı (beta ortağı dahil) DEV modülü görür. "DEV = yalnızca iç ekip"
anlamına gelmesi için platform-admin/iç-kiracı ayrımı eklenmesi gerekiyor — salt rol kontrolü
yeterli değil.

**Nasıl uygulanır:** Bir sonraki sefer "modülü şu kiracıda kapat/aç" gibi bir görev gelirse:
1. ModuleState'i state-machine/admin UI üzerinden değiştir (bu kısım çalışıyor, doğru).
2. Ama "erişim gerçekten engelleniyor mu" diye DoD'da bir kanıt isteniyorsa, **önce** ilgili
   route'ta `checkModuleAccess`/`requireModule` çağrısı var mı diye kontrol et — yoksa DoD'un o
   maddesi karşılanamaz, bunu üstlenme, ayrı bir P0 kod kartı aç (bkz. `TASK-MTQVUWC04VOKF`) ve
   raporunda "DB doğru, ürün etkilenmiyor" diye açıkça ayır.
3. Bir modülün `nav: []` olması (manifest'te), o modülün hiç kimseye menüde görünmediği anlamına
   gelir — bu module-state'ten bağımsız, DoD'da "menüde görünmüyor" kanıtı istenirse bunun
   state'e değil manifest'e bağlı olduğunu belirt.

İlgili: [[fabrika-no-sentry-systemalert-decision]], [[fabrika-done-reports-can-be-wrong]] (bu da
aynı kalıp — "DB/rapor doğru ama ürün öyle davranmıyor").
