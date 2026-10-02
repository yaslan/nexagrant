**Hüküm:** BİTTİ
**Tip:** bug
**Platform:** macOS (yerel)

# TASK-MUPVLWSIPC5WU — E2E DB blokajı çözüldü + tam takım ölçümü (devop-fb, tur 2)

Dal: `devop-fb/e2e-global-fixture` (dev'e merge EDİLMEDİ) · worktree `/Users/macbook/alan/FONBRIDGE-wt-devopfb-e2e`

## 1. Ne yapıldı

1. **Teşhis:** önceki turun "migration failed / `_prisma_migrations` eksik / shadow DB'de FollowupDoc yok" bulgusu bozuk bir migration durumu değildi:
   - Paylaşımlı dev DB'si `localhost:5433/fabrika` (konteyner `fabrika-postgres`) **tamamen boş**: public şemada 0 tablo, `fabrika_app` rolü yok. Konteyner bugün 07:41 UTC'de yeniden başlamış. Önceki turun `relation "tenant" does not exist` hatası da buradan geliyordu.
   - Bu projede `_prisma_migrations` tablosunun olmaması **normal**. Proje Prisma migrate kullanmıyor: migration'lar `prisma/migrations/*.sql` dosyaları olarak duruyor ve `scripts/apply-migrations.sh` + `apply-order.txt` ile uygulanıyor. Taban tabloları `prisma db push` kuruyor (betiğin başlığı ve ci.yml "Prepare database" adımı böyle diyor).
   - `P3006 … relation "FollowupDoc" does not exist` hatası yalnız `pnpm db:migrate` (= `prisma migrate dev`) komutunda çıkıyor. Bu komut klasör tipindeki `add-m10-dual-approval-persistence/migration.sql` dosyasını boş shadow DB'de, taban tablolar olmadan koşuyor, bu yüzden hata **her seferinde** çıkar. Bu nedenle `migrate resolve` ya da `migrate deploy` çalıştırmadım, `migrate dev` de kullanmadım.
2. **Çözüm (veri silmeden):** ayrı bir E2E DB'si açtım: `CREATE DATABASE fonbridge_e2e OWNER fabrika`. Üzerinde CI'ın sırasını çalıştırdım: `prisma db push` → `pnpm db:rls-role` → `scripts/apply-migrations.sh` ×2 (idempotentlik) → `pnpm db:rls` → `pnpm db:seed`. Paylaşımlı `fabrika` DB'sine **dokunmadım** (boş olarak duruyor).
3. **`playwright.config.ts`:** `E2E_DATABASE_URL` tanımlıysa bu koşu için `DATABASE_URL`'in yerine geçiyor. Next'te process.env `.env`'den önce geldiği için dev sunucusu da aynı DB'ye bağlanıyor. Değişken tanımlı değilse davranış eskisiyle aynı (CI etkilenmez).
4. **`tests/e2e/global-setup.ts`:** önceki turun fixture'ı **hiç çalışamazdı**: küçük harfli `tenant`/`"user"`/`membership` tablolarına yazıyordu (gerçek adlar `"Tenant"`/`"User"`/`"Membership"`). Yarattığı `demo-tenant-e2e`/`demo-user-admin-e2e` kayıtlarını da hiçbir spec kullanmıyordu (`grep -r demo-tenant-e2e tests src` → yalnız global-setup). Fixture'ın yerine **salt-okur bir ön kontrol** koydum:
   - `"Tenant"` tablosu var mı?
   - seed'in kurduğu `demo-tenant` satırı var mı? FORCE RLS yüzünden bu sorgu işlem içinde `set_config('app.system_scope','on',true)` ile yapılıyor.

   Biri eksikse kurulum 3 sn içinde, hazırlık komutunu da yazan bir hatayla düşüyor. Böylece takım 600+ sn asılı kalmıyor ve yüzlerce tenantless oturum oluşmuyor. Ön kontrol hiçbir şey yazmıyor.
5. **`/tmp/e2e-setup.log` kaldırıldı.** Yalnız hata ayıklama içindi, `/tmp`'ye sabit yolla yazıyordu ve her koşuda paylaşımlı dosyanın üzerine yazıyordu. Aynı bilgi `[e2e-gate]` satırlarıyla zaten stdout'ta görünüyor.
6. **`src/app/[locale]/admin/documents/page.tsx` 2b85166d öncesine döndü.** Eklenen `result?.documents` null dalına hiçbir zaman girilemiyor: `listSharedDocuments` (src/lib/rag.ts) her zaman `{documents,total}` döndürüyor ya da hata fırlatıyor, hata durumunu da mevcut `catch` zaten karşılıyor. Değişiklik yanlış bir kök neden varsayımına dayanıyordu.

## 2. Kanıt

### DB teşhisi (şifre maskeli)
```
# E2E'nin önceki turda bağlandığı DB (ana repo .env):
DATABASE_URL=postgresql://fabrika:***@localhost:5433/fabrika
$ psql … -d fabrika: select to_regclass('public._prisma_migrations'), to_regclass('public."Tenant"'), to_regclass('public.tenant'), to_regclass('public."FollowupDoc"'), to_regclass('public."DualApprovalStep"')
||||                                  ← hepsi NULL
$ select count(*) from pg_tables where schemaname='public'
0
$ select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at desc limit 10
ERROR:  relation "_prisma_migrations" does not exist
$ docker inspect fabrika-postgres → StartedAt 2026-10-02T07:41:24Z, volume fabrika_pgdata
```
`prisma migrate status` bu DB için anlamlı değil, çünkü proje prisma migrate klasörlerini kullanmıyor (76 girdinin 70'i düz `.sql`). Bu yüzden komutu çalıştırmadım. Yerine projenin kendi uygulayıcısının çıktısı:

### fonbridge_e2e hazırlığı
```
Datasource "db": PostgreSQL database "fonbridge_e2e", schema "public" at "localhost:5433"
🚀  Your database is now in sync with your Prisma schema. Done in 306ms
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
pass1 exit=0
pass2 exit=0
apply-migrations: 41 files applied as fabrika
✅ prisma/rls.sql applied. Policies in public: 28 → 112
Seeding completed with E10 data.
```

### Ön kontrol — negatif (boş fabrika DB'si), 3 sn
```
E2E_DATABASE_URL=<…/fabrika> E2E_PORT=3105 pnpm exec playwright test tests/e2e/notfound-status.spec.ts
exit=1 sec=3
Error: [e2e-gate] localhost:5433/fabrika has no schema (table "Tenant" missing). Prepare it with: pnpm exec prisma db push && pnpm db:rls-role && scripts/apply-migrations.sh && pnpm db:rls && pnpm db:seed
```

### TAM takım — `E2E_DATABASE_URL=<…/fonbridge_e2e> E2E_PORT=3105 pnpm exec playwright test`
```
[e2e-gate] Database: localhost:5433/fonbridge_e2e (schema + demo seed present)
  37 failed
  2 skipped
  4 did not run
  160 passed (11.9m)
exit=1 sec=712
$ grep -c "membership lookup failed" full.log
0
```
Toplam 203 (`playwright test --list` → `Total: 203 tests in 62 files`). Önceki turda bu ölçüm hiç yapılamamıştı (kurulum asılı kalıyordu).

### Kalan 37 kırmızı, köke göre

| # | Kök | Test sayısı | Spec'ler | Kanıt |
|---|---|---|---|---|
| A | **Spec'in ürettiği çerez için DB'de User+Membership satırı yok.** JWT callback her istekte üyeliği DB'den yeniden okuyor (d57f13f1, İNCELEME-59 Y-2) ve çerezdeki `tenantId`'yi siliyor, oturum tenantless kalıyor. Bu bir lookup *hatası* değil (bu yüzden log'da "lookup failed" yok), üyelik satırı sadece yok. | 27 | invoice-export-locale (6), invoice-export-real-record (3), invoice-foreign-currency-export (4), invoice-write-path (2), plan-storefront (6), plan-entitlement-from-version (1), identity-honesty (3), identity-strings (1), admin-documents-upload (1) | `Expected: 200 Received: 403`, route `{error:'no_tenant'}` (src/app/api/billing/invoices/[id]/export/route.ts:71); plan-storefront checkout `401`; spec'lerde `membership` geçmiyor (grep sayımı 0) |
| B | **M10 rol uyuşmazlığı:** spec'in üyelik rolü `approve_dual_approval` iznini taşımıyor | 4 | m10-dual-approval-persistence (2), m10-audit-identity (2) | `ForbiddenRoleError: Forbidden: this role cannot approve_dual_approval`; `Expected PENDING_LEGAL_APPROVAL, Received PENDING_FINANCE_APPROVAL` |
| C | **Ortam:** worktree'de `.env` yok, `AUTH_GOOGLE_ID` tanımsız → "Google ile Devam Et" butonu render edilmiyor | 3 | auth.spec (3) | `getByRole('button', { name: /Google ile Devam Et/ })` element not found |
| D | **Spec ile UI arasında kayma** (DB ile ilgili değil) | 3 | registration-consent (1), signin-error-messages (1), render-purity-refactor (1) | `locator('form') resolved to 2 elements` (disclosure formu eklenmiş); görünür `alert` sayısı 1 (beklenen 0); "Canlı veriler yükleniyor..." 30 sn boyunca görünür kaldı. Dev log'da 8× `SELF_SIGNED_CERT_IN_CHAIN` (dış fetch, yerel ağ/sertifika) var, render-purity'nin kökü olabilir, doğrulanmadı |

A ve B bu kartın DB blokajından bağımsız, ayrı fixture işleri. Sayıların toplamı: 27+4+3+3 = 37.

## 3. Değişen dosyalar
- `playwright.config.ts` (+9: `E2E_DATABASE_URL`)
- `tests/e2e/global-setup.ts` (yanlış tablolu fixture + /tmp log çıkarıldı → salt-okur DB ön kontrolü)
- `src/app/[locale]/admin/documents/page.tsx` (2b85166d öncesine geri döndü, girilemeyen dal)
- Test DB yönetimi (repoda değil): `fonbridge_e2e` veritabanı oluşturuldu. `pnpm db:rls-role` worktree'deki `.env` dosyasına `DATABASE_URL_RLS_TEST` ekledi (gitignored, commit'lenmedi).

## 4. Riskler
- `fabrika_app` rolü cluster genelinde tanımlı. `db:rls-role` rolü yeni bir parolayla oluşturdu, bu da paylaşımlı `fabrika` DB'si için de geçerli. Ana repo `.env`'deki `DATABASE_URL_RLS_TEST` parolası artık rolle eşleşmeyebilir. Rol daha önce **yoktu** (DB boştu), yani çalışan bir şey bozulmadı. Yine de paylaşımlı DB'yi yeniden kuran kişi `pnpm db:rls-role`'u tekrar koşmalı.
- `globalSetup`'taki "Dev server info: PID" satırı makinedeki **ilk** `next dev` sürecini seçiyor (başka ajanın sunucusu olabilir). Bu eski bir davranış, dokunmadım. Yalnız log satırını etkiliyor.
- Ön kontrol `demo-tenant`'ı arıyor. Seed'deki kimlik değişirse güncellenmesi gerekir (sabit `DEMO_TENANT_ID`).
- Geri alma: `git revert <bu commit>`. DB tarafı için `DROP DATABASE fonbridge_e2e` yeter (yalnız test verisi var, paylaşımlı DB'ye dokunulmadı). Bunu patron onayı olmadan yapmadım ve gerek de yok.

## 5. Açık sorular
- Paylaşımlı `fabrika` DB'si boş. Diğer ajanların dev sunucuları da şu an şemasız çalışıyor olmalı. Bu DB'yi CI sırasıyla doldurmak veri silmez ama ortak bir kaynağa yazmak demek, bu yüzden yapmadım. Kararı lider ya da patron vermeli.
- C (AUTH_GOOGLE_ID) CI'da da yok gibi görünüyor (ci.yml E2E env'inde tanımlı değil). auth.spec CI'da da kırmızı mı? Kontrol edilmeli.

## 6. Sonraki adım
- Yeni kart (öneri): A grubu için `tests/e2e/fixtures/` altında ortak bir `seedSessionUser(tenantId, role)` yardımcısı. User+Membership satırlarını kursun, membership yazımı `withSystemScope` ile olsun. Ardından 9 spec'i buna geçirmek 27 kırmızıyı kapatmalı. B için M10 spec'lerinde onaylayan rolün düzeltilmesi.
- Yerel koşu: `E2E_DATABASE_URL=postgresql://fabrika:<parola>@localhost:5433/fonbridge_e2e E2E_PORT=3105 pnpm exec playwright test`

## İzleme notu
Kalıcı bir alarm tanımlanmadı. Erken uyarıyı artık global-setup veriyor: şemasız ya da seed'siz DB'de koşu 3 sn içinde açık bir mesajla düşüyor.

## Platform beyanı
macOS (Darwin 27.0.0, yerel Docker `pgvector/pgvector:pg16`) üzerinde doğrulandı. Değişen kodda platforma bağlı yol yok: ön kontrol `pg` istemcisiyle SQL çalıştırıyor, config yalnız env okuyor. Linux'ta (CI ubuntu) aynı şekilde çalışır. CI `E2E_DATABASE_URL` tanımlamadığı için davranışı değişmiyor, ön kontrol CI'ın seed'li DB'sinde geçmeli. Windows'ta koşulamadı (makine yok). Eski `ps aux | grep` satırı zaten POSIX'e özgü ve try/catch dışında; bu tur ona dokunulmadı.
