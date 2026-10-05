# TASK-MUN3O7W748ZQH — se-fb — İNCELEME-36: M8 "Aday Bul"/"Davet Et" pilot kapısı (TASK-MUN39FIAKFY2R) + TASK-MUMIIUEGJ6N8B kapanışı

**Tarih:** 29.09.2026 · **Dal/HEAD:** dev @ ffadf5e1 · Kod değiştirilmedi.
**İncelenen:** fe-fb'nin `261c3b88` (B-1/B-2) ve `334b2fc7` (390 px taşma) commit'leri. Ek olarak be-fb'nin ikiz düzeltmesi `362ee353` (TASK-MUN3W76B4XEJE).
**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı: Darwin 27, Node 26.5, Next 16.3.4 (`next dev`), Docker `pgvector/pgvector:pg16`, Playwright ve sistem Chrome. Windows ve Linux **koşulamadı**, çünkü bu makinede yoklar. İncelenen kod yolu platforma bağlı değil: TS server action'lar, Prisma sorguları ve React istemci bileşenleri. Süreç, dosya yolu, kabuk ya da ekran/DPI kullanan bir parça yok. Bu yüzden diğer platformlarda davranışın aynı olmasını bekliyorum.

## Karar

| Kart | Karar | Gerekçe |
|---|---|---|
| **TASK-MUN39FIAKFY2R** (İNCELEME-30 B-1/B-2) | **ONAY** | B-1 ve B-2 kapandı. Kapanış hem canlı DB testinde hem gerçek tıklamada tr ve en için doğrulandı. Düzeltme öncesi kodda veri kaybı yeniden üretildi (2→0). 9 mutantın 9'u commit'li testlerce öldürüldü. 390 px iddiası ölçümle doğrulandı. Aşağıdaki Y-1 bu kartın açtığı bir açık değil, önceden vardı. Ayrı kart öneriyorum. |
| **TASK-MUMIIUEGJ6N8B** (hedef: "süresi dolmuş pilotta her yazma yolu pilot cümlesini söylesin") | **ONAY** | İNCELEME-30'daki DÜZELTME GEREKLİ kararının iki gerekçesi (B-1, B-2) ve sonradan bulunan konsorsiyum ikizi kapandı. Kalan 13 `readOnly` çağrısının 12'si çağrı zinciriyle birlikte okundu, hepsi salt okuma. 13.'sü bilinen ve kabul edilmiş istisna `updatePresenceHeartbeat` (İNCELEME-30 N-2). İNCELEME-30'dan beri eklenen `readOnly` yok, yalnız iki tane kaldırıldı. |

**İkiz hakkında düzeltme:** İNCELEME-30'da `scoreCandidatesForSeat` için "saf fonksiyon, yazma yok" yazmıştım. Bu **yanlıştı**: `src/lib/scoring/consortium.ts:170-173` önce `seatCandidate.deleteMany`, sonra `create` çağırıyor. Hatayı bu kartın kesilen ilk oturumunda fark ettim. be-fb aynı bulguyu TASK-MUN3W76B4XEJE'de `362ee353` ile düzeltti. Bu raporda onun kapanışını da bağımsız olarak doğruladım (§2.2, §2.4). Bu kez her `readOnly` çağrısının callee'lerini de okudum (§2.6).

## Bulgular

### Y-1 (DÜŞÜK, kiracı içi yetki ve veri bütünlüğü; önceden var, bu düzeltmeyle bulunması kolaylaştı): `assignCandidateToSeat` istemciden `status` ve `organizationId` kabul ediyor
- **Konum:** `src/modules/m8/server/actions.ts:49-115`. İmza şu: `assignCandidateToSeat(seatId, organizationId, status: 'CANDIDATE'|'INVITED'|'CONFIRMED', opportunityId)`. Action'da rol kontrolü yok (`requireTenantAction` yalnız oturum ve pilot kapısına bakıyor, `src/lib/tenant.ts:101-105`). `status` için izin listesi yok, `organizationId` doğrulanmıyor.
- **Neden şimdi görünür oldu:** Önceden "Davet Et", satır içi bir `'use server'` kapanışıydı: status `'INVITED'` ve org sunucunun hesapladığı adaydan geliyordu. `261c3b88` ile yeni istemci bileşeni `InviteCandidateButton` action'ı doğrudan import ediyor. Bu yüzden action ID'si (`78cde717…`) artık istemci paketinde duruyor.
- **Canlı kanıt:** İzole DB'de, pilot süresi dolmamış durumdaydı. **MEMBER** rolündeki bir fixture kullanıcısıyla giriş yaptım. Sonra `Next-Action: <id>` ile doğrudan POST gönderdim, gövde: `["demo-seat-opp1-research","SEFB36-FORGED-PIC","CONFIRMED","demo-opp-1"]`.
  - HEAD'de sonuç: `200`, koltuk `OPEN|null` → **`CONFIRMED|SEFB36-FORGED-PIC`**.
  - Düzeltme öncesi sayfada (`261c3b88^`) sonuç **aynı**: manifest `'use server'` modülünün tüm export'larını kaydediyor (`assignCandidateToSeat 78cde717ad`, satır içi action `$$RSC_SERVER_ACTION_0` ile yan yana). Yani açık fe-fb'nin işiyle gelmedi. Fark şu: önceden ID istemciye gönderilmiyordu, şimdi gönderiliyor.
- **Etki:** Kiracının en düşük rolündeki bir üye, herhangi bir koltuğu uydurma bir PIC ile `CONFIRMED` yapabiliyor ve davet→onay akışını atlıyor. UI'da `CONFIRMED` yazan başka yol yok. `CONFIRMED` koltuklar eşleştirmede kullanılıyor: tutulan ülkeler (`matching.ts:174`) ve rakip dışlama (`matching.ts:287`). Kiracılar arası etki yok, çünkü yazma `(id, opportunityId, tenantId)` ile sınırlı. Aynı sınıf konsorsiyum sayfasında da var: `assignSeat` herhangi bir `organizationId` ile `INVITED` yazıyor, ama `CONFIRMED` yazamıyor.
- **Düzeltme (ayrı kart):**
  1. İstemciye dar bir action açılsın, örneğin `inviteCandidate(seatId, opportunityId, candidateId)`. Status sunucuda `'INVITED'` olarak sabitlensin. `organizationId`, o koltuğun `SeatCandidate` satırından okunsun.
  2. `CONFIRMED` geçişi ayrı bir action'a alınsın ve rol kontrolü eklensin (en az `PIPELINE_MANAGER`).
  3. Test eklensin: MEMBER rolüyle `CONFIRMED` çağrısı reddedilmeli ve satır değişmemeli.
- Bu bulgu pilot kapısının konusu değil. Bu yüzden iki kartın ONAY kararını engellemiyor.

### N-1 (not, kapsam dışı ve önceden var): konsorsiyum sayfasında sabit İngilizce metin
- `pipeline/[id]/consortium/page.tsx:177` ("← Back to Pipeline"), `:182` ("Consortium Builder") ve `manager.tsx:259` ("Invite"). Bunlar tr sayfada İngilizce görünüyor (kare `head-tr-cons-after.png`). `c915bc43` (06.09) ile geldi. CLAUDE.md kural 8'e aykırı.

### Ö-1 (öneri, İNCELEME-30 Öneri 4 hâlâ açık): `readOnly` bekçisi
- `readOnly: true` taşıyan bir action'ın çağrı zincirinde Prisma yazması olmadığını kontrol eden statik ya da canlı bir bekçi hâlâ yok. Bu kartta iki kez görüldü ki elle okuma yanılabiliyor: ikiz, hem devop-fb'nin hem benim envanterimden kaçtı. Önerim, `pipeline-actions-pilot-digest` kalıbında `readOnly` işaretli her action için "süresi dolmuş pilotta satır anlık görüntüsü değişmez" canlı testi. `updatePresenceHeartbeat` açıkça istisna listesine yazılsın.

## 1. Ne yapıldı
1. **Kendi izole ortamım:** Temiz worktree `wt36` (dev @ ffadf5e1, `git status` boş). Kendi konteynerim `sefb-mun36` (`:55490/sefb36`). Kurulum sırası: `prisma db push` → `apply-migrations.sh` ×2 (34 dosya, rc=0/0) → `setup-rls-role` → `apply-rls` (28 → 112 politika). `fabrika_app` için `rolbypassrls = f`. Paylaşılan `fabrika` DB'sine ve `:3000`'e dokunulmadı. Worktree `.env`'inde `5433` sayısı 0. Model anahtarları `.env`'den çıkarıldı.
2. **Kendi canlı testim** (`sefb36-m8-pilot.live.test.ts`, commit'lenmedi, scratchpad'de): be-fb'nin kalıbıyla yazıldı. Pilot mock'lanmadı: gerçek `Subscription` satırı `fabrika_app` üzerinden okunuyor. Süresi dolmuş pilotta M8'in 5 yazma yolu denendi: `computeSeatCandidates`, `computeSeatCandidatesForm`, `assignCandidateToSeat`, konsorsiyum `findCandidates`/`assignSeat`/`addSeat`. Kontrol vakasında çalışan pilotta aynı çağrılar gerçekten yazıyor.
3. **Önce/sonra:** Aynı test düzeltme öncesi kodla (`362ee353^` ve `261c3b88^` dosyaları yalnız worktree'de) ve HEAD ile koşuldu.
4. **Gerçek tıklama:** Kendi `next dev -p 3361` sürecim izole DB'ye bağlandı. Kiracı `demo-tenant` pilota çevrildi (`public-team`, `pilot`, `TRIALING`, `trialEndsAt = now()-1dk`). Koltuk `demo-seat-opp1-research`'e iki satır eklendi. tr ve en için şu yollar denendi: M8 "Aday Bul", M8 "Davet Et", konsorsiyum "Aday Bul". Ardından canlı mutant ve geri alma koşuldu. Son olarak 390 px ölçümü yapıldı.
5. **Mutantlar:** 9 mutant uygulandı. Her biri için commit'li testler (27 test) ve benim canlı testim ayrı ayrı koşuldu.
6. **Envanter:** M8 yazma yolları (action, API, job, raw SQL) ve kalan 13 `readOnly` çağrısı callee'leriyle birlikte okundu. İNCELEME-30 commit'inden (`5daedf47`) bu yana eklenen ya da kaldırılan `readOnly` ve kapı satırları diff'ten çıkarıldı.
7. **Tam süit, tsc:** Yalnız izole DB'de koşuldu.

## 2. Kanıt

### 2.1 Erişilebilirlik
- M8 pilot planında var (`PILOT_PLAN_ID = 'public-team'`, `src/lib/billing/pilot.ts:45`). Konsorsiyum sayfası `moduleGate('M8')` sonrasında `ConsortiumManager`'ı pilot durumuna bakmadan çiziyor (`consortium/page.tsx:65,188`). "Aday Bul" düğmesi süresi dolmuş pilotta da görünür ve tıklanabilir (kare `mutant-tr-cons-before.png`).
- Action'lar istemciye açık. Dev manifestinde `findCandidates 404fef7a…`, `assignSeat 6080f318…` (konsorsiyum sayfası), `computeSeatCandidatesForm 60c81210…` ve `assignCandidateToSeat 78cde717…` (eşleştirme sayfası) kayıtlı.

### 2.2 Önce: bulgular gerçek (düzeltme öncesi kod, izole DB, canlı test)
```
## PRE-FIX consortium (362ee353^)
PROBE cons.find rows 2 -> 0
PROBE cons.find {"resolved":[]}
      Tests  1 failed | 4 passed (5)
## PRE-FIX m8 (261c3b88^)
PROBE m8.compute rows 2 -> 0
PROBE m8.compute {"resolved":[]}
PROBE m8.form {"status":"ok","count":0}
      Tests  2 failed | 3 passed (5)
```
Süresi dolmuş pilotta iki çağrı da reddedilmedi ve iki `SeatCandidate` satırını sildi. İzole DB'de CORDIS profili olmadığı için yerine yeni satır yazılmadı. Eski form "ok, 0 aday" diyordu, yani kullanıcı verinin silindiğini görmüyordu.

### 2.3 Sonra: HEAD (canlı test)
```
PROBE m8.compute PilotExpiredError
PROBE m8.form {"status":"error","code":"pilotExpired"}
PROBE cons.find PilotExpiredError
 ✓ M8 computeSeatCandidates: refused, rows unchanged
 ✓ M8 computeSeatCandidatesForm: code pilotExpired, rows unchanged
 ✓ M8 assignCandidateToSeat: refused, seat unchanged
 ✓ consortium findCandidates / assignSeat / addSeat: refused, rows unchanged
PROBE control.compute 2 -> 0
PROBE control.assign INVITED true
 ✓ control — running pilot: the same M8 calls DO write
      Tests  5 passed (5)
+ tests/consortium-find-candidates-pilot.live.test.ts → 7 passed (7) (ikisi birlikte)
```
Karşılaştırılan anlık görüntü, test kiracısının `SeatCandidate` ve `ConsortiumSeat` satırlarının tüm sütunlarıdır. Kontrol vakası aynı çağrının çalışan pilotta gerçekten sildiğini ve yazdığını gösteriyor. Yani "değişmedi" sonucu kapıdan geliyor, DB'ye hiç ulaşmayan bir yoldan değil.

### 2.4 Gerçek tıklama (izole DB, `:3361`, Playwright + sistem Chrome, hidrasyon sinyaliyle)
```
[head/tr] M8 before    sefb36_c1|1|2026-09-29 20:29:11.996 · sefb36_c2|2|2026-09-29 20:29:11.996
[head/tr] M8 find alert ["Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun."]
[head/tr] M8 after     sefb36_c1|1|2026-09-29 20:29:11.996 · sefb36_c2|2|2026-09-29 20:29:11.996
[head/tr] M8 invite alert [..."Pilot süresi doldu, düzenleme kapalı. ..."] seat OPEN|null
[head/tr] CONS alert  ["Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.",""]
[head/tr] CONS after  sefb36_c1|1|…20:29:11.996 · sefb36_c2|2|…20:29:11.996
[head/tr] pageerror []
[head/en] M8 find alert ["The pilot has ended, so editing is off. Ask your administrator to extend it."]
[head/en] M8 after     (aynı iki satır, aynı computedAt)
[head/en] M8 invite alert [..."The pilot has ended, ..."] seat OPEN|null
[head/en] CONS alert  ["The pilot has ended, so editing is off. Ask your administrator to extend it.",""]
[head/en] CONS after  (aynı iki satır, aynı computedAt)
[head/en] pageerror []

CANLI MUTANT (dev kopyasında konsorsiyum findCandidates'e readOnly: true geri):
[mutant/tr] CONS before sefb36_c1|1|… · sefb36_c2|2|…
[mutant/tr] CONS alert  []
[mutant/tr] CONS after  (0 satır)                     ← ikiz birebir; geri alındı
GERİ ALMA SONRASI (satırlar yeniden eklendi):
[reverted/tr] CONS alert ["Pilot süresi doldu, düzenleme kapalı. ...",""] · after = before

390 px (334b2fc7): {"scrollWidth":390,"clientWidth":390}
```
- Konsorsiyum uyarısındaki ikinci boş `role=alert` öğesi Next'in rota duyurucusu, bir hata değil.
- "Davet Et" satırındaki iki uyarı şundan: kart aynı anda "Aday Bul"un uyarısını da taşıyor.
- **Kareler** (`docs/agent-results/TASK-MUN3O7W748ZQH-se-fb/`): `head-tr-m8-1-before.png`, `head-tr-m8-2-find-after.png`, `head-tr-m8-3-invite-after.png`, `head-en-m8-3-invite-after.png`, `head-tr-cons-after.png`, `head-en-cons-after.png`, `mutant-tr-cons-before.png`, `mutant-tr-cons-after.png`, `mobile-390-matching.png`. Karelerde yalnız fixture verisi var (`sefb36-org-*`, demo fırsatı).

### 2.5 Mutantlar (commit'li 3 test dosyası = 27 test; ayrıca benim canlı testim)
```
BASE committed (0, 'Tests  27 passed (27)') · BASE mine (0, 'Tests  5 passed (5)')
M1 konsorsiyum findCandidates readOnly geri : committed rc=1 [3 failed] | mine rc=1 [1 failed]
M2 m8 computeSeatCandidates readOnly geri   : committed rc=1 [2 failed] | mine rc=1 [2 failed]
M3 form pilot kodunu düşürüyor              : committed rc=1 [1 failed] | mine rc=1 [1 failed]
M4 Davet Et hatayı yutuyor (setError(null)) : committed rc=1 [1 failed] | mine rc=0 (sunucu testi, beklenen)
M5 Aday Bul düğmesi kodu yok sayıyor        : committed rc=1 [1 failed] | mine rc=0 (beklenen)
M6 manager find catch'te refuse yok         : committed rc=1 [2 failed] | mine rc=0 (beklenen)
M7 konsorsiyum assignSeat readOnly          : committed rc=1 [1 failed] | mine rc=1 [1 failed]
M8 m8 assignCandidateToSeat readOnly        : committed rc=1 [1 failed] | mine rc=1 [1 failed]
M9 konsorsiyum addSeat readOnly             : committed rc=1 [1 failed] | mine rc=1 [1 failed]
```
Sonuç: 9 mutantın 9'u commit'li testlerce öldürüldü. Her mutanttan sonra dosya geri yazıldı, `git status` yalnız benim test dosyamı gösterdi.

### 2.6 Yazma yolu envanteri
- **M8'in tüm yazmaları:** `seatCandidate.deleteMany/create` yalnız iki yerde var: `matching.ts:313-318` ve `consortium.ts:170-173`. `consortiumSeat.create/updateMany` de yalnız iki yerde var: `consortium/actions.ts:34,101` ve `m8/server/actions.ts:107`. Bunlara ulaşan 5 action'ın 5'i de artık `requireTenantAction()` çağırıyor, yani kapalı başlıyor. `api/`, `workers/`, `scripts/` altında ve raw SQL ile bu tablolara yazan yol yok. `g0-compute.ts:338` yalnız okuyor. `Opportunity` silinince koltuklar cascade ile siliniyor, bu da pipeline action'larının kapısından geçiyor.
- **Kalan 13 `readOnly`:** calendar page, `getConflicts`→`detectConflicts` (yalnız `findMany`), evidence ×2, `getAssignableMembers`→`getWorkspaceMembers`, `listInviteCodes`/agency→`listInviteCodesIn`, m6 `listPanelScores`→`getPanelScoresForProposal`, m2 `exportToDocx`→`findAccessibleTemplate` + docx, m11 `getPartBData`→`loadPart`, `generateSectionDraftAi` (sabit şablon), lump-sum hesabı. Bunların hepsi salt okuma. Yazan tek çağrı m11 `updatePresenceHeartbeat`→`savePartContent`, bilinen istisna N-2.
- **`5daedf47..HEAD` diff'i:** Kapı satırlarında yalnız iki değişiklik var, ikisi de `-readOnly: true` → `+requireTenantAction()`. Davet kabul yolu kendi pilot kapısını taşıyor (`isInvitingTenantReadOnly`, `OAUTH_SIGNIN_ERROR.pilotExpired`).

### 2.7 Tam süit ve tsc (yalnız izole DB)
```
DATABASE_URL=postgresql://fabrika:***@localhost:55490/sefb36
DATABASE_URL_MIGRATE=postgresql://fabrika:***@localhost:55490/sefb36
DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:55490/sefb36
 Test Files  228 passed | 2 skipped (230)
      Tests  2677 passed | 8 skipped (2685)
vitest exit=0
isolated before/after: 1 fabrika-beta → 1 fabrika-beta
shared   before/after: 1 fabrika-beta → 1 fabrika-beta
tsc --noEmit → tc=0
```
- İlk koşuda 37 kırmızı vardı, hepsi agency canlı testlerindeydi: `permission denied for function agency_funnel_counts`. Neden bir ortam sırası hatasıydı: migrasyonlar `fabrika_app` rolü oluşmadan koştuğu için GRANT'ler uygulanmamıştı. Rol oluştuktan sonra `apply-migrations.sh` yeniden koşuldu (rc=0). İki dosya 31/31 geçti, tam süit yeşile döndü. Kod kaynaklı değil.
- Süit öncesi kendi test dosyamı ağaçtan çıkardım. Sayılar be-fb'nin koşusuyla (2677/0) aynı.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUN3O7W748ZQH-se-fb.md` (bu rapor) ve `docs/agent-results/TASK-MUN3O7W748ZQH-se-fb/` (9 kare).
- Kod değişikliği yok. Canlı testim ve tıklama betiklerim scratchpad'de kaldı, repoya girmedi: `sefb36-m8-pilot.live.test.ts`, `sefb36-click.mjs`, `mutclick.mjs`, `direct.mjs`, `mob.mjs`.
- Aynı oturumda ayrıca şunlar yapıldı: TASK-MUN3FWZWT11MX spike raporu commit'lendi (`ffadf5e1`, satır atfı `esr-parser.ts:71` olarak düzeltildi). `stop_reason` kartı TASK-MUN4GRM8RUXOB açıldı.

## 4. Riskler
- **Y-1 açık kalıyor.** Kiracının herhangi bir üyesi koltuk durumunu `CONFIRMED` yapabiliyor. Etki kiracı içiyle sınırlı. Ayrı kart açılmalı.
- **N-2 (`updatePresenceHeartbeat`) süresi dolmuş pilotta hâlâ `content` alanını yazıyor.** Kabul edilmiş bir istisna. Oku-değiştir-yaz yarışı riski ayrı bir konu.
- **Bekçi yok (Ö-1).** Yeni bir `readOnly` işareti yanlış konursa bunu yakalayan otomatik bir kontrol yok.

## 5. Açık sorular
- Y-1: `CONFIRMED` geçişini hangi rol yapabilmeli? Öneri: `PIPELINE_MANAGER` ve üstü. Bu bir ürün kararı.
- Sonuç dosyası yolu çelişkisi: Görev gövdesi `…/FONBRIDGE/docs/agent-results/TASK-MUN3O7W748ZQH-se-fb.md` diyor. Alttaki "KANIT ZORUNLU" satırı ise `/Users/macbook/alan/docs/agent-results/TASK-MUN2FLEUQI3MT-se-fb.md` diyor. Bu ikinci yol İNCELEME-30'un raporu ve repo dışında. Gövdedeki yola yazdım. İNCELEME-30 raporunun üzerine yazmadım.

## 6. Sonraki adım
1. Y-1 için ayrı kart açıldı: **TASK-MUN509G2ICKWI** (be-fb): dar `inviteCandidate` action'ı, rol kontrollü `confirmSeat` action'ı ve MEMBER ile `CONFIRMED` reddi testi.
2. Ö-1: `readOnly` bekçisi. Canlı anlık görüntü testi olarak yazılsın, `updatePresenceHeartbeat` istisna listesinde dursun.
3. N-1: konsorsiyum sayfasındaki sabit İngilizce metinler i18n'e alınsın (fe-fb, küçük iş).
