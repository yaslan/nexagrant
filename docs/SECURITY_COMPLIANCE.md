# SECURITY_COMPLIANCE.md — Güvenlik, KVKK/GDPR, YZ uyumu

## 1. Çok kiracılı izolasyon
**RLS (Row Level Security) Pattern:**
- Her kiracı-bağımlı tablo (`tenantId: String` alanı) PostgreSQL RLS politikası ile korunur.
- Politika iki aşamalı:
  1. `USING` cümlesi: Okunan satırlar filtrelenir → `"tenantId" = current_setting('app.tenant_id', true)`
  2. `WITH CHECK` cümlesi: Yazılan/güncelenen satırlar filtrelenir → simetrik ve aynı koşul
- Nullable tenantId tablolar (Document, Chunk, ConceptTemplate) paylaşılan satırlar için `USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))` kuralı.
- Sistem-geneli tablolar (Tenant, User, Call, Topic, Cordis*, SystemAlert) RLS gerektirmez.

**Katmanlı koruma:**
```
┌──────────────────────────────────────────┐
│ Uygulama (withTenant sarmalayıcı)        │
├──────────────────────────────────────────┤
│ Prisma ORM (app.tenant_id session var)   │
├──────────────────────────────────────────┤
│ PostgreSQL RLS Policy (veri tabanı)      │ ← DB-level enforcement
└──────────────────────────────────────────┘
```

**Uygulama tarafı:**
- Tüm Prisma sorguları `src/lib/db.ts`'deki `withTenant(prisma, tenantId)` sarmalayıcısında çalışır:
  ```typescript
  await withTenant(prisma, tenantId, async (client) => {
    return client.opportunity.findMany(...)
  })
  ```
  → İstekte `SET LOCAL app.tenant_id = '<id>'` tetiklenir.
- Server Action / Route Handler dışında yalın `prisma.model.findMany()` çağrısı **yasak** (lint kuralı).
- Modül event bus (`src/core/events`) yapılar arası veri geçişini sağlar (tenantId implicit).

**Policy Yönetimi:**
- Tüm policies `prisma/rls.sql`'de toplu tanımlanır (idempotent).
- Yeni model eklendiğinde:
  1. `schema.prisma`'ya `tenantId String` alanı ekle
  2. Modeli `prisma/rls.sql` FOREACH dizisine ekle
  3. Migration oluştur: `pnpm db:migrate dev`
  4. Policies uygula: `pnpm db:rls`
  5. Doğrula: `pnpm rls:check` → PASS

**CI & Doğrulama:**
- `pnpm rls:check` → `scripts/check-rls.ts` schema.prisma'daki tüm `tenantId` alanlarını tarar, `rls.sql`'deki politikalar ile karşılaştırır; eksik olanları raporlar ve exit code 1 ile çıkar.
- `.github/workflows/check-rls.yml` — PR'da `prisma/schema.prisma` veya `prisma/rls.sql` değiştiğinde otomatik çalışır; başarısız olursa PR yorumu ekler.
- Test ve lint pipelines paralel yürütülür.

**Lokal Test:**

> ⚠️ RLS yalnızca politikalara **tabi** bir rolle ölçülebilir. Yerel `fabrika` rolü
> `SUPERUSER` + `BYPASSRLS` olduğu için o oturumda yapılan her izolasyon testi
> yanlış yeşil verir. Bu yüzden ayrı bir rol var: **`fabrika_app`**
> (`NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, yalnız DML).

```bash
# 0. Rolü oluştur (idempotent). Parolayı üretir ve DATABASE_URL_RLS_TEST olarak
#    .env'e ekler; uygulamanın DATABASE_URL'ine DOKUNMAZ.
pnpm db:rls-role
#    Geri alma: pnpm db:rls-role:rollback

# 1. Rolün gerçekten muaf olmadığını doğrula — bu satır yeşil değilse aşağıdaki
#    hiçbir test bir şey kanıtlamaz.
psql "$DATABASE_URL_RLS_TEST" -c \
  "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user"
#    Beklenen: fabrika_app | f | f

# 2. Aynı oturumda filtrelemeyi gör
psql "$DATABASE_URL_RLS_TEST"
SELECT count(*) FROM "Workspace";                          -- 0  (app.tenant_id set değil)
SELECT set_config('app.tenant_id', 'tenant-a-id', false);  -- SET bind parametresi almaz
SELECT count(*) FROM "Workspace";                          -- yalnız A'nın satırları
SELECT set_config('app.tenant_id', 'tenant-b-id', false);
SELECT count(*) FROM "Workspace";                          -- yalnız B'nin satırları

# 3. Entegrasyon testi (fixture'ları superuser yazar, iddiaları fabrika_app okur)
pnpm test -- tests/rls.spec.ts

# 4. E2E
pnpm test:e2e -- tests/e2e/rls.spec.ts
```

`DATABASE_URL_RLS_TEST` yoksa `tests/rls.spec.ts` iddialarını **atlar** ve nedenini
yazar — sessizce yeşile dönmez. Uygulamanın ana `DATABASE_URL`'i hâlâ `fabrika`
rolündedir; ana bağlantının `fabrika_app`'e çevrilmesi ayrı bir iştir ve
`withTenant()` kapsamı tüm sorgulara yayılmadan yapılamaz.

**Test Coverage (33 models):**
- ✅ Opportunity, Workspace, Evidence (API isolation)
- ✅ TopicMatch, Claim, Interaction (DB-level isolation)
- ✅ Document, Chunk, ConceptTemplate (nullable tenantId / shared rows)
- ✅ Cross-tenant session variable test

## 2. Kimlik ve erişim
- Auth.js; parola argon2; 2FA (TOTP) faz 2; ~~SSO (SAML/OIDC) Kurumsal~~.
  - **karar 29.09.2026 (patron):** giriş yalnız Google OAuth; şifre ve e-posta bağlantısı yok (ADR-0006). Microsoft girişi kaldırıldı (`acc35b07`). **Kurumsal SSO / SAML tamamen kaldırıldı** — ayar yalnız `Tenant.settings.sso`'ya kaydediliyordu, girişte hiç kullanılmıyordu; kodda kaldırıldı (`0fdbcb8d`; kart TASK-MUML0QZAZ5M80 `done`). M9 takvimde Outlook kaldırıldı, yalnız Google Takvim + `.ics` (`15313bc6`). Yukarıdaki "parola argon2" satırı bu karardan eskidir.
- Oturum JWT: `userId, tenantId, role, workspaceIds`; kiracı değiştirme yeni oturum.
- `guest_partner`: yalnızca davet bağlantısı + e-posta doğrulama; kapsam tek `Proposal`. Misafir, bağlı ajansın ad ve logosunu (ajans co-brand'ı) görmez: kabuk ve logo uç noktası `view_tenant_branding` iznine bağlıdır (`src/lib/rbac.ts`, NG-248 / K-584216); beş kurum içi rol görür.

## 3. Veri koruma (KVKK + GDPR)
- Veri envanteri (`docs/data-inventory.md` üretilecek): kişisel veri = kullanıcı hesabı, muhatap adı/e-postası (`Relationship`), toplantı notları.
- Hukuki dayanak: sözleşme (hesap), meşru menfaat (muhatap iletişim bilgisi — kullanıcı girer; "kaynak" alanı zorunlu).
- Haklar: dışa aktarma (`/{locale}/{workspace}/settings/privacy` → `POST /api/user/export`, JSON), silme (aynı ekran → `POST /api/user/request-deletion`; 30 gün sonra kalıcı imha), muhatap silme isteği formu (herkese açık).
- İşleyici sözleşmesi (DPA) şablonu tr/en; alt işleyiciler listesi: **Vulut** (barındırma: uygulama sunucusu, Postgres, iş kuyruğu, cPanel e-posta hizmeti `mail.fonbridge.com` — Türkiye), ~~Vercel, Neon/Supabase, Fly.io~~, Cloudflare R2, ~~Resend~~, Stripe, Anthropic/OpenAI, Google (OAuth giriş) (**güncel 29.09.2026, TASK-MUN2UXWTAX1AQ:** barındırma sağlayıcısı Vulut — BTK lisanslı yer sağlayıcı ve hosting firması, Türkiye (patron kararı). Vercel, Neon/Supabase ve Fly.io aday olarak yazılmıştı, seçilmedi. Vulut yurt dışı aktarım değildir; Vulut ile veri işleyen sözleşmesi (DPA) repoda yok, gerekliliği hukukçuya soruldu (`docs/legal/HUKUK-SORULARI-2026-09.md` 1.10). Yurt dışına giden kalemler: Anthropic ve OpenAI (ABD), Google OAuth (ABD), Stripe (ABD) ve bölgesi doğrulanmamış Cloudflare R2 — `docs/legal/processing-register.md` §21. **güncel 29.09.2026:** Resend kaldırıldı, `fe9fd31c`; e-posta kendi SMTP'mizden gider. **Karar verildi (patron, 29.09.2026, TASK-MUN2PNAR729H8):** kendi SMTP sunucumuz `mail.fonbridge.com`, gönderici `info@fonbridge.com`, canlı uygulama alan adı `fonbridge.com` (son karar; önceki `usfinbridge.com` göndericisi geçersiz); ayrı bir üçüncü taraf e-posta alt işleyicisi yok, e-posta barındırma sağlayıcısı (Vulut) kapsamındadır. **SMTP modeli (Seçenek A, patron 29.09.2026, TASK-MUN4U4PR3DWMT):** Vulut cPanel/Exim — e-posta Vulut'un cPanel e-posta hizmetidir, sunucunun bakımı ve güncellemeleri Vulut'ta, PTR `srv.iyisunucu.com.tr` kalır; kendi MTA (B, docker-mailserver) seçilmedi; ayrı e-posta alt işleyicisi yine yok. Canlı kurulum ve DNS (SPF/DKIM/DMARC) henüz yapılmadı: `docs/SMTP-SUNUCU.md` §8). **PostHog ve Sentry bu listede DEĞİL** — koda bakıldığında ikisinin de gerçek bir işlemesi yok: `src/lib/analytics.ts` tamamen bir stub (yalnızca `NODE_ENV === 'development'`'ta `console.log`, ağ çağrısı yok — PostHog hiç canlıya alınmadı); Sentry ise patronun 2026-09-07 kararıyla **bilinçli olarak kaldırıldı** — gerekçe: çok kiracılı Avrupa fonları SaaS'ında veri dışarı çıkmasın (`src/lib/observability/sentry.ts` silindi, TASK-MTQUN8VV6DK8C). Hata/geri bildirim izleme bugün tamamen iç `SystemAlert` mekanizmasıyla yapılıyor, üçüncü tarafa gitmiyor. Ayrıntı ve kanıt: `docs/legal/processing-register.md` §19. **Güncel 29.09 (TASK-MULQMKP4YOM04):** PostHog (`src/lib/analytics.ts`) ve isteğe bağlı Sentry iletimi (`src/lib/observability/sentry.ts`) koda eklendi. İkisi de anahtar girilene kadar kapalı. PostHog ayrıca çerez onayı ister ve kişisel veri göndermez. Sentry DSN'ini doldurmak 07.09 kararını geri almak demektir ve patron onayı ister. Ayrıntı: processing-register §19a.
- Veri yeri (**güncel 29.09.2026, TASK-MUN2UXWTAX1AQ**): veritabanı, uygulama sunucusu, iş kuyruğu ve e-posta **Türkiye'de (Vulut)**. ~~AB bölgesi (Frankfurt) varsayılan~~ — Frankfurt'ta veri merkezi yok, bu satır plandı ve seçilmedi. Yurt dışı aktarım yalnız Anthropic, OpenAI (ABD) ve Google OAuth (ABD); Cloudflare R2'nin bölgesi doğrulanmadı. KVKK yurt dışı aktarım — açık rıza + standart sözleşme; kurumsal müşteriye "AB bölgesi model" seçeneği (faz 2). Ayrıntı: `docs/kamu/VERI-YERLESIMI.md`.
- **Güncel durum (30.10.2026, FO-233, patron):** canlı alan adı `nexagrant.com`; gönderici `info@nexagrant.com`, SMTP `mail.nexagrant.com`. Bu belgedeki 29.09.2026 kayıtları ve ölçümler tarihsel olarak `fonbridge.com`'a aittir.
- Çerez onayı; analitik yalnızca onayla.

### 3.1 Veri kategorileri ve hukuki dayanak (uygulanan)

| Kategori | Alanlar | Veri sahibi | KVKK dayanağı | Saklama |
|---|---|---|---|---|
| Kimlik ve iletişim | `User.name`, `User.email`, `User.locale` | Platform kullanıcısı | md.5/2-c (sözleşmenin ifası) | Hesap ömrü + 30 gün |
| Üyelik ve yetki | `Membership.role`, `workspaceIds` | Platform kullanıcısı | md.5/2-c | Hesap ömrü + 30 gün |
| Kimlik doğrulama | `Account`, `Session` (jetonlar) | Platform kullanıcısı | md.5/2-c | Oturum ömrü; **dışa aktarıma dahil edilmez** |
| Çalışma kaydı | `Effort.hours`, `date`, `note` | Platform kullanıcısı | md.5/2-f (meşru menfaat) | Hesap ömrü + 30 gün |
| Değerlendirme | `Evaluation` (puanlar) | Platform kullanıcısı | md.5/2-f | Kalıcı; silmede `userId` NULL |
| YZ kullanım günlüğü | `AiUsageLog` (model, jeton, kredi) | Platform kullanıcısı | md.5/2-f + şeffaflık beyanı | Kalıcı; silmede `userId` NULL |
| Onay akışı | `ApprovalRequest` | Platform kullanıcısı | md.5/2-ç (hukuki yükümlülük) | Talep eden silinince cascade; onaylayan NULL |
| Faturalama | `Subscription`, `AddOn`, `CreditLedger` | Kiracı (tüzel kişi) | md.5/2-ç | Yasal saklama süresi |

### 3.2 Silme akışı (uygulanan)

1. Kullanıcı `Ayarlar → Gizlilik ve Verilerim → Hesabı Sil İsteği` ile talepte bulunur (onay modalı zorunlu).
2. `requestAccountDeletion` yalnızca **işaretler**: `User.deletionRequestedAt` ve `User.deletedAt` = şimdi. Hiçbir satır silinmez; üyelikler durur, böylece talep geri alınabilir.
3. Kullanıcıya bilgilendirme e-postası gider (SMTP sunucumuz `mail.fonbridge.com` — Vulut cPanel e-posta hizmeti, Seçenek A, patron 29.09.2026; gönderici `info@fonbridge.com`, barındırma Vulut, Türkiye; `src/lib/email/mailer.ts` — 29.09.2026'dan önce Resend; gönderim hatası talebi bloke etmez).
4. Kullanıcı 30 gün içinde aynı ekrandan `cancelAccountDeletion` ile dönebilir.
5. `users-scheduled-deletion` graphile-worker işi (`src/lib/jobs/tasks/users-scheduled-deletion.ts`) her gün 03:00 UTC'de süresi dolanları kalıcı siler. Sıra: `AiUsageLog.userId = NULL` → `Effort` sil → `User` sil (cascade: `Account`, `Session`, `Membership`, talep edilen `ApprovalRequest`). R2'ye dokunulmaz: depodaki her nesne kiracınındır, kişiye bağlı önek yoktur (`docs/legal/processing-register.md` §15, TASK-MUPL2D9B8QWAB).

Kalıcı imha **yalnızca** bu iştedir; hiçbir API yolu doğrudan hard-delete yapmaz.

### 3.3 Dışa aktarım kapsamı (uygulanan)

`exportUserData` çıktısı: `{ timestamp, tenant, tables }`. `tables` yalnızca **talep eden kişiye ait** satırları içerir (`userId` filtresi); kiracının tamamı değil. `Account` satırlarından yalnızca `provider`, `type`, `createdAt` alınır — `access_token`, `refresh_token`, `id_token` taşınabilirlik kapsamında değildir ve indirilen dosyaya yazılması sır sızıntısı olur.

### 3.4 DPA süreci

Şablonlar `docs/legal/dpa-tr.md` ve `docs/legal/dpa-en.md` dosyalarındadır; `/{locale}/compliance/dpa` sayfası bu dosyaları okuyup yayımlar (metin kodda gömülü değildir). Sürüm ve yürürlük tarihi belgenin başındadır; alt işleyen değişikliği önceden bildirilir, ihlal bildirimi 72 saat içindedir.

## 4. YZ kullanımı
- Komisyon kuralı: üretken YZ kullanılabilir; başvuran sorumlu; hangi araçların nasıl kullanıldığı şeffaf; kaynaklar listelenir. → `AiUsageLog` + otomatik beyan (`/ai/disclosure`).
- Sağlayıcı koşulları: eğitim için kullanılmama, sağlayıcıların yayımlanmış ticari hizmet şartlarına dayanır; sağlayıcılarla imzalanmış ayrı bir ek sözleşme yoktur ve şartlar değişebilir. Sağlayıcılar gönderilen içeriği kendi şartlarına göre sınırlı süre saklayabilir (OpenAI metin gömme isteklerinde bugün 30 güne kadar); sıfır saklama taahhüt edilmez. Bkz. DPA 5. madde.
- Kullanıcıya uyarı: gizli/patentlenebilir içerik için "hassas mod" (yalnızca kurumsal model / yerel) — faz 2.
- Evaluator Lens çıktısı "iç ön değerlendirme"; hakemlik simülasyonu Komisyon değerlendiricileri için değil, başvuranlar için.

## 5. Uygulama güvenliği
- OWASP ASVS L2 hedefi; zod ile tüm girişler; CSRF (Server Actions yerleşik); CSP başlıkları; oran sınırlama (Upstash) giriş/AI uç noktaları; dosya yükleme MIME + boyut + virüs taraması.
- Virüs taraması (NG-239, §18.3 — ClamAV faz 2 tamamlandı): kanıt dosyaları yüklemeden sonra arka planda
  (`evidence-scan` işi, graphile-worker) uygulamayla aynı makinedeki `clamd`'ye TCP INSTREAM ile akıtılır
  (`src/lib/clamav.ts`; `CLAMD_HOST`/`CLAMD_PORT`/`CLAMD_TIMEOUT_MS`, `src/lib/env.ts`; yerelde
  `docker compose --profile scan up -d clamav`, port yalnız 127.0.0.1). **Yalnız `CLEAN` dosya iner**; tek kapı
  `src/lib/evidence-scan-gate.ts` (indirme rotası 409 `EVIDENCE_SCAN_PENDING|INFECTED|ERROR`, presigned GET
  imzalanmaz, ekranda bağlantı yok). Kapalı hata: clamd tanımsız/kapalı/zaman aşımı → `ERROR`, dosya inmez,
  1 dk / 5 dk / 30 dk yeniden deneme + 15 dakikalık süpürme. Zararlı bulunursa nesne silinir, `AuditEvent`
  `evidence.scan.infected` ve `SystemAlert` (`error`, kiracı kimliği/dosya adı içermez) yazılır. Testler yalnız
  EICAR test dizgisini kullanır (`tests/helpers/eicar.ts`). Sınırlar: imza veritabanı konteynerdeki freshclam ile
  güncellenir (güncelliği ayrıca izlenmiyor); 25 MB üst sınır clamd `StreamMaxLength` (100 MB) altında; CI'da clamd
  servisi yok, gerçek-clamd testleri `NG239_CLAMD_HOST`/`CLAMD_HOST` verilmeden atlanır.
- Sırlar: env; log'da PII maskeleme. **Sentry KULLANILMIYOR** (bilinçli mimari karar, 2026-09-07 — veri dışarı çıkmasın; bkz. §3 ve `docs/legal/processing-register.md` §19), bu yüzden "Sentry PII kapalı" iddiası da geçersizdi ve kaldırıldı.
- Yedekleme: ~~Neon PITR 7 gün~~ (Neon seçilmedi; barındırma Vulut, 29.09.2026 — Postgres yedekleme ve geri yükleme süresi Vulut kurulumunda yeniden yazılacak, bugün belgelenmiş değil); R2 sürümleme; aylık geri yükleme tatbikatı.
- Olay müdahale: 72 saat bildirim prosedürü (GDPR), KVKK Kurulu bildirimi.

## 6. Lisanslar
- CORDIS / F&T verisi: AB açık veri (CC BY 4.0) — atıf ürün içinde; türev metrikler Fabrika'nın.
- Çalışma programı PDF'leri: Komisyon belgesi; RAG için kullanım, yeniden yayım yok.
