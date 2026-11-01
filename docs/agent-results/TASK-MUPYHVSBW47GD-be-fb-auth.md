---
sözleşme: 3
görev: TASK-MUPYHVSBW47GD
kod: TASK-MUPYHVSBW47GD
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: jwt üyelik okuması withSystemScope('tenant-discovery') içinde; fabrika_app ile gerçek girişte dashboard 200 ve rol geliyor (düzeltmesiz 307 → /no-workspace). Yerel dev'deki merge'de 24 test kırmızı; düzeltme 82d8b63c'de, henüz merge edilmedi.
platform: mac (Darwin 27, Homebrew PostgreSQL 16.15 + pgvector, yalıtılmış küme :55341; next dev :3417, DATABASE_URL=fabrika_app NOSUPERUSER NOBYPASSRLS; Chromium/Playwright). Değişiklik yalnız sunucu tarafı TS (Auth.js jwt callback) ve test; platforma bağlı kod yolu yok, Linux CI ve Windows'ta davranış aynı. Linux/Windows'ta koşulmadı (yerel doğrulama mac). Canlı Supabase'e bağlanılmadı, yazılmadı.
sürüm: 1
tarih: 2026-10-01T20:41:26.600Z
---

# P0: girişte üyelik okuması fabrika_app + FORCE RLS altında 0 satır

## 1. Ne yapıldı

**Kök neden (doğrulandı):** `src/lib/auth.ts` jwt callback'i, `prisma.user.findUnique({ select: { memberships: … } })` ile üyelikleri okuyor. `User`'ın RLS'si yok, ama iç içe okunan `"Membership"` FORCE RLS `tenant_isolation` altında. Giriş anında `app.tenant_id` bilinmediği için `fabrika_app` 0 satır görüyor; token tenant'sız kalıyor ve kullanıcı `/no-workspace`'e düşüyor. Yerel geliştirmede ve CI'da uygulama `fabrika` (SUPERUSER) ile bağlandığı için kusur hiç görünmedi.

`rls:bypass-check` de bunu yakalamıyordu. CHECK A erişim nesnesine bakıyor (`prisma.user.…`) ve RLS'siz bir modeli denetlemiyor. Aynı kör noktayı `request-deletion.ts`'deki yorum da daha önce not etmiş.

**Düzeltme** (`b8f1f9a2`, dal `be-fb/auth-membership-scope`, taban yerel `dev` 5a1e3db4):
- Okuma `withSystemScope('tenant-discovery', 'auth.jwt.membership', tx => tx.user.findUnique(…))` içine alındı. Bu ADR-0009'daki imzalı kapıdır.
- Sorgu, seçilen alanlar, `tenant.deletedAt` filtresi ve bağlı/istenen kiracı filtreleri değişmedi.
- Sorgu yalnız `User.id = token.id` ile sınırlı. İlişki filtresi `"Membership"."userId" = token.id` olduğu için başka bir kullanıcının satırı eşleşemez.
- `retryOnceIfNotConnected` ve `try/catch` aynen duruyor. Hata olursa oturum yine kurumsuz kalıyor (fail-closed).
- `scripts/tenant-bypass-baseline.json`'a CHECK D / `system-scope` / `tenant-discovery` girdisi gerekçesiyle eklendi.

**Testler:**
- `ece17afe`: yeni `tests/auth-jwt-membership-app-role.live.test.ts`. `src/lib/db.ts`, `auth.ts` yüklenmeden önce **fabrika_app** istemcisine bağlanıyor ve gerçek jwt callback'i koşuyor. 6 test:
  - eski düz okumanın 0 üyelik döndüğünü ölçer (kusurun kanıtı);
  - girişte tenant, rol ve workspaceIds gelir;
  - sonraki istekte de korunur;
  - V'nin üyeliği U'ya dönmez; U, B'ye geçmek isterse A'da kalır;
  - kapsam okuma sonrasına sızmaz;
  - üyeliği olmayan kullanıcı kurumsuz kalır.
- `82d8b63c`: `src/lib/auth-callbacks.test.ts` `./db`'yi mock'luyordu; sorgu artık `withSystemScope`'tan geçtiği için 23 test kırılmıştı. `./system-scope` mock'landı ve çağrının amacı da doğrulanıyor (`tenant-discovery`, `auth.jwt.membership`). Yeni live testteki teardown `where`'i `requireId` ile sarıldı (teardown-where-guard).

**3. adım: aynı sınıfta başka yol var mı?** RLS'siz bir model üzerinden RLS'li bir ilişkinin iç içe okunduğu yerler tarandı.
- Giriş/oturum zinciri:
  - `authorize`: User okur; kayıt yolunda `bindTransactionToTenant` var.
  - `signIn`: Account/User okur.
  - `listSessionWorkspaces`: `withTenant` ile çalışır, token'da tenant varsa sorunsuz.
  - Davet kabulü (`lookupInvitation`): zaten system-scope.
  - `membershipRoleOf`: `withTenant` ile çalışır.
  - `unstable_update` ile yeniden bağlama: aynı jwt okumasından geçtiği için düzeldi (testte ölçüldü).
  - `proxy.ts` ve `tenant.ts`: DB okumuyor.

  Bu zincirde başka 0 satır dönen yol **yok**.
- `request-deletion.ts` ve `users-scheduled-deletion.ts` aynı kalıpta, ama zaten `withSystemScope('subject-scoped')` içindeler.
- **Giriş dışı bir bulgu (düzeltilmedi):** `src/app/[locale]/admin/tenants/page.tsx:25`, `prisma.tenant.findMany({ include: { _count: { select: { users, workspaces } } } })`. fabrika_app altında üye ve çalışma alanı sayıları **0** görünür. Hata vermez, yalnız sayılar yanlış olur. Önerim `withSystemScope('platform-admin', …)` ile ayrı bir kart açmak.

## 2. Kanıt

**Gerçek giriş:** uygulama `next dev`, `DATABASE_URL=fabrika_app` ile koştu. Örnekleme sırasında DB'de yalnız `fabrika_app@127.0.0.1` bağlantısı görüldü; `rolsuper=f`, `rolbypassrls=f`. Auth.js akışı izlendi: csrf → `/api/auth/callback/credentials` → oturum çerezi → `/api/auth/session` → dashboard (`ekler/e2e-giris.txt`).
```
## Düzeltmesiz (5a1e3db4 auth.ts)
admin@yasinaslan.com.tr  session: {'tenantId': None, 'role': None}  GET /tr/default/dashboard -> 307 /tr/no-workspace
alice@fabrika.test       session: {'tenantId': None, 'role': None}  GET /tr/default/dashboard -> 307 /tr/no-workspace
## Düzeltmeli (b8f1f9a2)
admin@yasinaslan.com.tr  session: {'tenantId': 'demo-tenant', 'role': 'TENANT_OWNER'}     GET /tr/default/dashboard -> 200
alice@fabrika.test       session: {'tenantId': 'demo-tenant', 'role': 'PIPELINE_MANAGER'} GET /tr/default/dashboard -> 200
```
Tarayıcıda gerçek form girişi de yapıldı (Playwright, `/tr/login`, e-posta yazılıp Enter). Sonuç: `{"url":"…/tr/default/dashboard","tenantId":"demo-tenant","role":"TENANT_OWNER"}` ve PIPELINE_MANAGER için aynısı. Ekran görüntüleri: `ekler/dashboard-admin-fixed.png`, `ekler/dashboard-alice-fixed.png`. Panelde kiracı verisi var (5 proje, 7 modül) ve ADMIN bağlantısı görünüyor.

**Regresyon testi (fabrika_app):** düzeltmeyle `6 passed`. Düzeltmesiz `auth.ts` ile `3 failed | 3 passed`: giriş, sonraki istek ve başka kullanıcı testleri kırmızı. Birim testi mutasyonu: düzeltmesiz `auth.ts` ile `auth-callbacks.test.ts` 1 kırmızı (`scopeCalls`).

**Kapılar:**
- `npx tsc --noEmit` → exit 0, çıktı yok.
- İlgili suite'ler: auth-jwt-membership-app-role, auth-jwt-membership-refresh, deleted-tenant-sessionless, invitation-accept, oauth-registration (live + unit), system-scope, auth-card-signin-errors → `8 passed · 103 passed`. auth-callbacks + teardown-where-guard + yeni test → `44 passed`.
- `pnpm rls:verify` (temiz DB: db push → rls-role → zincir ×2 → db:rls → seed) → exit 0, "47 kiracıya özel tabloda … GERÇEKTEN ölçüldü".
- Tam vitest: `9 failed | 4142 passed`. Kırmızıların hepsi önceden biliniyordu: settings-profile-update ×8, server-action-rbac-guard G6, e2e-profile-save.spec. Aynı 9 kırmızı taban `dev`'de de var (TASK-MUPYHVSBW47GD-be-fb.md'de ölçüldü). Bu iş yeni kırmızı eklemiyor.
- `pnpm rls:bypass-check`: `auth.ts` girdisi eklendikten sonra yalnız **önceden var olan** CHECK C kırmızı kalıyor (`src/lib/invitations/accept.ts:201`, `tx as TenantTx`, QA Y-2 koltuk düzeltmesinden). Aynı kırmızı taban `dev`'de (5a1e3db4) de var.

## 3. Değişen dosyalar (dal `be-fb/auth-membership-scope`)
- `src/lib/auth.ts`: import + jwt okuması `withSystemScope` içinde (b8f1f9a2)
- `scripts/tenant-bypass-baseline.json`: CHECK D girdisi (b8f1f9a2)
- `tests/auth-jwt-membership-app-role.live.test.ts`: yeni (ece17afe, 82d8b63c)
- `src/lib/auth-callbacks.test.ts`: system-scope mock'u + amaç kontrolü (82d8b63c)
- Ekler: `docs/agent-results/TASK-MUPYHVSBW47GD-be-fb-auth-ekler/{e2e-giris.txt, dashboard-admin-fixed.png, dashboard-alice-fixed.png}`

## 4. Riskler
- **Yerel dev şu an kırmızı:** yerel `dev`'de `268500d2` "Merge be-fb/auth-membership-scope … patron talebi" var. Bu merge'ü ben yapmadım; b8f1f9a2 ve ece17afe'yi içeriyor ama **82d8b63c'yi içermiyor**. Bu yüzden yerel `dev`'de `auth-callbacks.test.ts` (23) ve `teardown-where-guard` (1) kırmızı. `origin/dev`'e henüz gitmedi. **82d8b63c merge edilmeden dev push edilirse CI kırmızı olur.**
- Her istekte jwt callback artık bir işlem ve bir `enter_system_scope()` çağrısı yapıyor; önceden iki sorguydu. Gecikme etkisi ölçülmedi, küçük olması beklenir.
- Kapsam yalnız `tenant-discovery` için açık ve işlem bitince kapanıyor (`is_local`). Testte aynı bağlantının sonrasında üyelik görmediği ölçüldü.

## 5. Açık sorular
- `82d8b63c`, `dev`'e merge edilsin mi? Kart push/merge yasaklıyor; önceki merge'ü başkası yaptı.
- `accept.ts:201` CHECK C kırmızısı ve admin kiracı listesindeki `_count` sorunu için ayrı kart açılsın mı?

## 6. Sonraki adım
- 82d8b63c merge → dev'de tam vitest + `rls:bypass-check` (CHECK C ayrıca kapanmalı) → push → canlıda leed-fb'nin hesabıyla giriş doğrulaması.
