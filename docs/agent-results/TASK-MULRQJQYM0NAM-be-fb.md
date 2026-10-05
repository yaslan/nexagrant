# TASK-MULRQJQYM0NAM — FB KAMU B1: Toplu davet kodu + ajans↔kurum bağı (be-fb)

**Sprint:** FB-KAMU-2 · **Dal:** dev (push yok) · **Platform:** mac (Darwin 27.0.0), yerel docker Postgres `fabrika-postgres` (:5433)

## 1. Ne yapıldı

Kalkınma ajansı artık tek bir kodla bölgesindeki kurumlara ücretsiz Keşif hesabı dağıtabiliyor. Kodla açılan her kiracı ajansa bağlanıyor. Ajans bu bağ üzerinden kurumun içeriğini okuyamıyor; RLS düzeyinde de okuyamıyor.

- **Tasarım notu önce yazıldı, onaydan önce migration yazılmadı.** Not leed-fb'ye gönderildi, onay geldi (aşağıda alıntı). Onayın üç koşulu da uygulandı.
- **Şema** (`prisma/migrations/add-agency-invite-code.sql` + `.down.sql`, additive + idempotent):
  - `TenantKind` enum (`ORGANIZATION` varsayılan, `AGENCY`) → `Tenant.kind`. Mevcut 23 kiracı değişmeden `ORGANIZATION` oldu.
  - `Tenant.agencyId` (NULL, FK → Tenant, `ON DELETE SET NULL`, indeksli). Yalnız kayıtta yazılıyor.
  - `AgencyInviteCode`: `tenantId` (= ajans), `codeHash` (sha256, UNIQUE), `codeHint` (son 4), `label`, `maxUses` (>0), `usedCount` (`CHECK 0..maxUses`), `expiresAt`, `revokedAt/By`, `createdBy`, `createdAt`. ENABLE + FORCE RLS + `tenant_isolation`. `prisma/rls.sql` döngüsüne eklendi.
  - `public.redeem_agency_invite(code_hash)`: SECURITY DEFINER, `SET search_path = public, pg_temp`, `SET app.system_scope = 'on'`. Fonksiyon düzeyinde ayarlandığı için çıkışta, hata durumu dahil, çağıranın değerine geri dönüyor. Tek atomik `UPDATE … usedCount + 1 WHERE … usedCount < maxUses … RETURNING tenantId` çalıştırıyor. Yalnız ajans id'si ya da NULL döndürüyor.
  - `public.note_agency_invite_rejection(code_hash)`: reddedilen denemeyi `AuditEvent`'e yalnız sebeple yazıyor (`unknown / revoked / expired / exhausted / agency_inactive / lost_race`). Kod, hash ve kişi yazılmıyor. Kod bir ajansa aitse satır o ajansın altına, değilse `tenantId NULL` olarak düşüyor (leed koşulu 3).
  - EXECUTE yetkisi PUBLIC'ten alındı, yalnız `fabrika_app`'e verildi.
- **`src/lib/agency/`** (yeni):
  - `invite-code.ts`: `crypto.randomInt`, 12 karakter, 30 harflik alfabe (0/O/1/I/L/U yok, ≈58,9 bit), `XXXX-XXXX-XXXX` biçimi, normalize ve hash işlevleri.
  - `codes.ts`: `createInviteCodeIn` / `revokeInviteCodeIn` (idempotent) / `listInviteCodesIn` (hash'siz) / `redeemInviteCode` / `noteInviteRejection`.
  - `actions.ts`: minimal sunucu işlemleri. Oluşturma ve iptal `manage_users` istiyor, listeleme ajansın her üyesine açık, `setTenantKindAction` yalnız platform admin. Arayüz B2'de yapılacak.
  - `invite-signin-error.ts`: NextAuth `CredentialsSignin` alt sınıfı, `code='invite_invalid'`.
- **Kayıt akışı:**
  - `src/lib/auth.ts` `Credentials.authorize`: yalnız "user yok" dalına ve `credentials.inviteCode` alanına dokunuldu. se-fb'nin `bfe33cd7` commit'inin üstüne yapıldı, aynı hunk'a girilmedi. Kod `tenant.create`'ten önce aynı transaction'da kullanılıyor. Geçersizse transaction atılıyor, ret ayrı bağlantıda sayılıyor ve `InvalidInviteCodeSignin` fırlatılıyor. Bu kontrol dev ortamındaki demo yedeğinden ÖNCE yakalanıyor. Kod geçerliyse `agencyId` yazılıyor ve `agency.invite.redeemed` audit kaydı düşüyor. Abonelik yazılmıyor, kiracı `FALLBACK_PLAN_ID='free'` (Keşif) ile açılıyor.
  - `src/lib/actions/auth.ts`: kodu `signIn`'e geçiriyor. `invite_invalid` gelirse tek tip mesaj dönüyor: **"Davet kodu geçersiz ya da artık kullanılamıyor."**
  - `AuthCard.tsx`: `?kod=` gelince sayfa kayıt modunda açılıyor ve "Davet koduyla kayıt" bandı görünüyor. Kod varken Google/Microsoft butonları gizli (S2-a). Kod yalnız kayıt modunda gönderiliyor. Var olan kullanıcı giriş yaparsa kod yok sayılıyor.
- `docs/DATA_MODEL.md` §18 eklendi.

### leed-fb onayı (alıntı, olduğu gibi)

> leed-fb → be-fb (TASK-MULRQJQYM0NAM): B1 tasarımı ONAYLANDI. Seçimler: S1 = (a) sha256, kod yalnız üretimde bir kez gösterilir. S2 = (a) kod varken Google/Microsoft butonları gizlenir. S3 = (a) kolon adı AgencyInviteCode.tenantId.
>
> Onayın KOŞULLARI:
>
> 1. ÇAKIŞMA: se-fb şu an TASK-MULRTOTG9IKIM (Ö-4) kartında src/lib/auth.ts dosyasını değiştiriyor (satır ~170, secret/demo-google fallback'leri + docker-compose). Sen yalnız Credentials.authorize içindeki "user yok" dalına dokun. auth.ts değişikliğini EN SONA bırak. Ondan önce `git log --oneline -- src/lib/auth.ts` ile se-fb'nin commit'ini kontrol et; geldiyse onun üstüne çalış. Aynı hunk'a dokunacaksan dur ve bana yaz. Kodun geri kalanını (migration, src/lib/agency/, testler) hemen yazabilirsin.
> 2. redeem_agency_invite: SECURITY DEFINER fonksiyonuna `SET search_path = public, pg_temp` sabitlenmeli (search_path ele geçirme riski). system_scope'u önceki değere döndürme işi hata durumunda da çalışmalı (EXCEPTION bloğu ya da SET LOCAL ile transaction sonuna bağla). Bunu testte göster.
> 3. Oran sınırı yok: raporda risk olarak yaz. 59 bit tahmin edilemezlik yeterli, ama başarısız kod denemelerini AuditEvent'e sayı olarak yaz (kodu yazma). Böylece B2 panosunda izlenebilir.
>
> Geri kalan her şey (Tenant.kind enum, agencyId FK ON DELETE SET NULL, agencyId'ye dayalı çapraz okuma politikası olmaması, tek tip hata, transaction içinde redeem, idempotent migration + down, canlı testler) olduğu gibi onaylı. Raporda bu mesajı alıntıla.

Koşulların karşılanması:

1. auth.ts en son değiştirildi. `bfe33cd7` geldikten sonra onun üstüne çalışıldı, yalnız "user yok" dalına ve credentials alanına dokunuldu.
2. `search_path` sabit. Scope'un geri alınması fonksiyon `SET` cümlesiyle yapılıyor (PostgreSQL çıkışta, hata dahil, geri yüklüyor). Test: fonksiyonun içinde `lock_timeout` hatası tetikleniyor, ardından scope `'on'` değil ve çapraz okuma 0 satır.
3. Oran sınırı §4'te risk olarak yazıldı. Başarısız denemeler `AuditEvent`'e sayılıyor.

## 2. Kanıt

### Migration: önce/sonra sayımı, iki kez koşma

```
--- ÖNCE
 tenants: 23
--- KOŞU 1 … CREATE POLICY / CREATE FUNCTION / COMMENT / REVOKE / DO   exit=0
--- KOŞU 2 … (IF NOT EXISTS NOTICE'ları) …                             exit=0
--- SONRA
     kind     | count | linked
 ORGANIZATION |    23 |      0
 relrowsecurity | relforcerowsecurity →  t | t
           proname            | prosecdef |                      proconfig                      | app_exec | public_exec
 redeem_agency_invite         | t         | {"search_path=public, pg_temp",app.system_scope=on} | t        | f
 note_agency_invite_rejection | t         | {"search_path=public, pg_temp",app.system_scope=on} | t        | f
$ pnpm db:rls → ✅ prisma/rls.sql applied. Policies in public: 115 → 116
```

### Geri alma: şema kopyası geçici DB'de (paylaşımlı DB'ye dokunulmadı)

```
schema kopyalandı
down#1 exit=0
down#2 exit=0
after down: kind col=0  table=0  fn=0  enum=0
up#1 exit=0
up#2 exit=0
after up: cols=2  table=1  fn=2
geçici DB silindi
```

### Canlı testler: `fabrika_app` (NOBYPASSRLS, testin başında doğrulanıyor)

`tests/agency-invite.live.test.ts` + `src/lib/agency/invite-code.test.ts`, 3 kez üst üste yeşil:

```
✓ a valid code returns the agency, counts one use, and links the new tenant
✓ a use inside a transaction that rolls back is not counted
✓ the limit holds: maxUses successes, then NULL
✓ race for the last use: two connections, exactly one wins
✓ a burst of 12 parallel registrations on a 5-use code yields exactly 5
✓ a revoked code is refused; revoking twice is a no-op
✓ an expired code is refused
✓ a code of a tenant that is no longer an agency, or is deleted, is refused
✓ unknown and malformed codes are refused the same way
✓ only an agency can create codes
✓ after a normal call the caller scope is what it was
✓ after the function fails mid-call the scope is not left open
✓ agency scope: the linked org content is invisible and unwritable
✓ agency B neither sees nor revokes agency A codes
✓ the registrant cannot read codes either: no tenant scope, zero rows
✓ a spent code is filed under its agency, an unknown one under no tenant
(+ 5 kod üretici birim testi)
Test Files  2 passed (2)   Tests  21 passed (21)
```

**Mutasyon (testin gerçekten ısırdığını gösterir):** `Workspace`'e ajansa `agencyId` üzerinden okuma veren geçici bir politika eklendi (`mutation_agency_read`). Sonuç: `expected { byTenant: 1, byId: {…} } to deeply equal { byTenant: 0, byId: null }` → `1 failed`. Politika DROP edildi (`pg_policies` sayımı 0), ardından 16/16 yeşil.

### Gerçek tarayıcı (AgentSpace iç tarayıcısı, `localhost:3000`, gerçek yazma + tıklama)

Test ajansı `B1 Test Ajansı (OKA)` (kind AGENCY), kod `K8N7-VNVF-KNNN` (maxUses=1) `createInviteCodeIn` ile `fabrika_app` üzerinden üretildi.

1. `/tr/kayit?kod=K8N7-VNVF-KNNN`: kayıt modu, "Davet koduyla kayıt" bandı, sosyal butonlar yok → `TASK-MULRQJQYM0NAM-screenshots/01-kayit-kodlu-form.png`
2. E-posta `b1-belediye-1@example.org` yazıldı, onay kutusu işaretlendi, "Çalışma Alanı Oluştur" tıklandı → panel açıldı (`02-kayit-sonrasi-panel.png`). DB:

```
           email           |          tenant           |     kind     |         agencyId          |        agency        | agency_kind |            plan             |     role
 b1-belediye-1@example.org | cmuls9jy20001aexkybhzsxmn | ORGANIZATION | cmuls6zjs0000otxkzsder7vg | B1 Test Ajansı (OKA) | AGENCY      | (abonelik yok → free/Keşif) | TENANT_OWNER
 usedCount | maxUses →  1 | 1
 agency.invite.redeemed | {"agencyId": "cmuls6zjs0000otxkzsder7vg"}
```

3. Aynı (tükenmiş) kodla ikinci e-posta → ekranda "Davet kodu geçersiz ya da artık kullanılamıyor." (`03-tukenmis-kod-ret.png`). Hesap açılmadı (b1-belediye-% kullanıcı sayısı 1), sayaç 1/1'de kaldı, ajansın altına `agency.invite.rejected {"reason": "exhausted"}` yazıldı.
4. Bilinmeyen kod `ABCD-EFGH-JKMN` → aynı mesaj (`04-bilinmeyen-kod-ret.png`), hesap yok, `tenantId NULL` + `{"reason": "unknown"}`.

İlk tarayıcı denemesi başarısız oldu. Kök neden: `:3000` dev sunucusu (leed-fb'nin) 00:45:19'da açılmıştı, `prisma generate` ise 00:45:40'ta koştu. Sunucu eski Prisma istemcisini tuttuğu için `tenant.create({agencyId})` hata verdi ve dev ortamının demo yedeğine (`demo-user-mehmet`) düştü. DB'ye hiçbir şey yazılmadı. Aynı işlem taze süreçte doğru çalıştı. leed-fb sunucuyu yeniden başlattı, sonra yukarıdaki koşu yapıldı. Sahte demo oturumu kapatıldı.

### Kapılar

```
pnpm typecheck        → tsc --noEmit                                     EXIT 0
pnpm lint             → eslint                                           EXIT 0
pnpm test (.env yüklü)→ Test Files 175 passed | 2 skipped (177)
                        Tests 2038 passed | 8 skipped (2046)            EXIT 0
pnpm rls:check        → All 48 tenant-scoped models … ; CHECK 4b: every one carries ENABLE + FORCE + tenant_isolation   EXIT 0
pnpm rls:verify       → Ölçüm rolü fabrika_app; okuma (pozitif): AgencyInviteCode kendi kiracısı bağlamında 1 satır döndü;
                        ✅ 48 kiracıya özel tabloda … GERÇEKTEN ölçüldü   EXIT 0
pnpm rls:bypass-check → ✅ no new tenant bypass. 1 allowed, 24 sanctioned, 0 still owed   EXIT 0
pnpm i18n:check       → ✅ … no file gained hard-coded text              EXIT 0
```

`pnpm test` `.env` yüklenmeden koşulursa bu makinede 46 test kırmızı oluyor. Bu kartla ilgisi yok; aynı 46 hata TASK-MULR3TQ24ZZ7N-fe-fb raporunda da duruyor. Sebebi şu: `@/lib/db` singleton'ı `DATABASE_URL` yoksa `localhost:5432`'ye düşüyor. O portta 10 gündür başka bir projenin Postgres'i (`yuyt-postgres`) çalışıyor, bu yüzden "no database" atlaması yerine kimlik doğrulama hatası geliyor. `.env` ortama yüklenince 0 hata.

## 3. Değişen dosyalar

- `prisma/migrations/add-agency-invite-code.sql`, `prisma/migrations/add-agency-invite-code.down.sql` (yeni)
- `prisma/schema.prisma` (Tenant.kind/agencyId/ilişkiler, `TenantKind`, `AgencyInviteCode`)
- `prisma/rls.sql` (döngüye `AgencyInviteCode`)
- `src/lib/agency/invite-code.ts`, `invite-code.test.ts`, `codes.ts`, `actions.ts`, `invite-signin-error.ts` (yeni)
- `src/lib/auth.ts` (yalnız Credentials alanı + "user yok" dalı + catch başı)
- `src/lib/actions/auth.ts`, `src/app/[locale]/login/AuthCard.tsx`
- `tests/agency-invite.live.test.ts` (yeni)
- `docs/DATA_MODEL.md` §18, bu rapor + `TASK-MULRQJQYM0NAM-screenshots/`

## 4. Riskler

- **Oran sınırı yok** (leed koşulu 3). Kayıt ucunun önünde deneme sınırı bulunmuyor. Kod ≈58,9 bit olduğu için tahminle bulunamaz. Başarısız denemeler `agency.invite.rejected` olarak sayılıyor ama engellenmiyor. `tenantId NULL` `unknown` satırlarında ani artış bir tarama işaretidir. Gerçek bir sınır (IP/e-posta başına) ayrı bir kart olarak açılmalı.
- `AuditEvent`'te `tenantId NULL` satırlar `tenant_or_shared` gereği her kiracıya görünür. `unknown` ret satırları yalnız `{"reason":"unknown"}` taşıyor, kişisel veri yok. Yine de B2 panosu bu satırları ajansa göstermemeli; ajans yalnız kendi `tenantId`'li satırlarını görür.
- **Şema yenilendi.** Dal çekildikten sonra dev sunucusu mutlaka `pnpm db:generate`'ten SONRA başlatılmalı. Aksi halde kayıt, eski istemci yüzünden dev ortamında demo yedeğine düşer (bu oturumda ölçüldü). Prod'da demo yedeği yok, orada kayıt reddedilir.
- Geri alma migration'ı tüm kodları ve ajans bağlarını siler. Kurum hesapları ve verileri kalır.
- Uygulama yerelde `fabrika` (SUPERUSER) ile bağlanıyor, burada RLS etkisiz. İzolasyon iddiaları bu yüzden `fabrika_app` ile ölçüldü.

## 5. Açık sorular

- Oran sınırı kartı kimde olacak (be-fb / devop-fb)?
- Mevcut bir kiracıyı sonradan ajansa bağlama/koparma (B1 kapsamı dışında) gerekecek mi?
- Google/Microsoft ile kodlu kayıt (S2-b, onay çerezi kalıbı) ileride isteniyor mu?

## 6. Sonraki adım

- B2 (fe-fb): `listAgencyInviteCodesAction` / `createAgencyInviteCodeAction` (kod bir kez gösterilir) / `revokeAgencyInviteCodeAction` üstüne arayüz. Toplu sayılar için satır değil sayı döndüren SECURITY DEFINER fonksiyonlar gerekiyor (küçük hücre eşiği <5, bkz. ec9406c4).
- B12 (cs-fb): kodlu kayıt bandına KVKK metni. Bant `data-testid="invite-code-banner"`.
- OKA'yı AGENCY yapmak için `setTenantKindAction` (platform admin).

**Platform beyanı:** Doğrulama mac (Darwin 27.0.0) üzerinde yapıldı: yerel docker Postgres + Next dev + AgentSpace iç tarayıcısı. Değişen kod platforma bağlı değil: SQL, Node `crypto`, NextAuth ve React; süreç, dosya yolu ya da kabuk kullanılmıyor. Windows/Linux'ta aynı davranış beklenir. O platformlarda koşu yapılamadı, çünkü bu makinede yalnız macOS var. CI (Linux) `pnpm test`'i `DATABASE_URL` ile koşar; canlı testler DB yoksa kendini atlar.
