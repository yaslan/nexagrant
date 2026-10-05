# TASK-MULUJ8O4JH1PF — AuditEvent NULL satırları artık yalnız system scope'ta (se-fb)

**Sprint:** FB-GAP-1 · **Dal:** dev · **Commit:** `12aacc7d` · **Kaynak:** be-fb K-6 (TASK-MULU7GVFBTRXX), crw-fb İNCELEME-2 K-6 (`TASK-MULT4H6G6LCQG-crw-fb.md`)

## Özet risk tablosu

| #   | Bulgu                                                                                            | Önem (etki × istismar)                                                                  | Durum                                      |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| F-1 | AuditEvent `tenant_or_shared`: `tenantId` NULL satırlar HER kiracıya okunur                      | **Orta** (platform-içi kimlik/plan verisi sızar; KVKK kayıtları kod yolu gereği açıktı) | **Kapatıldı**, canlı ölçüm + test          |
| F-2 | Aynı politika: kiracı oturumu NULL satır **yazabiliyor** (platform denetim günlüğüne sahte olay) | **Orta** (denetim izi bütünlüğü; admin/audit'te "platform olayı" gibi görünür)          | **Kapatıldı**, canlı ölçüm + test          |
| F-3 | SystemAlert: RLS yok, `fabrika_app` SELECT/INSERT/UPDATE/DELETE                                  | **Düşük** (bugün kiracıya okuma yüzeyi yok; derinlemesine savunma açığı)                | **Rapor + öneri** (bu kartta düzeltilmedi) |

## 1. Ne yapıldı

### 1.1 Keşif — NULL `tenantId` yazan çağrılar ve PII envanteri

Tüm `auditEvent.create` / SQL `INSERT INTO "AuditEvent"` yerleri tarandı (`grep -rn "auditEvent\.\(create\|createMany\|upsert\)"` + migration'larda SQL insert). NULL yazan yerler:

| Çağrı yeri                                                                    | `type`                                                       | `data` alanları                                           | PII?                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/actions/user/request-deletion.ts` `recordErasureAudit` (üyeliği yoksa)   | `user.erasure.requested` / `.cancelled`                      | `subjectRef` (= sha256(userId)), `extra` (tarih alanları) | Doğrudan PII yok; `subjectRef` **takma ad** (pseudonymous) — userId bilinirse eşlenebilir. E-posta yazılmıyor. |
| `src/lib/inngest/jobs/users-scheduled-deletion.ts` `writeErasureAudit`        | `user.erased`                                                | `subjectRef`, `requestedAt`, `reason`                     | Aynı: takma ad + silme tarihi/nedeni (KVKK talebi var olduğu bilgisi).                                         |
| `src/actions/user/export-data.ts` `recordAccessAudit` (oturumda tenant yoksa) | `user.data.exported`                                         | `subjectRef`, `rowCounts`                                 | Takma ad + tablo başına satır sayısı.                                                                          |
| `src/lib/billing/plan-repository.ts` `publishVersion`                         | `plan.version.published`                                     | planId, versionId, version, etki sayıları                 | `actorId` = platform admin kullanıcı id'si (iç tanımlayıcı).                                                   |
| `plan-repository.ts` `archivePlan` / `deletePlan` / `setPlanVisibility`       | `plan.archived` / `plan.deleted` / `plan.visibility.changed` | planId, before/after                                      | `actorId` = platform admin kullanıcı id'si.                                                                    |

NULL **yazmayan** (her zaman tenantId dolu) yerler: admin/modules, settings/modules, pipeline, iyzico, subscription-sync, auth (agency.invite.redeemed), agency/codes, agency/actions, beta-onboarding script. `note_agency_invite_rejection` SQL fonksiyonu K-6'dan beri bilinmeyen kodda AuditEvent yazmıyor (SystemAlert'e yazıyor) ve `SET app.system_scope='on'` ile çalışıyor.

Tip-bazlı istisna **gerekmedi**: NULL olay türlerinin hiçbiri (plan yönetimi, KVKK silme/ihracat) bir kiracının görmesi gereken bilgi değil. Kiracıya ait olaylar zaten kendi `tenantId`'si ile yazılıyor.

### 1.2 Düzeltme

- `prisma/rls.sql`: AuditEvent katı `tenant_isolation` döngüsüne alındı; paylaşımlı döngüden çıkarıldı; `DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent"` (izin veren politikalar OR'lanır — bırakılsaydı sızıntı sürerdi). `system_scope` politikası rls.sql'in pg_policies'ten türettiği döngüyle AuditEvent'e yine kuruluyor.
- **Yeni migration** `prisma/migrations/auditevent-null-system-only.sql` + `.down.sql` (idempotent, satır silmez), `apply-order.txt` SONUNA aynı commit'te eklendi.
- **KVKK denetim izi kaybolmasın diye yazıcılar düzeltildi** (katı politika, bağlamsız NULL insert'ü reddeder):
  - NULL satırlar → `withSystemScope('subject-scoped', …)`: `request-deletion.erasureAudit`, `erasure-sweep.erasureAudit`, `gdpr-export.accessAudit`.
  - Aynı fonksiyonlardaki kiracılı satırlar → `withTenant` (önceden çıplak `prisma` ile yazılıyordu; `fabrika_app` altında WITH CHECK zaten reddediyordu — önceden var olan hata, aynı KVKK izi olduğu için kapatıldı).
  - `plan-repository.ts` publish/archive/delete/visibility işlemleri `prisma.$transaction` yerine `withSystemScope('platform-admin', …)`.
- **admin/audit** (`src/app/[locale]/admin/audit/page.tsx`): okuma `withSystemScope('platform-admin', 'admin-audit.list', …)`; admin layout'un `isPlatformAdminSession` kapısı aynen duruyor.
- `scripts/rls-models.ts`: AuditEvent `NULLABLE_TENANT`'tan çıktı → artık katı model (rls:check, rls:verify ve bypass-check CHECK A kapsamında).
- `scripts/tenant-bypass-baseline.json`: yeni system-scope çağrıları gerekçeleriyle kaydedildi (export-data 1→2, request-deletion 3→4, users-scheduled-deletion 2→3, plan-repository platform-admin 4, admin/audit 1); export-data'daki kapanan B1 ternary kaydı `--prune` ile düşürüldü. `tenant-bypass-scan.ts`'teki eskimiş AuditEvent katalog notu kaldırıldı.

### 1.3 rls:verify kapsamı

`scripts/check-rls-live.ts`:

- `populatedTables` artık en kalabalık **NULL olmayan** kiracıyı seçiyor (AuditEvent'te en büyük grup NULL olduğundan tablo sessizce atlanıyordu).
- Yeni prob 2b: NULL satırı olan her tabloda kiracı bağlamında NULL satır sayısı **0** olmalı; `enter_system_scope('platform-admin')` içinde **hepsi** görünmeli (pozitif kontrol). Ölçüm rolünün EXECUTE yetkisi yoksa "ATLANDI" diye açıkça yazılır.

## 2. Kanıt

### 2.1 Önce / sonra canlı ölçüm (`fabrika_app`, rolsuper=false, rolbypassrls=false; değer basılmadı, yalnız sayı/tür)

ÖNCE (politika `tenant_or_shared`):

```
admin view: { nulls: 331, scoped: 175, tenants: 13 }
NULL rows by type (admin): plan.deleted 197, plan.visibility.changed 134
NULL rows with actorId set: { n: 331 }
fabrika_app, tenant A context (own rows in table=101): { nulls: 331, own: 101, other: 0 }
fabrika_app, NO tenant context sees: { n: 331 }
fabrika_app, system scope sees: { nulls: 331, total: 506 }
tenant A INSERT NULL row: ACCEPTED
no-context INSERT NULL row: ACCEPTED
```

SONRA (politika `tenant_isolation` + `system_scope`; ara sürede paralel testler 4 NULL satır daha yazmış):

```
fabrika_app, tenant A context (own rows in table=101): { nulls: 0, own: 101, other: 0 }
fabrika_app, NO tenant context sees: { n: 0 }
fabrika_app, system scope sees: { nulls: 335, total: 510 }
tenant A INSERT NULL row: REFUSED new row violates row-level security policy for table "AuditEvent"
no-context INSERT NULL row: REFUSED new row violates row-level security policy for table "AuditEvent"
system-scope INSERT NULL row: ACCEPTED
```

Veritabanında şu an KVKK (`user.erasure.*`, `user.erased`, `user.data.exported`) türünde NULL satır **yok** (yalnız plan olayları); risk bu türler için kod yolundan geliyordu.

### 2.2 Migration: idempotent + geri alınabilir, satır kaybı yok

```
start      : system_scope,tenant_or_shared
up #1      : system_scope,tenant_isolation
up #2      : system_scope,tenant_isolation
down (tx)  : system_scope,tenant_or_shared
down #2(tx): system_scope,tenant_or_shared
up (tx)    : system_scope,tenant_isolation
final      : system_scope,tenant_isolation
rows kept  : { n: 510 }
✅ prisma/rls.sql applied. Policies in public: 112 → 112
```

rls.sql tek başına C-2 durumundaki bir DB'yi onarıyor mu (transaction içinde, ROLLBACK):

```
C-2 state (tx): system_scope,tenant_or_shared
after rls.sql : system_scope,tenant_isolation | forced: true
```

### 2.3 Kapılar

- `pnpm rls:verify` — düzeltme öncesi (yeni kodla) **kırmızı**: `tenant_isolation politikası yok: AuditEvent`. Sonrası:
  ```
  Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
     ✓ okuma (NULL): AuditEvent kiracı bağlamında 335 kiracısız satırın hiçbirini görmedi
     ✓ okuma (NULL, pozitif): AuditEvent system scope'ta 335 kiracısız satırın hepsini gördü
  ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
  ```
- **Mutasyon probu** (eski `tenant_or_shared` yeni politikanın yanına geri eklendi, sonra silindi): rls:verify `exit=1`, `AuditEvent: kiracı bağlamında tenantId NULL olan 335 satır okunuyor`; yeni live test 4/5 kırmızı. Politika geri alındı: `system_scope,tenant_isolation`.
- `pnpm rls:check` ✅ (47 model; CHECK 4b ✅) · `pnpm rls:bypass-check` ✅ `no new tenant bypass … 31 on the sanctioned cross-tenant path, 0 still owed`.
- `pnpm typecheck` exit 0 · `pnpm lint` exit 0 · `pnpm test` (`set -a; source .env; set +a`): **185 dosya geçti / 2 atlandı, 2089 test geçti / 8 atlandı**, exit 0.
- Commit'lenen anlık görüntü **tek başına** (komşuların commit'lenmemiş değişiklikleri olmadan, `git checkout-index` ile ayrı dizinde): tsc exit 0, ilgili 15 test dosyası 290/290, rls:check ✅.
- Yeni live test `tests/auditevent-null-system-only.live.test.ts` (tests/helpers `assertRlsSubjectRole` ile `fabrika_app`): 5/5 ✓ — A kendi satırını görür/NULL'u görmez, A NULL yazamaz, system scope ikisini de görür, system scope NULL yazabilir, bağlamsız 0.

### 2.4 admin/audit gerçek tarayıcıda (http://localhost:3000, leed-fb sunucusu, sistem Chrome'u headless)

```
admin: status 200 | badge: 50 Kayıtlı Olay | rows: 50 | tenant-less rows: 38 | tenant rows: 12 | types: plan.assigned,plan.deleted,agency.invite.*
admin: error text shown? 0
tenant user: status 404 | audit heading count 0
```

Kareler: `docs/agent-results/TASK-MULUJ8O4JH1PF-screenshots/01-admin-audit-platform-admin.png`, `02-admin-audit-tenant-user-refused.png`.

Dürüst not: yerel sunucu `fabrika` (SUPERUSER, BYPASSRLS) ile bağlandığı için tarayıcı karesi sayfanın çalıştığını gösterir ama system scope yolunu **tek başına kanıtlamaz**; `fabrika_app` altında o yol live test (2.3) ve rls:verify pozitif kontrolüyle kanıtlandı.

## 3. Değişen dosyalar (commit `12aacc7d`)

`prisma/rls.sql`, `prisma/migrations/auditevent-null-system-only.sql`, `prisma/migrations/auditevent-null-system-only.down.sql`, `prisma/migrations/apply-order.txt`, `scripts/check-rls-live.ts`, `scripts/rls-models.ts`, `scripts/tenant-bypass-baseline.json`, `scripts/tenant-bypass-scan.ts`, `src/actions/user/export-data.ts`, `src/actions/user/request-deletion.ts`, `src/app/[locale]/admin/audit/page.tsx`, `src/lib/billing/plan-repository.ts` (yalnız 4 hunk), `src/lib/inngest/jobs/users-scheduled-deletion.ts`, `tests/rls-coverage.test.ts`, `tests/auditevent-null-system-only.live.test.ts`. `schema.prisma`'ya dokunulmadı.

Paylaşımlı ağaç: `plan-repository.ts`'te başka bir ajanın commit'lenmemiş sözleşme-planı hunk'ları ve `apply-order.txt`'te fe-fb'nin `add-tenant-province.sql` / `add-agency-funnel-province.sql` satırları vardı; commit geçici bir index ile **yalnız benim hunk'larımla** yapıldı. Onların değişiklikleri çalışma ağacında aynen duruyor (apply-order'da benim satırımın ARKASINDA; ikisi de korundu), başkasının index'teki `D docs/legal/processing-register-draft-agency-channel.md` kaydına dokunulmadı.

## 4. Riskler

- **Deploy sırası:** migration uygulanıp kod eski kalırsa, tenant-less KVKK kayıtları yazılamaz (en-iyi-çaba, yalnız `console.warn`) ve plan publish/archive/delete/visibility işlemleri, RLS'e tabi rolde, AuditEvent insert'i reddedildiği için tümden geri alınır. **Kod ve migration birlikte çıkmalı** (kod önce çıkarsa sorun yok: system scope eski politikayla da çalışır).
- **Owner rolü varsayımı:** plan yazmaları "sahip rolü" ile çalışıyorsa (rls.sql: platform tabloları fabrika_app'e kapalı) o rol `enter_system_scope`'u çalıştırabilmeli; fonksiyonun sahibi olduğu için yerelde öyle. Prod rol düzeni hâlâ TASK-MTVTPVTEBCF5Z §6 1-3-1 kararına bağlı.
- Yerel dev DB'ye migration ve rls.sql uygulandı (paylaşımlı); diğer ajanların testleri NULL AuditEvent'i artık `fabrika_app` ile bağlamsız okuyamaz — tam test paketi yeşil.
- `down.sql` sızıntıyı yeniden açar; başlığında yazıyor.

## 5. Açık sorular / SystemAlert notu (DoD madde 5)

**F-3 — SystemAlert** (ölçüm, `fabrika_app` + kiracı bağlamı):

```
rls: { relrowsecurity: false, relforcerowsecurity: false }
grants to fabrika_app: DELETE,INSERT,SELECT,UPDATE
admin count: 210 satır, 10 kaynak
fabrika_app as tenant sees: { n: 210 }
meta anahtarları arasında: tenantId, feedbackId, opportunityId, profileId, projectId, host, path, …
```

- **Bugün kiracıya açık bir OKUMA yüzeyi bulunamadı:** uygulamada SystemAlert okuyan tek sayfa `/[locale]/admin/alerts` (platform admin kapısı arkasında); geri kalan okumalar cron/job'lar ve `recordAlert`'in tekilleştirme sorgusu. Kiracı tetikli yollar (feedback, partners, reports, billing identity, calendar sync…) yalnız `recordAlert` ile yazıyor; dönen değer `{status, id, deduped, repeatCount}` — başka kiracının verisi kullanıcıya dönmüyor.
- **Derinlemesine savunma açığı:** RLS'in sınır rolü olan `fabrika_app`, tüm kiracıların kimliklerini (meta.tenantId vb.) taşıyan tabloyu okuyabilir, **güncelleyebilir ve silebilir**. Kiracı yolunda bir enjeksiyon/hata bu tabloyu okumaya çevirebilir veya bir tahmin saldırısının iz kaydını (K-6 `agency.invite.rejected.unknown` sayacı) silebilir.
- **Öneri (ayrı kart):** `ENABLE + FORCE RLS`; `fabrika_app` için INSERT'e `WITH CHECK (true)` politikası, SELECT/UPDATE/DELETE yalnız `system_scope`. Tekilleştirme okuması+güncellemesi kiracı yolundan geldiği için `recordAlert` içindeki `findOpenDuplicate`/`update` ya `withSystemScope('cross-tenant-job'…)` ile ya da `note_agency_invite_rejection` gibi dar bir SECURITY DEFINER fonksiyonla yapılmalı; `/admin/alerts` ve alerts-sweep system scope'a alınmalı. Bu kart kapsamında değil (20+ çağıran dosya).

Diğer açık nokta: `plan-repository.ts` `assignPlanToTenant`/`unassignPlanFromTenant` — çalışma ağacında başka bir ajan bunları `withTenant`'a çeviriyor (commit'lenmemiş); benim commit'im o hunk'lara dokunmadı.

## 6. Sonraki adım

1. SystemAlert RLS kartı (F-3 önerisi) açılsın — önerilen sahip be-fb/se-fb.
2. Prod deploy: migration `auditevent-null-system-only.sql` **bu commit'in koduyla aynı sürümde** uygulanmalı; ardından `pnpm rls:verify`.
3. crw-fb K-6 notu kapatılabilir.

## Platform beyanı

Doğrulama **macOS (darwin, Apple Silicon)** üzerinde yapıldı: Postgres (docker), `fabrika_app` rolü, Node 26, sistem Chrome'u headless. Değişiklik yalnız SQL politikası + TypeScript veri erişimi; süreç, dosya yolu, kabuk veya ekran bağımlı kod yolu yok — Windows/Linux'ta davranış aynıdır (Postgres RLS platformdan bağımsız). Windows ve Linux'ta **koşulamadı** (bu makinede yalnız macOS var); CI (Linux) `rls:verify` ve live testleri aynı betiklerle koşar.
