# TASK-MUMT3KVHJTYX0 — FB takvim token sızıntısı (İNCELEME-23 Ö-2) + sır taşıyan modellerin taraması

**Ajan:** se-fb (Güvenlik Mühendisi) · **Sprint:** FB-KAMU-2 · **Dal:** dev · **Tarih:** 29.09.2026
**Commit'ler:** `e05ca5b9`, `8caeda56`, `90233c4d`, `c9133933`

## 1. Ne yapıldı

1. **Ö-2 kapatıldı.** `settings/calendar/page.tsx` artık `CalendarConnection` satırlarını
   `select: { id, provider, isConnected, lastSyncAt }` ile okuyor. `<CalendarClient>` bu dört alandan
   fazlasını zaten kullanmıyordu. `accessToken` ve `refreshToken` artık RSC payload'ına girmiyor.
2. **Sır taşıyan modellerin repo taraması.** Taranan modeller: CalendarConnection, Account, Session,
   VerificationToken, ApiKey, Invitation, ApplicationPart, AgencyInviteCode. `src/` altında bu
   modellere yapılan 30 çağrının her biri tek tek okundu. Sonuç tablosu aşağıda (§2.1). Sızan iki
   yol daha bulundu ve düzeltildi (F-2, F-3). Sızıntı olmayan ama `select`'siz yapılan iki okuma da
   daraltıldı (F-4).
3. **Testler ve bekçi:**
   - `tests/secret-model-props.test.tsx` (çalışma zamanı): sahte Prisma istemcisi `select`'i
     Prisma gibi uygular ve satırlarda sentinel sırlar taşır. Test şunları doğrular:
     `<CalendarClient>` ve `<ApiKeysClient>` prop'larında, `generateApiKey` dönüşünde ve M11
     `addBudgetLine`/`addWorkPackage`/`createApplicationPart` dönüşlerinde sır kolonu ya da
     sentinel değer yok.
   - `tests/secret-model-select-guard.test.ts` (statik): kapsam, `src/app` altındaki route-segment
     dosyaları (page/layout/template/default/route/not-found/error) ve her `'use server'`
     modülüdür. Bu dosyalarda sır modellerinin satır döndüren işlemleri (`find*`, `create`,
     `update`, `upsert`, `delete`, `*AndReturn`) üst seviyede `select` olmadan yapılamaz. İlişki
     yoluyla gelen `applicationParts: true` gibi include'lar da yakalanır. İzin listesinde tek bir
     gerekçeli satır var. Dedektörün kendisi 12 sabit örnekle (fixture) test ediliyor: çok satırlı
     çağrı, yalnız iç içe `select`, argümanın değişkende olması, parantez içeren string ve
     `*Many` yazımları.
   - `tests/m9-calendar-connect.test.ts`: birebir argüman bekleyen iki assert'e yeni `select`
     eklendi. Testler gevşetilmedi, daha sıkı hale geldi.
4. **Canlı kanıt (:3000):** Test bağlantısı oluşturuldu, önce düzeltilmiş kodla, sonra düzeltme
   geri alınmış mutantla HTML ve RSC yanıtları grep'lendi. Ardından bağlantı tek id ile silindi.

## 2. Kanıt

### 2.1 Tarama sonucu (sır modeli okumaları, `src/`, test hariç)

| # | Konum | Durum öncesi | Tarayıcıya gidiyor muydu? | İşlem |
|---|---|---|---|---|
| F-1 | `settings/calendar/page.tsx:33` `calendarConnection.findMany` | select yok | **Evet**: RSC prop'u, `accessToken`/`refreshToken` | select eklendi (`e05ca5b9`) |
| F-2a | `settings/api-keys/page.tsx:41` `apiKey.findMany` | select yok | **Evet**: `<ApiKeysClient apiKeys>`, `keyHash` + `tenantId` | select eklendi |
| F-2b | `settings/api-keys/actions.ts:52` `generateApiKey` → `apiKey.create` | tam satır döndürülüyordu | **Evet**: server action yanıtı, `keyHash` + `tenantId` | select eklendi, dönüş tipi `ApiKeyView` |
| F-3 | `m11/server/actions.ts` `loadPart` (findFirst) ve `createApplicationPart` (create) | select yok, `ApplicationPartRow = ApplicationPart` | **Evet**: `addBudgetLine`/`addWorkPackage`/`createApplicationPart` yanıtı, `magicTokenHash` | `PART_ROW_SELECT`, `ApplicationPartRow = Omit<…,'magicTokenHash'>` |
| F-4a | `portal/partner/[token]/page.tsx` ×2 `findUnique` + `include: { opportunity: true }` | select yok | Hayır (client component yok, hash yalnız sunucuda karşılaştırılıyor) | Daraltıldı: `select` ile yalnız kullanılan alanlar + `opportunity.title` |
| F-4b | `m9/server/calendar-actions.ts` ×3 (disconnect findUnique, connect findUnique/create) | select yok | Hayır (dönüş zaten 3 alan) | `select` eklendi (least-privilege) |
| — | `opportunities/[id]/application/page.tsx:28` `include: { applicationParts: true }` | — | Hayır: `magicTokenHash` destructure ile atılıyor, yalnız `hasPortalLink` gidiyor | Gerekçeli izin listesi (bekçide tek satır) |
| — | `actions/user/export-data.ts` account, `api/invitations/route.ts` invitation, `lib/agency/codes.ts` list, `m11 addBudgetLineByToken`, `api/documents/export` | select var | Hayır | — |
| — | `lib/api-auth.ts` apiKey.findUnique, `lib/calendar/sync.ts` findMany/update | select yok | Hayır: kütüphane, sunucu içi. api-auth yalnız id/tenantId/name döndürüyor, sync token'ı çözmek zorunda | Kapsam dışı (bekçi yorumunda belirtildi) |
| — | Session, VerificationToken | — | `src/` içinde doğrudan okuma yok (NextAuth `strategy: "jwt"`) | — |

### 2.2 Canlı :3000 yanıtı (kimlik: alice@fabrika.test, demo-tenant; temiz worktree `next dev -p 3000`, HEAD `90233c4d`)

Test satırı `sefb-probe-ee6783baa8f2` (google). Token alanlarında sentinel değer vardı
(`SEFBPROBE_…`, raporda maskelendi).

```
== FIXED (HEAD 90233c4d)
HTML  status=200 bytes=153357
  html: accessToken=0 refreshToken=0 SEFBPROBE=0 probeRowId=1
RSC status=200 bytes=123813 type=text/x-component
rsc: accessToken=0 refreshToken=0 SEFBPROBE=0 probeRowId=1
"connections":[{"id":"sefb-probe-ee6783baa8f2","provider":"google","isConnected":true,"lastSyncAt":null}]

== MUTANT (select satırı yalnız izole worktree'de silindi)
MUTANT html: accessToken=1 refreshToken=1 SEFBPROBE=2
MUTANT rsc: accessToken=1 refreshToken=1 SEFBPROBE=2
"connections":[{"id":"sefb-probe-ee6783baa8f2","tenantId":"demo-tenant","userId":"demo-user-alice","provider":"google","externalId":null,"accessToken":"SEFBPROBE_***(masked)","refreshToken":"SEFBPROBE_***(masked)",…}]

== RESTORED
RESTORED rsc: accessToken=0 SEFBPROBE=0
```

`probeRowId=1` şunu gösteriyor: satır sayfaya geliyor, yani ölçüm boş bir sayfada yapılmadı.
Mutant sonucu da eski kodun token'ları gerçekten tarayıcıya gönderdiğini kanıtlıyor.

API keys sayfası (aynı oturum, gerçek satır):
```
RSC status=200
keyHash=0 tenantId_in_apiKeys=0
"apiKeys":[{"id":"cmtrl4yp…","name":"Test Partners API","prefix":"***","lastUsedAt":…,"createdAt":…}]
```

Temizlik (tek id ile yapıldı; id boş ya da `sefb-probe-` ile başlamıyorsa betik silmeyi reddediyor, rowCount≠1 ise rollback yapıyor):
```
deleted rows: 1
remaining sefb-probe rows (tenant-visible): 0
```
Ardından dev sunucusu durduruldu (yalnız kendi başlattığım süreç), :3000 boşaldı ve worktree silindi.

### 2.3 Mutant koşusu (paylaşılan ağaçta, her mutanttan sonra dosya yedekten geri yüklendi)

| Mutant | Bekçi | Prop testi |
|---|---|---|
| calendar page `select` silindi | × | × `calendar settings page: <CalendarClient> props carry no OAuth token` |
| api-keys page `select` silindi | × | × `API keys page: <ApiKeysClient> props carry no key hash` |
| `generateApiKey` `select` silindi | × | × `generateApiKey returns the raw key once, but never its hash` |
| m11 `loadPart` `select` silindi | × | × `M11 part actions return no portal-token hash` (`expected … not to contain '"magicTokenHash"'`) |
| geri yüklendi | ✓ | ✓ `Tests 18 passed (18)` |

Sonuç: 4/4 mutant yakalandı.

### 2.4 Kapılar

Son HEAD `c9133933` ile temiz worktree'de koşuldu (devop-fb'nin `5ed2261a` jobs geçişi dahil):
```
tsc_exit=0   (error TS: 0)
build_exit=0 ✓ Compiled successfully
lint_exit=0  (pnpm lint = eslint, tüm repo)
Test Files 5 passed (5) · Tests 73 passed (73)
  secret-model-props, secret-model-select-guard, m9-calendar-connect, modules/api-keys, modules/m11
```
Paylaşılan ağaçta ek hedefli koşu:
```
tests/m9-calendar-connect, modules/m9, modules/api-keys, modules/m11, secret-model-props,
secret-model-select-guard, src/lib/billing/pilot-gates → Test Files 7 passed · Tests 84 passed
tests/pilot-expired-write-paths.test.tsx + tests/m9-calendar-tenant-scope.live.test.ts → 2 passed · 10 passed
```
`m9-calendar-tenant-scope.live` gerçek Prisma üzerinde `disconnectCalendar`'ın yeni
`select: { tenantId, userId }`'si ile çalıştığını gösteriyor (3/3). Tam süit **koşulmadı**
(talimat gereği).

## 3. Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx`: select (Ö-2)
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/page.tsx`: select
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts`: create select, `ApiKeyView` dönüş tipi
- `src/modules/m11/types.ts`: `ApplicationPartRow = Omit<ApplicationPart, 'magicTokenHash'>`
- `src/modules/m11/server/actions.ts`: `PART_ROW_SELECT` (loadPart + create)
- `src/modules/m9/server/calendar-actions.ts`: 3 select
- `src/app/[locale]/portal/partner/[token]/page.tsx`: include yerine select (×2)
- `tests/secret-model-props.test.tsx` (yeni), `tests/secret-model-select-guard.test.ts` (yeni), `tests/m9-calendar-connect.test.ts`
- Bu rapor

Paralel ajanların dosyalarına dokunulmadı. `api-keys/actions.ts`'de be-fb'nin değişikliği
düzenlemeden önce zaten commit'lenmişti (`52cf762b`) ve dosya temizdi, yani ezilen bir değişiklik
yok. Portal sayfasında fe-fb benden 29 sn önce commit attı (`46d4c378`). Benim commit'imin bu
dosyadaki diff'i yalnız iki `select` hunk'ı; `git show 8caeda56 -- …/page.tsx` ile doğrulandı.

## 4. Riskler

- **Önem dereceleri:**
  - F-1 **Orta**, uykuda. Bugün token kolonları boş, çünkü Google OAuth yazıcısı yok. Ancak kolon
    yorumu "Plaintext" diyor; OAuth açıldığı gün XSS olmadan bile her sayfa yüklemesinde tarayıcıya
    token gidecekti.
  - F-2 ve F-3 **Düşük**. Sızan değer ham sır değil, yüksek entropili bir token'ın SHA-256'sı:
    tersine çevrilemez ve kimlik bilgisi olarak sunulamaz, çünkü sunucu sunulan değeri yeniden
    hash'liyor. Yine de doğrulayıcı istemciye çıkmamalı. Kapatıldı.
- **Bekçinin sınırı:** Bekçi `select`'in *varlığını* denetliyor, içeriğini denetlemiyor. Bilinçli
  olarak sır kolonu seçen bir okuma, örneğin portalın sunucu içi hash karşılaştırması, bekçiden
  geçer. Kütüphane yardımcıları (`src/lib/**`) kapsam dışı. Bir page, `lib`'deki tam satır döndüren
  bir yardımcıyı çağırıp sonucu client'a verirse bekçi bunu yakalamaz; bu durumu runtime prop testi
  kalıbıyla genişletmek gerekir.
- **Paylaşılan node_modules:** İlk `pnpm -s vitest` çağrısı pnpm 11'in otomatik install'unu
  tetikledi ve o anki çalışma ağacındaki `package.json`'a (devop-fb'nin henüz commit'lenmemiş
  Inngest kaldırması) göre `inngest`'i kaldırdı. Bu değişiklik daha sonra `5ed2261a` ile
  commit'lendi, dolayısıyla sonuç tutarlı. Sonraki koşularda `./node_modules/.bin/*` doğrudan
  kullanıldı.

## 5. Açık sorular

- `settings/api-keys/page.tsx` boş durumda `demoApiKeys()` ile iki uydurma anahtar satırı
  gösteriyor ("ERP Entegrasyonu & B2B Pipeline", `fp_live_9b4e72`). Bu bir sır sızıntısı değil,
  ama CLAUDE.md'deki "kendi verisinden ayırt edilemeyen uydurma veri" kuralına aykırı görünüyor.
  fe-fb/be-fb kartı olarak açılmalı mı?
- `CalendarConnection` şema yorumu (K-1, İNCELEME-23) hâlâ "Plaintext" diyor; kart kapsamı dışında
  bırakıldı.

## 6. Sonraki adım

- Google OAuth kartının (ROADMAP #12) ön koşullarından "select daraltma + test" bu kartla
  karşılandı. Token'ların şifreli yazılması ön koşulu hâlâ açık.
- Bekçi kapsamını `src/lib` yardımcılarının dönüş tiplerine genişletmek ayrı bir kart olabilir
  (düşük öncelik).

## Platform beyanı

Doğrulama **macOS** üzerinde yapıldı (Darwin 27.0.0, Node 26.5.0, Next 16.3.4, pnpm 11.25.0):
typecheck, lint, vitest, temiz worktree'de `pnpm build`, :3000 curl/grep. Değişen kod yolları
(Prisma `select`, RSC prop serileştirmesi, server action dönüş değeri) platformdan bağımsız;
süreç, dosya yolu, kabuk ya da ikili adına bağlı bir dal yok. Bu yüzden Windows ve Linux'ta davranış
aynıdır. Statik bekçi dosya yollarını `path.sep` → `/` ile normalleştiriyor, dolayısıyla Windows'ta
da aynı kapsamı tarar. Windows ve Linux'ta ayrıca **koşulmadı**, çünkü elimde bu platformlarda
makine yok.
