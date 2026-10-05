# İNCELEME-48 — TASK-MUN509G2ICKWI (se-fb) M8 koltuk durumu sahteleme düzeltmesi — crw-fb

**İncelenen:** `1e98fdfb` (dev; HEAD `0ac5fba3` içinde, sonrasında M8/konsorsiyum dosyalarına dokunan commit yok) · **Kaynak:** İNCELEME-36 Y-1 (`TASK-MUN3O7W748ZQH-se-fb.md`) · **Yazar raporu:** `TASK-MUN509G2ICKWI-se-fb.md`

**Platform beyanı:** macOS (darwin, Apple Silicon) üzerinde doğrulandı: temiz worktree, izole DB, Chrome. Değişen kod yalnız sunucu action'ları, Prisma sorguları ve React bileşenleri. İçinde dosya yolu, süreç, kabuk ya da ekran bağımlılığı yok, bu yüzden Windows ve Linux'ta da aynı davranış beklenir (koddan). O platformlarda koşulamadı, çünkü ofiste yalnız bu mac makinesi var.

## Karar: **ONAY**

Bloke eden bulgu yok. Y-1'in üç yolu da kapandı ve bunu bağımsız olarak doğruladım:

- MEMBER artık `CONFIRMED` yazamıyor.
- Uydurma ya da başka kiracıya ait org koltuğa bağlanamıyor.
- Onaylı koltuk ezilemiyor.

Rol kuralı sunucuda. Pilot kapısı ve id guard'ları yerinde. Kendi 8 mutantımın 6'sı kırmızı. Hayatta kalan 2 mutant aşağıda Ö-1 ve Ö-3'te. Tam süit izole DB'de yeşil. Aşağıdaki maddeler öneri ve not; merge'i engellemiyor.

## Bulgular (önem sırasıyla)

| # | Tür | Özet |
|---|---|---|
| Ö-1 | Öneri (test boşluğu) | Canlı testler yalnız `fabrika_app` (RLS) ile koşuyor. Uygulama ise `DATABASE_URL` = `fabrika` (SUPERUSER + BYPASSRLS) ile bağlanıyor. Bu yüzden uygulama katmanındaki `tenantId` filtresini silen mutant X7 hayatta kalıyor. |
| Ö-2 | Öneri (ürün kararı) | Davet her rolde açık, GUEST_PARTNER dahil. Herhangi bir üye, `INVITED` koltuktaki org'u başka bir adayla değiştirebiliyor (canlı: `INVITED\|ORG-A → INVITED\|ORG-B`). |
| Ö-3 | Öneri (test boşluğu) | `DECLINED` koltuğa yeniden davet hiçbir testte sabitlenmemiş. X8 mutantı hayatta kalıyor. |
| N-1 | Not (UX, yazarın N-2'si) | Reddedilen davet iki sayfada da sessiz kalıyor. Onaylı koltukta "Davet Et" tıklanınca ekranda hiçbir şey olmuyor. |
| N-2 | Not (önceden var) | Onaydaki çağrı-çakışma kontrolü okuyup sonra yazıyor, serileştirilmemiş. İki kardeş fırsatta eşzamanlı onay aynı org'u ikisinde de onaylayabilir. Onay UI'sı olmadığı için şu an tetiklenmiyor. |
| N-3 | Not (yazarın N-1'i, teyit) | `addSeat`: `roleKey` ve `required` istemciden serbest geliyor ve rol kontrolü yok. Durum ya da org yazmadığı için Y-1 sınıfından değil. |

### Ö-1: testler RLS katmanına yaslanıyor, uygulama o katmanı kullanmıyor
- **Kanıt:** `.env.example:26` şöyle diyor: "the app itself still connects as DATABASE_URL". `docker-compose.yml:30,57` de `postgresql://fabrika:…` kullanıyor. Bu rol `rolsuper=t, rolbypassrls=t`, yani çalışan uygulamada RLS filtre uygulamıyor. `tests/seat-assignment-authz.live.test.ts` ise her action'ı `withTenantOn(fabrika_app)` üzerinden koşuyor.
- **Mutant X7:** `confirmSeatAssignment` çakışma sorgusundan (`src/modules/m8/server/actions.ts:124-136`) `tenantId` satırı silindi. Sonuç: `rc=0, 90 passed`. Gerçek uygulamada bu mutant iki şeye yol açar. Başka bir kiracıda aynı org o çağrıda `CONFIRMED` ise onay reddedilir. Hata mesajı da o kiracının fırsat başlığını sızdırır (`…(${conflict.opportunity.title})`). Koddaki yorum tam olarak bu sızıntıya karşı uyarıyor, ama hiçbir test bunu tutmuyor.
- **Bugünkü kod doğru.** Bu bir regresyon kalkanı eksiği. Mantık yazarın notuna göre "aynen taşındı", ama bu commit onun artık tek çağıranı.
- **X3** (aday aramasından `tenantId` çıkarıldı) da hayatta kaldı. Bunu eşdeğer sayıyorum: `updateMany` koltuğu `(id, tenantId)` ile sınırlıyor, bir koltuğun `SeatCandidate` satırları da yalnız onun kiracısında yazılıyor (`matching.ts:313-318`, `scoring/consortium.ts:170-173`).
- **Öneri:** Başka kiracının onaylı koltuğu için bir çakışma testi eklenmeli. Test ya BYPASSRLS'li admin istemciyle koşmalı ya da `findFirst` argümanında `tenantId` bulunduğunu doğrulamalı.

### Ö-2: davet rolü ve INVITED değiştirme
- `inviteSeatCandidate` rol sormuyor. Yazar bunu riskler bölümünde açıkça yazmış. Oysa aynı dosya ağacında `declareApplication` (`pipeline/actions.ts:671`) GUEST_PARTNER'ı açıkça dışlıyor. Misafir ortak eşleştirme sayfasına erişebiliyorsa konsorsiyum davetini değiştirebilir.
- Canlı kanıt (§2.3 satır `2b`): MEMBER `dave@`, `INVITED|CRWFB48-ORG-A` koltuğuna listedeki ORG-B'yi gönderdi. Sonuç `INVITED|CRWFB48-ORG-B`. Kiracı dışına taşmıyor ve `CONFIRMED` üretmiyor, bu yüzden Y-1 kapsamı dışında.
- **Öneri:** Davet için `edit_proposal` (WRITER+) gibi bir eşik konmalı. Bu bir ürün kararı; yazarın açık sorusu 2 ile aynı.

### Ö-3: DECLINED yeniden davet sabitlenmemiş
- X8 mutantı `INVITABLE_SEAT_STATUSES`'tan `DECLINED`'ı çıkarıyor. Sonuç: `rc=0, 90 passed`. Hangi davranış istenirse istensin, bir testle sabitlenmeli.

## 1. Ne yapıldı
1. **Temiz ortam kuruldu.** `git worktree add --detach …/wt48 dev`, sonra `pnpm install --frozen-lockfile --offline`. `git status` boş.
2. **İzole DB kuruldu.** `fabrika-postgres` içinde `crwfb48` açıldı. Sıra: `prisma migrate diff --from-empty` şeması → `apply-migrations.sh` ×2 (35 + 35, idempotent) → `db:rls` (28 → 112 politika) → `db:rls-role` → `prisma generate` → `db:seed`. Paylaşılan `fabrika` DB'sine hiç dokunmadım.
3. **Kod satır satır okundu:** `seat-transitions.ts`, `m8/server/actions.ts`, konsorsiyum `actions.ts`/`manager.tsx`/`page.tsx`, `invite-candidate-button.tsx`, `rbac.ts`, `tenant.ts`.
4. **Yazma yolları tarandı** (`/usr/bin/grep`): `ConsortiumSeat` ve `SeatCandidate` yazan tüm `src` yolları (§2.5).
5. **Yazarın hedefli testleri** yeniden koşuldu. Ardından kendi 8 mutantım koşuldu.
6. **Gerçek tıklama** kendi `next dev -p 3348`'imde yapıldı, izole DB'ye karşı. :3000 kapalıydı (`curl` → `000`), paylaşılan sunucuyu başlatmadım. Test verisi tek id ile kuruldu ve silindi.
7. **Kapılar** kontrol edildi (tsc, lint, i18n) ve tam süit izole DB'de koşuldu.

## 2. Kanıt

### 2.1 Rol matrisi: sunucu kuralı (`src/lib/rbac.ts` + `seat-transitions.ts`)
Görevdeki OWNER/ADMIN/MEMBER/VIEWER, repodaki `TENANT_OWNER/TENANT_ADMIN/…/MEMBER/GUEST_PARTNER` rollerine karşılık geliyor (`VIEWER` rolü yok, en düşük rol GUEST_PARTNER).

| Rol | Davet (`INVITED`, yalnız listedeki aday, onaylı koltuk hariç) | Onay (`INVITED → CONFIRMED`, `manage_approvals`) |
|---|---|---|
| TENANT_OWNER | ✅ | ✅ |
| TENANT_ADMIN | ✅ | ✅ |
| PIPELINE_MANAGER | ✅ | ✅ |
| WRITER | ✅ | ❌ (test + X1) |
| MEMBER | ✅ | ❌ (test + X1/X2/X6, canlı) |
| GUEST_PARTNER | ✅ (Ö-2) | ❌ (test + X6) |
| rol yok / tanımsız | ✅ (`tenantScopeOf` rolü `'MEMBER'` varsayıyor) | ❌ (`asRole` → null) |

Durum geçişleri sunucuda. Status istemciden hiç alınmıyor, onaylanan org koltuktan okunuyor.

### 2.2 Testler ve mutantlar (izole DB `crwfb48`, `fabrika_app` NOBYPASSRLS)
```
yazarın 4 dosyası (authz.live + pilot ×2 + missing-id.live):  Test Files 4 passed (4)  Tests 90 passed (90)

X1 onay izni request_dual_approval (MEMBER'da var): rc=1 Tests 2 failed | 88 passed (90)
    × MEMBER cannot confirm, and the seat stays INVITED
    × WRITER cannot confirm, and the seat stays INVITED
X2 rol yoksa/MEMBER ise onay serbest:            rc=1 Tests 1 failed | 89 passed (90)
X3 aday aramasında tenantId yok:                  rc=0 Tests 90 passed (90)   ← eşdeğer (Ö-1)
   (ilk koşuda bileşen testi 5004 ms zaman aşımı verdi; tek başına yeniden koşuda 90/90 → flake)
X4 davet: CONFIRMED davet edilebilir durumlarda:  rc=1 Tests 2 failed | 88 passed (90)
    × does not overwrite a confirmed seat (×2)
X5 konsorsiyum assignSeat hep success:true:       rc=1 Tests 4 failed | 86 passed (90)
X6 onayda rol kontrolü kaldırıldı:                rc=1 Tests 4 failed | 86 passed (90)
    × MEMBER / WRITER / GUEST_PARTNER cannot confirm …
X7 onay çakışma sorgusunda tenantId yok:          rc=0 Tests 90 passed (90)   ← hayatta (Ö-1)
X8 DECLINED davet edilemez:                       rc=0 Tests 90 passed (90)   ← hayatta (Ö-3)
git status: clean
```
Toplam: 8 mutantın 6'sı kırmızı. 1'i eşdeğer (X3). 2'si test boşluğu (X7, X8). Yazarın 15 mutantı (13 kırmızı + 2 eşdeğer) bunlardan ayrı.

### 2.3 Gerçek tıklama ve doğrudan POST (Chrome, `next dev -p 3348`, izole DB)
Fixture: `ConsortiumSeat` `crwfb48-seat` (demo-opp-1, `dissemination`, OPEN) ve iki `SeatCandidate` (`CRWFB48-ORG-A`/`-B`). `dave@` = MEMBER, `alice@` = PIPELINE_MANAGER. Sunucu `.env`'deki `DATABASE_URL` = `fabrika` (BYPASSRLS) ile koştu. Yani bu çıktılar yalnız **uygulama katmanı** kurallarını ölçüyor.
```
login dave@fabrika.test 200 role= MEMBER tenant= demo-tenant
1 before: OPEN|null | buttons in seat: 2
1 after real click (MEMBER): INVITED|CRWFB48-ORG-A | action 708363a27598 body ["crwfb48-seat","CRWFB48-ORG-A","demo-opp-1"]
2 MEMBER forged PIC → 500 … | row INVITED|CRWFB48-ORG-A | demo seat CONFIRMED|null
2 MEMBER other seat candidate (demo seat) → 500 … | row INVITED|CRWFB48-ORG-A | demo seat CONFIRMED|null
2 MEMBER legacy 4-arg CONFIRMED + listed org → 500 … | row INVITED|CRWFB48-ORG-A
2 MEMBER legacy 4-arg CONFIRMED + forged → 500 … | row INVITED|CRWFB48-ORG-A
2b MEMBER re-invite listed ORG-B → 200 … | row INVITED|CRWFB48-ORG-B          ← Ö-2
3 MEMBER click ORG-B over CONFIRMED|ORG-A: requests 1 | row CONFIRMED|CRWFB48-ORG-A | alert: []   ← N-1 (sessiz)

konsorsiyum assignSeat (action id manifest'ten: 608d3c61…):
dave@fabrika.test  assignSeat forged PIC → 200 "success":false | row OPEN|null
dave@fabrika.test  assignSeat listed ORG-A → 200 "success":true | row INVITED|CRWFB48-ORG-A
dave@fabrika.test  assignSeat listed ORG-B over CONFIRMED|ORG-A → 200 "success":false | row CONFIRMED|CRWFB48-ORG-A
alice@fabrika.test (en, 390 px) aynı üç çağrı → false / true / false, satırlar aynı
alice@fabrika.test page width [ 390, 390 ]
```
- `server-reference-manifest.json` içinde `inviteCandidateToSeat`, `assignSeat` ve `addSeat` kayıtlı. `confirmSeatAssignment` ve eski `assignCandidateToSeat` **kayıtlı değil**, dolayısıyla istemciden erişilemiyor.
- Konsorsiyum sayfasındaki "Invite" düğmesine gerçek tıklama yapılamadı. Sebep: aday çekmecesi yalnız "Aday Bul" ile açılıyor. Bu işlem adayları yeniden hesaplıyor (fixture'ı silerdi), izole DB'de de CORDIS verisi olmadığı için boş dönüyor. Aynı action'ı gerçek oturum çereziyle, sayfanın içinden POST ettim (yukarıda).
- Kareler: `docs/agent-results/TASK-MUN509G2ICKWI-crw-fb-inceleme48/`
  - `1-member-before.png`: OPEN
  - `2-member-invited.png`
  - `3-member-over-confirmed.png`: tıklamadan sonra "Durum: ONAYLANDI" kalıyor, uyarı yok
  - `5-consortium-alice-390.png`
- **Temizlik:** Tek bir `DO` bloğunda silindi; `ROW_COUNT` kontrolü aday için 2, koltuk için 1. Sonrasında `crwfb48%`/`CRWFB48%` sayısı `0`. Demo koltukları `demo-seat-opp*` başladığı gibi `CONFIRMED|null`. Kendi dev sunucumu (pid 34092 ve çocukları) kapattım, `zz-*.mjs` betiklerini sildim.

### 2.4 Kapılar (temiz worktree, `dev` = `0ac5fba3`)
```
tsc=0
lint=0
i18n:check → ✅ i18n check passed … rc=0
tam vitest (izole DB crwfb48), 1. koşu: Test Files 1 failed | 239 passed | 2 skipped (242) · Tests 1 failed | 2813 passed
   FAIL tests/agency-invite.live.test.ts > … after the function fails mid-call the scope is not left open
   → dosya tek başına iki kez: Tests 18 passed (18) ×2 (M8 ile ilgisiz; paralel yük flake'i)
tam vitest, 2. koşu: Test Files 240 passed | 2 skipped (242) · Tests 2814 passed | 8 skipped (2822)
```
Build'i yeniden koşmadım. Bu commit build girdisine yeni bir şey eklemiyor, yazar da temiz ortamda `rc=0` raporlamış.

### 2.5 Aynı kalıpta kalan action taraması (M8 + `pipeline/[id]/consortium`)
```
src/app/…/consortium/actions.ts:35   consortiumSeat.create      ← addSeat (N-3; status sabit OPEN, org yok)
src/lib/scoring/consortium.ts:170-173 seatCandidate.deleteMany/create  ← sunucunun hesapladığı aday
src/modules/m8/server/matching.ts:313-318 seatCandidate.deleteMany/create ← aynı
src/modules/m8/server/actions.ts:144 consortiumSeat.updateMany  ← confirmSeatAssignment
src/modules/m8/server/seat-transitions.ts:61 consortiumSeat.updateMany ← inviteSeatCandidate (iki çağıran)
```
İstemciden durum ya da org alan başka bir yol yok. `src/app/api` altında koltuk yazan bir rota da yok.

### 2.6 Pilot kapısı ve id guard'ları
- `inviteCandidateToSeat`, `confirmSeatAssignment` ve `assignSeat` yazma modunda `requireTenantAction()` çağırıyor, `readOnly` kullanan yok.
- `isPresentId` üç katmanda var: action, helper ve `organizationId`.
- `pilot-expired-write-paths` ve `action-missing-id.live` yeşil (§2.2).
- Onayda sıra şöyle: rol kontrolü, ardından id guard. Rolü olmayan biri id sorgulayamıyor.

## 3. Değişen dosyalar (bu inceleme)
- `docs/agent-results/TASK-MUN509G2ICKWI-crw-fb-inceleme48.md` (bu rapor)
- `docs/agent-results/TASK-MUN509G2ICKWI-crw-fb-inceleme48/*.png` (4 kare)

Kod değiştirilmedi.

## 4. Riskler
- Ö-1: Uygulama BYPASSRLS rolüyle koştuğu sürece "RLS ikinci katman" yalnız testte var. Kiracı sızıntısı regresyonları bu dosyadaki testlerle yakalanmaz.
- Ö-2: Misafir ortak ya da herhangi bir üye, yönetici onaylamadan önce davetli org'u değiştirebilir. Onay UI'sı yazılınca yönetici, gördüğünden farklı bir org'u onaylayabilir. Onay action'ı org'u o anki koltuktan okuyor, UI da o anki durumu göstermeli.

## 5. Açık sorular
1. Davet için rol eşiği konacak mı (Ö-2)? Ürün kararı; yazarın açık sorusu 2 ile aynı.
2. `DECLINED` bir org yeniden davet edilebilmeli mi (Ö-3)?
3. **Sonuç dosyası yolu çelişkisi:** Görev gövdesi `…/FONBRIDGE/docs/agent-results/TASK-MUN509G2ICKWI-crw-fb-inceleme48.md` diyor. Alttaki "KANIT ZORUNLU" satırı ise `/Users/macbook/alan/docs/agent-results/TASK-MUN509G2ICKWI-se-fb.md` diyor. İkincisi yazarın rapor adı ve repo dışında. Gövdedeki yola yazdım, se-fb raporunun üzerine yazmadım.

## 6. Sonraki adım
- Merge engeli yok. Bu kart kapatılabilir.
- Küçük bir test kartı öneriyorum (se-fb): Ö-1 için çapraz kiracı çakışma testi (BYPASSRLS istemci ya da `where` argümanı doğrulaması) ve Ö-3 için DECLINED davranışının sabitlenmesi.
- Ürün kararı sonrası (Ö-2): davet rol eşiği ve N-1 sessiz reddin mesajı. Bunlar tek bir fe/be kartında ele alınabilir.
