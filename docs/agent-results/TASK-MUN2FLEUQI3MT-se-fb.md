# TASK-MUN2FLEUQI3MT — FB İNCELEME-30 · se-fb

İncelenen iş: TASK-MUMT3HQI1ILAR (fe-fb). Commit'ler `ac7d734b`, `85b2ea60`, `de1d245a`, `46d4c378`, `337db996`, `fc3ad84e`, `fd38f5cb`. Bu iş, ilk teslim TASK-MUMIIUEGJ6N8B'yi (`0b93f2ed`) tamamlıyor. Bulguların kaynağı devop-fb'nin İNCELEME-24 raporu (B-1…B-3, N-1).

## Karar

| Kart | Karar | Gerekçe |
|---|---|---|
| **TASK-MUMT3HQI1ILAR** (İNCELEME-24 düzeltmeleri) | **ONAY** | B-1, B-2, B-3 ve N-1 kapandı. Kapanış hem kodda hem canlı ekranda doğrulandı. 7 mutantın 7'si öldü. Aşağıdaki iki bulgu bu kartın listesinde yoktu: devop-fb de, fe-fb de kaçırdı. |
| **TASK-MUMIIUEGJ6N8B** (hedef: "süresi dolmuş pilotta her yazma yolu pilot cümlesini söylesin") | **DÜZELTME GEREKLİ** | Hedef tam karşılanmadı. M8 eşleştirme sayfasında bir yazma yolu kapıdan geçiyor ama pilot cümlesini düşürüyor (B-2). Ayrıca bir yazma yolu kapıyı hiç çalıştırmıyor (B-1). B-1 fe-fb'nin kodu değil, pilot kapısını getiren `a6b22241` (TASK-MUMABL78X5JLX) ile geldi. |

Kod değiştirilmedi. Paylaşılan DB'de yalnız kendi test kiracım ve kullanıcım oluşturuldu, iş bitince tek id ile silindi.

## Bulgular

### B-1 (ORTA, sunucu kapısı / veri bütünlüğü): M8 "Aday Bul" süresi dolmuş pilotta veri siliyor ve yeniden yazıyor
- **Konum:** `src/modules/m8/server/actions.ts:24`. `computeSeatCandidates` şunu çağırıyor: `requireTenantAction({ readOnly: true })`. Ardından `generateSeatCandidates` → `runSeatMatch` (`src/modules/m8/server/matching.ts:309-322`) aynı koltuğun `SeatCandidate` satırlarını `deleteMany` ile siliyor, sonra `create` ile yeniden yazıyor. `readOnly` işareti pilot kapısını atlatıyor. İşaret `a6b22241`'de eklendi, `52cf762b`'de de aynen kaldı.
- **Erişim:** M8, pilot planında var (`public-team` → `basePlanId: 'pro'`, modüller M1–M6 ve M8). Yani her pilot kiracısı bu yola ulaşabiliyor.
- **Canlı kanıt:** Testi :3000'de, kendi süresi dolmuş kiracımda yaptım (plan `public-institution`, provider `pilot`, `trialEndsAt = now()-1dk`).
  - Önce: `SeatCandidate` içinde bir satır vardı: `sefbcand_mun2`, rank 1, puan 0.5.
  - "Aday Bul"a gerçekten tıkladım. Sunucu logu: `POST …/matching 200 … computeSeatCandidatesForm`.
  - Sonra: `SeatCandidate` **0 satır**. Ekran "Bu koltuk için henüz aday hesaplanmadı" diyor. Aynı ekranın üstündeki banner ise "Verileriniz korunuyor … yeni kayıt ve düzenleme kapalı" diyor. Kareler: `04-m8-before.png` ve `06-m8-find-after.png`.
- **Etki:**
  - Salt-okunur olması gereken bir kiracıda kullanıcının gördüğü aday sıralaması siliniyor, yerine yenisi yazılıyor. Test verisinde bu 0 aday demekti.
  - Kiracılar arası bir sızıntı yok: satırlar `(tenantId, seatId)` ile sınırlı. Yine de "pilot bitince veri korunur, yazma kapalı" sözü bozuluyor.
  - Her tıklama CORDIS grafiğini tarıyor. Süresi dolmuş kiracı bu işlemi sınırsız tetikleyebiliyor.
- **Düzeltme:**
  1. `computeSeatCandidates` içinde `requireTenantAction()` çağrılsın, `readOnly` kaldırılsın.
  2. `computeSeatCandidatesForm` içindeki `catch`, pilot reddini tanısın ve `Common.pilotExpired` göstersin. Bunun iki yolu var: `failureCode`/`isPilotExpired` ile bir kod döndürmek, ya da düğmede `useActionErrorText` kullanmak.
  3. `tests/pipeline-actions-pilot-digest.test.ts` kalıbında bir test eklensin: süresi dolmuş pilotta `computeSeatCandidates` `PILOT_EXPIRED` ile reddedilmeli.
  4. Öneri: `readOnly: true` işaretli her action için "Prisma'ya yazma yok" bekçisi. Bugün 14 action bu işareti taşıyor, 2'si yazıyor. Diğeri bilinen `updatePresenceHeartbeat` istisnası (N-2). `generateSectionDraftAi` bugün sabit şablon döndürüyor. Gerçek model çağrısı eklenince (TASK-MUMJ2ERCFP964) `readOnly` kaldırılmazsa süresi dolmuş pilot kredi harcayabilir; bekçi bunu da yakalar.

### B-2 (DÜŞÜK, UX): M8 "Davet Et" pilot reddini sessizce yutuyor
- **Konum:** `src/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page.tsx:220-231`. Bu, bir server component içindeki satır içi `'use server'` form action'ı. `assignCandidateToSeat` kapıdan geçiyor ve `PilotExpiredError` fırlatıyor. `catch` ise yalnız `console.error(errorMessage(e))` yapıyor.
- **Canlı kanıt:**
  - Tıklama sonrası ekranda pilot cümlesi sayısı 0 (kare `05-m8-invite-after.png`).
  - Sunucu logunda şu satır var: `The free pilot of tenant … ended …; the workspace is read-only.`
  - Koltuk `OPEN`, `organizationId` boş. Yani yazma gerçekten reddedildi, yalnız kullanıcıya mesaj gösterilmedi.
- **Etki:** Sayfa üstündeki genel pilot banner'ı durumu yine de gösteriyor. Buna rağmen düğme bir şey yapmıyor gibi duruyor ve kullanıcı tekrar tıklıyor. Bu, İNCELEME-24 B-3'teki portal kalıbıyla aynı.
- **Neden iki envanterde de yok:** Envanterler `^'use server'` ile başlayan dosyaları ve bu dosyaları import eden istemci bileşenlerini taradı. Satır içi (girintili) `'use server'` bu taramaya girmiyor. Ağaçta bu türden yalnız iki action var: portal (düzeltildi) ve bu.
- **Düzeltme:** Portaldaki `46d4c378` kalıbı uygulanabilir: `getPilotState` okunur, süre dolduysa `Common.pilotExpired` uyarısı gösterilir ve form `disabled` olur. Başka bir yol, bu formu `useActionErrorText` kullanan küçük bir istemci bileşenine taşımak. `tests/pilot-expired-write-paths.test.tsx`'e bir vaka eklensin.

### N-1 (görüş, fe-fb'nin açık sorusu): `POST /api/feedback` salt-okunur pilotta yazılabilmeli mi?
**Görüşüm: evet, kapısız kalsın.** Gerekçelerim:
- Geri bildirim, kiracının çalışma alanı verisi değil. Kullanıcıdan platforma giden destek kanalı: `Feedback` satırı ve isteğe bağlı ekran görüntüsü.
- Pilotu biten kurumun "uzatma istiyorum" ya da "bu ekran bozuk" diyebileceği uygulama içi tek yol bu. Kapatılırsa kurum yalnız e-postaya kalır.
- Pilot kuralının amacı ücretsiz dönem bitince çalışma alanında üretimi durdurmak. Destek talebi bu amaçla çelişmiyor. `billing/*` ve KVKK route'ları da aynı gerekçeyle kapısız.
- Canlı kontrol: süresi dolmuş oturumla geçersiz gövde gönderdim, `422` döndü. Yani istek kimlik doğrulamasından geçip doğrulamaya ulaşıyor, pilot kapısı yok. Satır yazmamak için geçerli gövde göndermedim.

Buna bağlı iki koşul öneriyorum:
- (a) Muafiyet koda ve teste yazılsın: route'a "pilot kapısı bilerek yok" yorumu, `pilot-gates.test.ts`'e de "süresi dolmuş pilot feedback yazabilir" vakası eklensin. Böylece biri sonradan `write: true` eklerse test fark eder.
- (b) **Ayrı kart, pilottan bağımsız ve önceden var olan bir sorun:** `api/feedback`'te istek sınırı yok. `src/proxy.ts` ve `src/lib` içinde rate limit bulunmuyor. Oturum sahibi bir kullanıcı sınırsız sayıda satır ve 2 MB'lık ekran görüntüsü (R2) gönderebilir. Kullanıcı başına saatlik bir sınır önerilir.

### N-2 (not, kapsam dışı ve önceden var): `updatePresenceHeartbeat`
- `readOnly` işaretli ama Part B'nin **bütün** `content` alanını okuyup yeniden yazıyor (`savePartContent`). fe-fb bunu bilinen bir istisna olarak yazmış, pilot açısından kabul edilebilir.
- İki ek not:
  - Oku-değiştir-yaz yarışında eşzamanlı bir bölüm kaydını ezebilir.
  - `userId` ve `authorName` istemciden geliyor. Aynı kiracı içinde başka biri adına presence gösterilebilir.
- İkisi de pilot kartının konusu değil. Ayrı bir kartta ele alınabilir.

## Kontrol 1: yazma yolu envanteri

**Server action'lar:** 34 `'use server'` dosyasında 122 export var. Kiracı action'ları şöyle ayrıldı (`admin/*` ve `lib/actions/auth.ts` hariç):
- **Kapıdan geçenler:**
  - `requireTenantAction()`: varsayılan davranışta kapalı (fail-closed).
  - `assertTenantActionWritable`: 8 pipeline action'ı.
  - `assertTenantWritable`: portal action'ı `addBudgetLineByToken`.
  - `ajans/actions.ts` içindeki `createInviteCode`/`revokeInviteCode` araya `managerScope()` koyuyor, o da `requireTenantAction()` çağırıyor.
- **Kapıdan geçmeyen, bilerek:** `actions/user/*` (KVKK), `export-csv` (okuma), pipeline'daki iki okuma yardımcısı.
- **`readOnly: true` (14 action):** 12'si gerçekten salt okuma yapıyor. Tek tek okundu, örneğin `scoreCandidatesForSeat` ve `detectConflicts` saf fonksiyonlar, yazma yok. 2'si yazıyor:
  - `computeSeatCandidates` → **B-1**.
  - `updatePresenceHeartbeat` → bilinen istisna (N-2).

**İstemci:** Kiracı yazma action'larını import eden 24 istemci bileşeninin her `catch` bloğu tek tek tarandı. Pilot cümlesini düşüren bir yer kalmadı. `refuse()` yardımcıları ve calendar `messageFor` `errorText` üzerinden geçiyor. Kalanlar:
- Satır içi server action'lar: 2 tane. Portal ✓. Matching → **B-2**.
- Import edilen ama hiçbir istemcinin çağırmadığı action'lar (`createConceptNote`, `createEvidence`, `verifyEvidenceAction`, m4 `createRelationship`/`updateNextStep`, `createApplicationPart`, agency `*Action`, `generateAiUsageDeclaration`): kapıdan geçiyorlar, UI'ları yok.

**API route'ları** (`src/app/**/route.ts` altındaki tüm POST/PUT/PATCH/DELETE):
- fe-fb'nin listesiyle **birebir aynı**. Kapıdan geçenler: `saved-searches` POST/PATCH/DELETE ve `invitations` POST. Bilerek kapısız: `billing/*`, `gdpr/delete`, `user/*`, `webhooks/*`, `admin/*` (platform yöneticisi), `feedback`, `auth/[...nextauth]`.
- GET ile yazan tek route `api/cagrilar`. Paylaşılan `Topic` kataloğunu önbelleğe yazıyor; kiracı verisi değil, pilot kapsamı dışında.
- `api/v1/*` yalnız GET.

## Kontrol 2: kapı sunucuda mı?
Evet. Kapının üç sunucu noktası var:
1. `requireTenantAction` (`src/lib/tenant.ts:101`). Varsayılan davranış yazma, yani kapalı başlıyor.
2. `requireTenantApi({ write: true })` (`tenant.ts:171`). 403 döndürüyor.
3. Portal: `addBudgetLineByToken` (`m11/server/actions.ts:600-605`). Token'ın kiracısında `assertTenantWritable` çalışıyor.

İstemci tarafı yalnız mesajı çeviriyor. Portaldaki `fieldset disabled` bir kolaylık, güvenlik sınırı değil. Bunu canlıda ayrıca denedim:
- **Portal token'ı, UI atlatma:** Portal sayfasında `fieldset.disabled = false` yapıp formu gerçekten gönderdim. Sonuç: `POST /tr/portal/partner/<token>` **200** döndü, `Next-Action` başlığı vardı ve action çalıştı. **Satır yazılmadı:** DB'de `content = {"budget": []}`, tabloda "SEFBPROBE-BYPASS" satırı yok. Sayfa yeniden çizildiğinde uyarı hâlâ görünüyor (`03-portal-bypass-after.png`).
- **API, doğrudan curl (oturum çereziyle, arayüz yok):**
  ```
  POST   /api/saved-searches              → 403 {"code":"PILOT_EXPIRED", …}
  POST   /api/invitations                 → 403 {"code":"PILOT_EXPIRED", …}
  PATCH  /api/saved-searches/nonexistent  → 403 {"code":"PILOT_EXPIRED", …}
  DELETE /api/saved-searches/nonexistent  → 403 {"code":"PILOT_EXPIRED", …}
  POST   /api/feedback (geçersiz gövde)    → 422  (kapı yok, bkz. N-1)
  ```
- **Server action:** M11 bütçe → `POST …/application 500`, `digest: 'PILOT_EXPIRED'`. DB'ye yazı geçmedi. M8 davet reddedildi ama mesaj gösterilmedi (B-2).
- **İstisna:** B-1'deki `readOnly` işareti kapıyı sunucuda devre dışı bırakıyor.

## Kontrol 4: mutantlar (7'si koşuldu, 7'si öldü)
Koşu, temiz worktree'de (HEAD `6479b4a3`) **ayrı bir DB**'de yapıldı: `fabrika_sefb_mun2`, kurulum `db push` + `prisma/rls.sql`. Önce taban koşusu:
```
vitest run tests/pilot-expired-write-paths.test.tsx tests/pilot-expired-action-message.test.tsx \
           tests/pipeline-actions-pilot-digest.test.ts src/lib/billing/pilot-gates.test.ts
→ Test Files 4 passed (4) · Tests 29 passed (29)
```
Ardından mutantlar:
```
M-A (fe-fb N-1/MB) createOpportunity → düz assertTenantWritable      → 1 failed: createOpportunity                      ÖLDÜ
M-B (fe-fb M3)     members: code: data.code → undefined               → 1 failed: member invite (en)…                     ÖLDÜ
M-C (fe-fb M4)     portal: pilotExpired = false                        → 1 failed: an expired pilot: the notice is shown…  ÖLDÜ
M-D (fe-fb M1)     client.tsx bütçe catch'inde setBudgetError silindi  → 1 failed: budget line: a refused add…             ÖLDÜ
M-S1 (benim)       addBudgetLineByToken SUNUCU kapısı kaldırıldı        → 1 failed: the partner portal token cannot write…   ÖLDÜ
M-S2 (benim)       requireTenantApi write kapısı kaldırıldı (if(false)) → 1 failed: an expired pilot refuses … write routes  ÖLDÜ
M-S3 (benim)       requireTenantAction readOnly mantığı ters            → 3 failed                                          ÖLDÜ
Her mutanttan sonra git checkout yapıldı. Sonunda "status: 0 değişik dosya".
```
Kör nokta: B-1 için bir mutanta gerek yok, çünkü o yolu koruyan hiçbir test yok. `readOnly`'yi kaldırmak da eklemek de mevcut testlerin hiçbirini düşürmez.

## Kontrol 5: canlı :3000 (gerçek tıklama)
- **Kurulum:**
  - :3000 boştu, dinleyen yoktu. Repo içindeki `.claude/worktrees/sefb-mun2` altında temiz bir worktree açtım (HEAD `6a178495`; `src/` `6479b4a3` ile aynı). `node_modules` ve `.env` symlink'lendi. `turbopack.root` yalnız o kopyaya eklendi, commit'lenmedi.
  - Kendi `next dev -p 3000` sürecimi başlattım. Ana ağacın `.next` klasörüne dokunulmadı.
- **Kiracı:**
  - Gerçek `/tr/register` formundan açıldı. Çerez penceresinde "Gerekli Çerezler", ardından ad, kurum, e-posta, aydınlatma onayı, gönder. Yönlendirme: `/tr/default/dashboard`.
  - Ardından SQL ile: `Subscription` (`public-institution`, TRIALING, provider pilot), ModuleState M1–M6, M8, M11 ON, `Opportunity`, Part A (token hash'i), Part B, `ConsortiumSeat`, `SeatCandidate`. Son olarak `trialEndsAt = now()-1dk`.
- **Sonuçlar:**
  ```
  M11 Part A "Bütçe Kalemini Kaydet"  → role=alert "Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun."  (01-m11-budget-tr.png)
  Portal (oturumsuz, token'la)         → uyarı 1 adet, fieldset.disabled=true                                              (02-portal-tr-expired.png)
  Portal disabled atlatıp gönderim     → POST 200, satır yazılmadı, content {"budget": []}                                (03-portal-bypass-after.png)
  M8 "Davet Et"                        → pilot cümlesi 0, sunucu reddetti, koltuk OPEN  → B-2                            (05-m8-invite-after.png)
  M8 "Aday Bul"                        → pilot cümlesi 0, SeatCandidate 1 → 0            → B-1                            (04 → 06)
  pageerror yok
  ```
- **Temizlik:** Tek transaction. Korumalar: id boş olamaz, e-posta eşleşmeli, `Tenant` ve `User` için `ROW_COUNT = 1`. Tenant id `cmun2uswt0001gpxklebapy27`, user id `cmun2uswo0000gpxkfttfdocz`.
  ```
  önce: Tenant 2 · User 43   →   sonra: Tenant 1 · User 42 · demo-tenant 1
  Silinen kiracı satırları: Workspace 1, Membership 1, Subscription 1, Consent 2, ModuleState 8. Opportunity, Part, Seat Workspace cascade'i ile gitti.
  Yetim kontrolü (id ile): Opportunity 0 · ApplicationPart 0 · ConsortiumSeat 0 · SeatCandidate 0 · User 0
  ```
- **Kapanış:** Yalnız kendi PID'lerim (27805/27817) durduruldu, port 3000 yine boş. İki worktree silindi. `fabrika_sefb_mun2` DROP edildi.

## 3) Değişen dosyalar
- Yeni: `docs/agent-results/TASK-MUN2FLEUQI3MT-se-fb.md` ve `docs/agent-results/TASK-MUN2FLEUQI3MT-screenshots/` (6 png).
- Kod değişmedi.
- Paylaşılan ağaçta başkalarına ait, commit'lenmemiş 31 dosya var. Hiçbiri pilot kapısına dokunmuyor: diff'te `readOnly`, `assertTenant`, `requireTenantAction` ya da `PILOT` geçmiyor. Bu dosyalar commit'lenmedi.

## 4) Riskler
- B-1 düzeltilene kadar süresi dolmuş her pilot kiracısı M8 aday listesini silebilir. Etki kendi verisiyle sınırlı ama "veri korunur" sözü bozuluyor.
- Envanter metin taramasına dayanıyor: regex ile export ve catch blokları arandı. Çok satırlı `export const x = async` biçimi yakalanıyor. Ama `export { a as b }` gibi yeniden export yoluyla gelen bir action gözden kaçabilir. Ağaçta bu biçimde bir örnek görmedim.
- Üretimde `digest`'in tarayıcıya ulaştığı hâlâ yalnız dev ortamında kanıtlı. Bu, İNCELEME-17 ve İNCELEME-24'ten devralınmış bir risk.

## 5) Açık sorular
- N-1: feedback muafiyeti patronun kararı. Benim önerim kapısız kalması, (a) ile koda ve teste sabitlenmesi.
- B-1'in sahibi kim olsun: pilot kapısının sahibi be-fb mi (TASK-MUMABL78X5JLX), yoksa M8'e dokunan fe-fb mi? B-1 ve B-2 tek kartta birlikte düzeltilebilir.
- Talimatın alt satırı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUMT3HQI1ILAR-fe-fb.md` yoluna yazmamı istiyordu. Bu yol repo dışında ve incelenen ajanın rapor adını taşıyor; yazsaydım fe-fb'nin raporunun adını gasp etmiş olurdum. Görev metnindeki SONUÇ DOSYASI yolunu (bu dosya) esas aldım. İNCELEME-24'te de aynı şekilde davranılmıştı.

## 6) Sonraki adım
- Kart önerisi (B-1 + B-2):
  - `computeSeatCandidates` içinden `readOnly` kaldırılsın; `computeSeatCandidatesForm` pilot cümlesini göstersin.
  - Matching "Davet Et" için portal kalıbı uygulansın.
  - Bir digest testi ve bir UI testi eklensin.
  - `readOnly` action'lar için "yazma yok" bekçisi eklensin.
  - Doğrulama: aynı canlı senaryo; `SeatCandidate` sayısı değişmemeli ve pilot cümlesi görünmeli.
- Ayrı kart: `api/feedback` için istek sınırı (N-1 b).

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, `next dev` 16.3.4 :3000, Docker Postgres `fabrika-postgres`, chrome-headless-shell 1243). İncelenen kod sunucu tarafında TS (server action, route handler, Prisma) ve React istemcisi. Süreç, dosya yolu, kabuk, kısayol ya da DPI bağımlılığı yok. Pilot kapısı, 403 ve `digest` platformdan bağımsız; B-1 ve B-2 Windows ve Linux'ta da aynen yaşanır. Windows ve Linux **koşulamadı**, çünkü makinede yalnız macOS var.
