# TASK-MUN2AMIFGBQ90 — FB İNCELEME-29: TASK-MUMT3KVHJTYX0 (se-fb) sır sütunları istemciye gitmiyor

**İnceleyen:** crw-fb · **Sprint:** FB-KAMU-2 · **Dal:** dev · **Tarih:** 29.09.2026
**İncelenen commit'ler:** `e05ca5b9`, `8caeda56`, `90233c4d`, `c9133933`, `84003f29` (rapor)
**İncelenen HEAD:** `7bb11e85` (temiz worktree, `--detach`). `c9133933..HEAD` arasında incelenen dosyalara dokunan tek commit `fc763927`. O commit `api/invitations/route.ts`'e dokunuyor ve upsert'teki `select` korunmuş.
**Sıra:** TASK-MUN26P5IDKGST incelemesi bitmişti (`docs/agent-results/TASK-MUN26P5IDKGST-crw-fb.md`), bu inceleme ondan sonra başladı.

## Karar: **DÜZELTME GEREKLİ** (küçük)

Bugün tarayıcıya giden bir sır **yok**. Envanter tam, dört yüzeyin canlı prod build yanıtı temiz. Ancak düzenlemeyi kalıcı kılması beklenen iki bekçide boşluk var ve bu boşluklar gerçek mutantlarla kanıtlandı:

- **B-1:** İlişki include'u nesne argümanıyla yazılırsa statik bekçiden geçiyor.
- **B-2:** İzin listesindeki tek istisnayı hiçbir kapı korumuyor: statik bekçi, prop testi ve tsc'nin üçü de o satırın silinmesini kaçırıyor.

İkisi de birkaç satırlık test düzeltmesi. Ürün kodunda değişiklik gerekmiyor.

## Bulgular (önem sırasıyla)

### B-1 — Nesne argümanlı ilişki include'u bekçiden geçiyor · Orta (regresyon bekçisi)
`tests/secret-model-select-guard.test.ts:159` yalnız `applicationParts: true` biçimini arıyor (`\b(rel)\s*:\s*true\b`). Prisma'da en sık yazılan biçimler ise şunlar:
```ts
tx.opportunity.findFirst({ where: { id }, include: { applicationParts: { orderBy: { createdAt: 'asc' } } } })
tx.user.findUnique({ where: { id }, include: { accounts: { where: { provider: 'google' } } } })
```
Bu çağrıların ikisi de sır sütunları dahil bütün satırları döndürür. Bekçi ikisinde de `offences=0` veriyor (bkz. Kanıt §3, E1/E2). se-fb raporu "İlişki yoluyla gelen … include'lar da yakalanır" diyor. Bu iddia yalnız `: true` biçimi için doğru.
**Düzeltme:** `SECRET_RELATIONS` için `\b(rel)\s*:\s*\{` eşleşmesini de ara. Eşleşen nesneyi `callArgument` ile al ve `hasTopLevelKey(obj, 'select')` yoksa ihlal say. E1, E2 ve E11 fixture olarak eklensin.

### B-2 — İzin listesindeki başvuru sayfası hiçbir kapıyla korunmuyor · Orta
`opportunities/[id]/application/page.tsx:28` `include: { applicationParts: true }` ile okuyor. `magicTokenHash` sayfaya yalnız 36. satırdaki destructure (`({ magicTokenHash, ...part })`) sayesinde gitmiyor. Bu destructure'ı sildim (MU3), `part.magicTokenHash`'i yalnız `hasPortalLink` için okudum ve sonucu `<ApplicationClient>` prop'una verdim:
- statik bekçi ✓ geçti (satır izin listesinde),
- `secret-model-props` ✓ geçti (bu sayfayı hiç render etmiyor),
- `tsc --noEmit` exit 0 (`part as unknown as ApplicationPartItem` dökümü tipi susturuyor).

Sonuçta `partA.magicTokenHash` RSC payload'ına girerdi ve hiçbir kapı bunu fark etmezdi. İzin listesi yorumu, bu satırın güvenliğini sağlayan kodu gösteriyor ama o kodu doğrulayan bir test yok.
**Düzeltme** (iki yoldan biri):
- (a) Okumayı `select`'e çevir. Bu durumda izin listesi boşalır ve istisna ortadan kalkar. En sade yol bu.
- (b) `secret-model-props`'a bu sayfa için bir test ekle: `opportunity.findFirst` sahte istemcisi `applicationParts` içinde sentinel hash döndürsün, `<ApplicationClient>` prop'larında `expectNoSecrets` çalışsın.

### Ö-1 — `select`'in değeri denetlenmiyor, yalnız anahtarın varlığı · Düşük-Orta
`select: undefined` ve `select: full ? undefined : { id: true }` biçimleri bekçiden geçiyor (E6/E7). Prisma `select: undefined`'ı "select yok" sayar ve bütün satırı döndürür. `select: { id: true, accessToken: true }` de geçiyor (E8). se-fb bu durumu "bilinçli seçim" olarak raporda belirtmiş. Öneri: `select:`'in hemen ardından `{` ya da `*_SELECT` adlı bir sabit gelmesini zorunlu kıl. Asıl güvence runtime prop testi; bu yüzden bu bulgu bloke etmiyor.

### Ö-2 — Erişim biçimi kaçışları · Düşük
Şu biçimlerin hepsi `offences=0` veriyor:
- köşeli parantezle erişim: `tx['calendarConnection'].findMany(...)` (E3),
- takma adla erişim: `const cc = tx.calendarConnection; cc.findMany(...)` (E4),
- ham SQL: `$queryRaw` (E5),
- opsiyonel zincir: `tx.calendarConnection?.findMany` (E9),
- `aggregate({ _max: { accessToken: true } })` (E10).

Bunların repoda karşılığı yok (grep ile doğrulandı). Olasılıkları düşük. MU2 bu kaçışların ilkinin runtime testine takıldığını gösteriyor. Öneri: bekçi yorumuna "runtime prop testi tamamlar" notunu ve bu listeyi yazmak.

### Ö-3 — Kapsam: route dosyası olmayan server component'ler ve `src/lib` yardımcıları · Düşük (se-fb raporunda zaten belirtilmiş)
Bekçi yalnız `page|layout|…|route` dosyalarını ve `'use server'` modüllerini tarıyor. `src/app/**/_components/*.tsx` gibi bir async server component ya da tam satır döndüren bir `src/lib` yardımcısı client'a prop verirse bekçi bunu görmez. Bugün bu kalıpla sır modeli okuyan bir dosya yok (envanter §1). se-fb'nin "Sonraki adım" maddesiyle aynı; yeni bir iş gerektirmiyor.

### K-1 — `/tr/<ws>/ayarlar/takvim` 404 (kapsam dışı)
`src/lib/routes.ts:121` TR için `ayarlar/takvim` üretiyor, ama `next.config.ts:138`'de yalnız `api-anahtarlari` rewrite'ı var. `getWorkspaceRoute('settingsCalendar', …)` çağıran olmadığı için bugün hiçbir link bu adrese gitmiyor. Canlı ölçümde `/tr/main/ayarlar/takvim` 404, `/tr/main/settings/calendar` 200 döndü. Bu karta ait bir kusur değil, not olarak yazıldı.

## Kanıt

### 1. Envanter — `prisma/schema.prisma` (74 model) → sır taşıyan sütunlar ve her okuma yeri

| Model.sütun | `src/` okuma yerleri (test hariç) | Sonuç |
|---|---|---|
| CalendarConnection.accessToken/refreshToken | `settings/calendar/page.tsx:39` (select ✓), `m9/server/calendar-actions.ts:33,91,100` (select ✓), `lib/calendar/sync.ts:92` (select yok; sunucu içi, token'ı çözmek için gerekli, fonksiyon `void` dönüyor), `sync.ts:63,134` update (dönüş kullanılmıyor), `users-scheduled-deletion.ts:138` deleteMany | istemciye gitmiyor |
| Account.access_token/refresh_token/id_token | `actions/user/export-data.ts:89` (select: provider,type,createdAt), `lib/auth.ts:555` (select: userId), PrismaAdapter (`strategy: "jwt"`) | gitmiyor |
| Session.sessionToken, VerificationToken.token | `src/` içinde doğrudan okuma yok | — |
| ApiKey.keyHash | `settings/api-keys/page.tsx:41` (select ✓), `api-keys/actions.ts:59` create (select ✓), `:89` deleteMany, `lib/api-auth.ts:48` (select yok; sunucu içi, id/tenantId/name döndürüyor) | gitmiyor |
| Invitation.tokenHash | `api/invitations/route.ts:112` (select id), `:124` upsert (select ✓, `fc763927` sonrası da), `billing/seat-limit.ts:55` count; `InvitationRow` tipi tokenHash'i dışarıda bırakıyor | gitmiyor |
| ApplicationPart.magicTokenHash | `m11/server/actions.ts:61,84` (`PART_ROW_SELECT`), `:585` (select'te hash var, sunucu içi karşılaştırma, `{success}` dönüyor), `portal/partner/[token]/page.tsx:45,95` (select'te hash var, client component yok, inline action yalnız `token`/`locale` yakalıyor), `api/documents/export/route.ts:54` (select content,opportunityId), `partner-link.ts:27` updateMany, **`application/page.tsx:28` relation include + destructure (B-2)** | bugün gitmiyor |
| AgencyInviteCode.codeHash | `lib/agency/codes.ts:156` create (select ✓), `:205` list (select ✓), `:188` updateMany | gitmiyor |
| İlişki alanları | `Tenant.invitations`, `Tenant.agencyInviteCodes`, `User.accounts`, `User.sessions`, `Opportunity.applicationParts`. `src/` içinde yalnız `applicationParts: true` kullanılıyor (B-2) | — |
| Diğer adaylar | Ham SQL ile bu tablolara erişim yok (`"CalendarConnection"` vb. grep: 0). E-fatura kimlik bilgileri env'den okunuyor, DB'de değil (`efatura-integrator.ts`). `Tenant.settings` JSON'una sır yazan kod yok. Webhook secret'ı DB'de yok | — |

Sonuç: se-fb'nin taraması eksiksiz. Select'siz okunup client component'e, API JSON'una ya da server action dönüşüne giden bir yer kalmadı.

### 2. Mutantlar (temiz worktree, her birinden sonra `git checkout --`)

```
## MU1 calendar page select'ine accessToken eklendi
     × calendar settings page: <CalendarClient> props carry no OAuth token
      Tests  1 failed | 17 passed (18)        ← bekçi kaçırdı (Ö-1), prop testi yakaladı
## MU2 tx['calendarConnection'].findMany, select silindi
-    tx.calendarConnection.findMany({
+    tx['calendarConnection'].findMany({
-      select: { id: true, provider: true, isConnected: true, lastSyncAt: true },
     × calendar settings page: <CalendarClient> props carry no OAuth token
      Tests  1 failed | 17 passed (18)        ← bekçi kaçırdı (Ö-2), prop testi yakaladı
## MU3 application page: destructure kaldırıldı, magicTokenHash prop'a gidiyor
-  const parts: ApplicationPartItem[] = opp.applicationParts.map(({ magicTokenHash, ...part }) => ({
+  const parts: ApplicationPartItem[] = opp.applicationParts.map((part) => ({
-    hasPortalLink: magicTokenHash !== null,
+    hasPortalLink: part.magicTokenHash !== null,
      Tests  18 passed (18)                   ← ikisi de kaçırdı (B-2)
tsc_exit=0                                    ← tsc de kaçırdı
```
Geri yüklenmiş hal: `Test Files 3 passed (3) · Tests 33 passed (33)` (guard + props + m9-calendar-connect).

### 3. Statik bekçi kaçış deneyleri (`findOffences`, test dosyasından import edildi)

```
E1 relation include with args, no select: offences=0
E2 relation include with where: offences=0
E3 bracket accessor: offences=0
E4 aliased delegate: offences=0
E5 raw SQL: offences=0
E6 select: undefined: offences=0
E7 conditional select: offences=0
E8 select naming the secret: offences=0
E9 optional-chained op: offences=0
E10 aggregate of secret: offences=0
E11 relation select with nested include: offences=0
      Tests  11 failed | 14 passed (25)   (14 = bekçinin kendi testleri, hepsi yeşil)
```
Kaynak: `scratchpad/crw-escape.test.ts` (repoya eklenmedi).
Spread ile dönüş ve server action dönüşü: bekçi dönüş değerine hiç bakmıyor, yalnız okuma çağrısına bakıyor. Server action dönüşünü runtime prop testi koruyor (generateApiKey, M11 ×3). `connectCalendar` dönüşünü `m9-calendar-connect` testindeki select assert'i koruyor.

### 4. Canlı doğrulama — kendi prod build'im (`:3000` kapalıydı, `.next`'ine dokunulmadı)

- Worktree `scratchpad/wt-crw29` @ `7bb11e85`, `prisma generate` + `next build` → `build_exit=0`, i18n kontrolü geçti.
- `DEMO_LOGIN_ENABLED=false next start -p 3117`; `lsof cwd` = kendi worktree'm.
- Oturum: alice (`demo-user-alice` / demo-tenant) için `.env`'deki AUTH_SECRET ile `next-auth/jwt encode` → `authjs.session-token` çerezi.
- Test verisi: tek id'li üç satır (`crwfb-probe-cal`, `crwfb-probe-key`, `crwfb-probe-part`). Sentinel değerler `CRWFBPROBE_*`. Parça hash'i, bilinen bir ham token'ın SHA-256'sı.

```
cal    html 200 text/html  bytes=147991 | accessToken=0 refreshToken=0 keyHash=0 magicTokenHash=0 tokenHash=0 CRWFBPROBE=0 hashhex=0 | 1 crwfb-probe-cal
cal    rsc  200 text/x-component bytes=121070 | accessToken=0 refreshToken=0 keyHash=0 magicTokenHash=0 tokenHash=0 CRWFBPROBE=0 hashhex=0 | 1 crwfb-probe-cal
keys   html 200 text/html  bytes=152356 | accessToken=0 … keyHash=0 … CRWFBPROBE=0 hashhex=0 | 1 crwfb-probe-key
keys   rsc  200 text/x-component bytes=120719 | … keyHash=0 … CRWFBPROBE=0 | 1 crwfb-probe-key
portal html 200 text/html  bytes=138198 | … magicTokenHash=0 … hashhex=0   (sayfa parçayı buldu: "District renovation pilot — İzmir")
portal rsc  200 text/x-component bytes=120928 | … magicTokenHash=0 … hashhex=0
"connections":[{"id":"crwfb-probe-cal","provider":"google","isConnected":true,"lastSyncAt":null}]
{"id":"crwfb-probe-key","name":"crwfb probe","prefix":"fp_live_crwf","lastUsedAt":null,"createdAt":"$D2026-09-29T19:31:42.548Z"}
```
Prob id'lerinin yanıtta görünmesi, ölçümün boş bir sayfada yapılmadığını gösteriyor. RSC için `RSC: 1` + `-L` kullanıldı. Next 16 ilk istekte `?_rsc` ile 307 döndürüyor; yönlendirme izlenince yanıt 200 ve `text/x-component`.
Başvuru sayfası (B-2) canlı ölçülemedi: demo-tenant'ta M11 `OFF` ve sayfa `moduleGate` kilidini döndürüyor. Ortak DB'deki modül bayrağını çevirmek başka ajanların testlerini etkileyeceği için çevirmedim. B-2'nin kanıtı MU3.

Temizlik (her silme tek id ile yapıldı; id boşsa ya da `crwfb-probe-` ile başlamıyorsa betik silmiyor):
```
BEGIN DELETE 1 COMMIT  <- CalendarConnection
BEGIN DELETE 1 COMMIT  <- ApiKey
BEGIN DELETE 1 COMMIT  <- ApplicationPart
remaining=0 ; CalendarConnection toplam=1 (başlangıçtaki değer)
```
Sunucu: yalnız kendi PID'im durduruldu (cwd kontrolüyle), exit 143, `:3117` dinleyicisi 0. Tam süit koşulmadı (ayrı DB kurulmadı). Yalnız mock'lu hedefli testler koşuldu.

## Değişen dosyalar
- Yalnız bu rapor. Kod değiştirilmedi.

## Riskler
- B-1 ve B-2 bugün bir sızıntı değil. Ancak kartın asıl ürünü olan regresyon bekçisini en olası iki regresyon biçimine karşı kör bırakıyorlar: ilişki include'una `orderBy`/`where` eklemek ve destructure'ı "sadeleştirmek".
- Canlı ölçüm prod build'de yapıldı, ama M11 kilidi yüzünden başvuru sayfası kapsanamadı.

## Açık sorular
- Görev metninin sarmalayıcı bloğu sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUMT3KVHJTYX0-se-fb.md`'ye yazmamı istiyor. Bu yol hem repo dışında hem de incelenen ajanın raporunun adı; oraya yazmak se-fb'nin raporunu ezerdi. Gövdedeki SONUÇ DOSYASI satırı esas alındı: bu dosya.
- B-2 için (a) mı (b) mi? Öneri (a): `select`'e geçilirse izin listesi tamamen kalkar.

## Sonraki adım
- se-fb (ya da be-fb): B-1 regex/fixture genişletmesi ve B-2 (a) ya da (b). Ardından MU3 ve E1/E2 yeniden koşulup kırmızı görülmeli.
- Ö-1/Ö-2: bekçi yorumuna sınır listesi eklensin (isteğe bağlı).

## Platform
- **Doğrulandığı yer:** macOS (Darwin 27.0.0, Node 26, Next 16 prod build, Docker Postgres `fabrika-postgres`), curl/grep.
- İncelenen kod platformdan bağımsız: Prisma `select`/`include` semantiği, RSC serileştirmesi, statik tarayıcı. Bekçi yolları `path.sep` → `/` ile normalleştiriyor, bu yüzden Windows'ta kapsam aynı kalır.
- Windows ve Linux **koşulamadı**, çünkü bu makinede yalnız mac var. Koddan bakınca aynı sonuç beklenir.
