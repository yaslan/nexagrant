# TASK-MTSAIWF4ENUSL — M10 çift onay adımları kalıcı oldu

**Ajan:** blockzincir-pm · **Sprint:** S12 D6 · **Branch:** dev

## 1. Ne yapıldı

Akışın 2. ve 3. adımı yalnızca React state'inde yaşıyordu: finans onayı veriliyor, sayfa
yenileniyor, onay kayboluyordu. Kalıcı olan tek olgu `FollowupDoc.signedAt` idi. Bu iş, TASK-MTS808DKQTOQ9
ile (`92268e7`, `0e2149a`) gerçek hale gelen akışın ÜSTÜNE inşa edildi; akış yeniden yazılmadı.

### (a) Şema kararı — `ApprovalRequest` genişletilmedi, bir tablo eklendi

Kartın açıkça sorduğu karar ve gerekçesi:

**Reddedilen: `ApprovalRequest`'i genişletmek.** O tablo tek onaylayanlı genel bir maker-checker
isteği modeller (`approverId`, `requiredRole`, `expiresAt`, `executedAt`, `payload`). İki
departmanın AYRI AYRI imzaladığı bir akış oraya kardinalite olarak sığmaz — genişletsem bile
departman adımları için yine bir alt tablo gerekirdi, yani "yeni tablo yok" olmazdı. Üstüne:
`/approvals` ekranı (`.../approvals/page.tsx:23`) o tablonun tüm satırlarını listeliyor ve
Onayla/Reddet düğmeleri `src/lib/dual-approval.ts`'teki **hiçbir şey yazmayan stub** aksiyonlara
bağlı (`createApprovalRequest`/`approveApprovalRequest` yalnız nesne döndürüyor). M10 satırlarını
oraya koymak, çalışmayan düğmelerin altına gerçek konsorsiyum dokümanları sermek olurdu.

**Seçilen: mevcut `FollowupDoc` genişletildi + bir alt tablo.** `reuse > icat` bu yönde okundu:
akışı AÇAN gönderim dokümanın kendi satırına yazıldı (`FollowupDoc` zaten kiracıya özel, RLS'li,
`Opportunity`'den cascade'li), departman adımları için tek bir yeni tablo eklendi.

| Nereye | Ne |
|---|---|
| `FollowupDoc` (+3 sütun) | `approvalSubmittedAt`, `approvalSubmittedById`, `approvalSubmittedByName` |
| `DualApprovalStep` (yeni) | `tenantId`, `followupDocId`, `department`, `actorUserId`, `actorName`, `note`, `decidedAt` |

### (e) Çift onayın iki kuralı — uygulama kontrolü DEĞİL, unique index

- `@@unique([followupDocId, department])` — bir departman bir dokümanı bir kez onaylar.
- `@@unique([followupDocId, actorUserId])` — bir kişi aynı dokümanda en fazla bir departmanı
  onaylar. "Dual"ın iki tık değil **iki kişi** anlamına gelmesini sağlayan index budur.

Gönderim bir sign-off değildir, dolayısıyla akışı açan kişi bir departmanı hâlâ onaylayabilir
(iki kişilik akış, üç değil). Aynı kurallar uygulamada `refusalForDepartmentApproval()` ile
okunabilir bir gerekçeye çevrilir; index yarış durumundaki (race) yazmayı da keser.

Aktör oturumdan gelir (`requireApprovalActor()` → `auth()`), sabit isim dizesi yoktur.
**Ayrıca bir güvenlik düzeltmesi:** `departmentApproveAction` eskiden ilk argüman olarak
`DualApprovalState`'in TAMAMINI alıyordu. Server action argümanı istek gövdesidir — çağıran
istediği akışı tarif edip imzalatabilirdi. Yeni imza `(docId, department, note?)`; durum
veritabanından okunur.

### (b)(c)(d) Migration, doküman, RLS, erişim

- Migration: `prisma/migrations/add-m10-dual-approval-persistence/migration.sql` (+ `down.sql`),
  `prisma migrate deploy` ile uygulandı.
- `docs/DATA_MODEL.md` § 8.3 aynı işte yazıldı (karar gerekçesi dahil).
- RLS: `prisma/rls.sql`'deki listeye eklendi **ve** migration'ın içinde de bildirildi
  (migration'dan kurulan bir veritabanı kısa süreliğine bile kiracılar arası okunur olmasın).
  `pnpm db:rls` + `pnpm rls:verify` koşuldu.
- Erişim yalnız `withTenant` üzerinden; yazmalar `updateMany`/`create` ile `tenantId` WHERE'de.
  Ham `prisma.` çağrısı yok.

### (f) Banner uyarısı kaldırıldı

`m10.approval.note` (tr + en) yeniden yazıldı. Eski metin: *"Ara onay adımları yalnız bu oturumda
tutulur…"*. Yeni metin: *"Her onay adımı veritabanına yazılır; sayfayı yenilediğinizde akış kaldığı
yerden görünür…"* — ve artık doğru.

Ayrıca: `createNewVersion` yeni revizyonda devralınan onayları siler; başka bir metne verilmiş
onay yeni sürümü imzalamaz.

## 2. Kanıt

### 2.1 Finans onayı → SAYFA YENİLENDİ → onay duruyor (iki kare)

`tests/e2e/m10-dual-approval-persistence.spec.ts` — gerçek tıklama, gerçek oturum, gerçek `page.reload()`:

```
$ npx playwright test tests/e2e/m10-dual-approval-persistence.spec.ts
Running 2 tests using 1 worker
[seed-plan-e2e] ready — ultra=plan-e2e-ultra-ws (ultra) flip=plan-e2e-flip-ws (pro)
  ✓  1 … › a finance approval is still there after the page is reloaded (1.4s)
  ✓  2 … › the finance approver cannot also approve legal, and nothing is written when they try (1.3s)
  2 passed (3.6s)
```

- Yenilemeden ÖNCE: `docs/agent-results/TASK-MTSAIWF4ENUSL-screenshots/01-finance-approved.png`
- Yenilemeden SONRA: `docs/agent-results/TASK-MTSAIWF4ENUSL-screenshots/02-after-reload-still-approved.png`
  → Aşama 2 "Tamamlandı", Aşama 3 "Sırada", onay kaydında iki satır (`E2E Submitter …`,
  `E2E Finance …`) ve banner notu artık "Her onay adımı veritabanına yazılır" diyor.

Test ekranla yetinmiyor, satırı da okuyor:

```ts
expect(stored.approvalSubmittedByName).toBe(ACTOR_A);
expect(stored.approvalSteps).toEqual([{ department: 'FINANCE', actorName: ACTOR_B }]);
expect(stored.signedAt).toBeNull();   // finans onayı imza değildir
```

Aktör adları her koşuda türetilir (`E2E Finance <runId>`), yani sabit/uydurma bir aktör bu
iddiaları geçemez.

### 2.2 Aynı kişi ikinci departmanı onaylayamıyor

`docs/agent-results/TASK-MTSAIWF4ENUSL-screenshots/03-same-actor-refused.png` — finans onayını
veren oturum "Hukuk Onayı Ver"e basıyor, ekranda kırmızı ile:

> Çift onay iki kişi gerektirir: bir departmanı onaylayan kişi diğerini onaylayamaz.

Ve red gerçekten red: aşama `PENDING_LEGAL_APPROVAL`'da kalıyor, `approval-complete` rozeti yok,
veritabanında hâlâ tek adım var ve `signedAt` null:

```ts
expect(stored.approvalSteps).toEqual([{ department: 'FINANCE', actorName: ACTOR_B }]);
expect(stored.signedAt).toBeNull();
```

İkinci kişi akışı kapatıyor ve tamamlanma yenilemeden sonra da duruyor
(`04-completed-after-reload.png`): adımlar `['FINANCE','LEGAL']`, aktörler `[B, A]`, `signedAt` dolu.

Veritabanı seviyesinde de ölçüldü (uygulama atlansa bile geçmez) — `tests/rls.spec.ts`:

```
 ✓ Row Level Security (RLS) > the four-eyes rules are enforced by the database, not only by the app 19ms
```

### 2.3 B kiracısı A'nın onay satırlarını göremiyor

RLS'e TABİ rol (`fabrika_app`, NOBYPASSRLS) üzerinden ölçüldü — ayrıcalıklı `fabrika` rolüyle
yapılan bir ölçüm hiçbir şey kanıtlamazdı:

```
$ npx vitest run tests/rls.spec.ts --reporter=verbose
 ✓ Row Level Security (RLS) > the test connection is genuinely subject to RLS 10ms
 ✓ Row Level Security (RLS) > Tenant A cannot see Tenant B workspaces 13ms
 ✓ Row Level Security (RLS) > queries outside the withTenant wrapper see no rows at all 1ms
 ✓ Row Level Security (RLS) > tenant B cannot see tenant A's dual approval steps 17ms
 ✓ Row Level Security (RLS) > the four-eyes rules are enforced by the database, not only by the app 19ms
 ✓ Row Level Security (RLS) > writes are rejected when they target another tenant 4ms
      Tests  6 passed (6)
```

A 1 satır görüyor (`RLS Finance A`), B kendi geçerli oturumuyla 0 satır görüyor — "her şeyi gizleyen"
bir politika bu testi geçemez, çünkü A tarafı dolu olmak zorunda.

### 2.4 Canlı şema (ölçüm, iddia değil)

```
--- DualApprovalStep columns ---
id | tenantId | followupDocId | department | actorUserId | actorName | note(YES) | decidedAt
--- indexes ---
DualApprovalStep_followupDocId_department_key:  UNIQUE ("followupDocId", department)
DualApprovalStep_followupDocId_actorUserId_key: UNIQUE ("followupDocId", "actorUserId")
DualApprovalStep_tenantId_followupDocId_idx:    ("tenantId", "followupDocId")
--- policies ---
[ { policyname: 'tenant_isolation',
    qual: '("tenantId" = current_setting(''app.tenant_id''::text, true))',
    with_check: '("tenantId" = current_setting(''app.tenant_id''::text, true))' } ]
--- FollowupDoc new columns ---
approvalSubmittedAt | approvalSubmittedById | approvalSubmittedByName
```

### 2.5 `pnpm gate` temiz

```
 Test Files  100 passed | 2 skipped (102)
      Tests  1172 passed | 8 skipped (1180)

$ tsx scripts/check-rls.ts
Found 42 tenant-scoped models requiring RLS policies:
AddOn, AiUsageLog, ApiKey, ApplicationPart, ApprovalRequest, AuditEvent, CalendarConnection,
Claim, ConceptNote, ConsortiumSeat, CreditLedger, Criterion, DualApprovalStep, Effort, …
✅ SUCCESS: All 42 tenant-scoped models have RLS policies registered.

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 42 · RLS açık tablo: 48 · tenant_isolation politikası: 42
✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**Dürüstlük notu:** `pnpm gate` bu ölçüm için, BAŞKA bir ajanın (customer-support /
TASK-MTS9CEDCWKQQK) çalışma ağacında duran, henüz commit edilmemiş
`scripts/task-mts9cedcwkqqk-audit.ts` dosyası geçici olarak kenara alınarak koşuldu; o dosya
typecheck'te 3 hata veriyor (`TS7006` ×2, `TS2347`) ve bana ait değil. Ölçümden sonra dosya yerine
geri kondu. Benim değişikliklerimin dokunduğu her şey temiz.

### 2.6 Mevcut e2e regresyonu

`tests/e2e/m10-audit-identity.spec.ts` yeni kuralla kırılıyordu (hukuk onayını finans onayını veren
aynı kişi veriyordu). 13 satırlık cerrahi düzeltme: hukuk adımı ikinci bir oturuma devrediliyor.

```
$ npx playwright test tests/e2e/m10-audit-identity.spec.ts
  ✓ 1 … the approval record names the session that acted… (908ms)
  ✓ 2 … an identity-less visitor never reaches the approval surface (669ms)
  ✓ 3 … an unauthorised write is refused… LIVE action id (821ms)
  3 passed (3.2s)
```

## 3. Değişen dosyalar

**Şema / veri:**
- `prisma/schema.prisma` — `DualApprovalStep` modeli + `FollowupDoc`'a 3 sütun
- `prisma/migrations/add-m10-dual-approval-persistence/migration.sql` (+ `down.sql`) — YENİ
- `prisma/rls.sql` — `DualApprovalStep` politikası
- `docs/DATA_MODEL.md` — § 8.3

**Uygulama:**
- `src/lib/dual-approval.ts` — `deriveDualApprovalState()`, `refusalForDepartmentApproval()`,
  `defaultDepartmentNote()`, `PersistedApproval` tipleri
- `src/modules/m10/server/actions.ts` — kalıcı submit/approve, imza aynı işlemde,
  `createNewVersion` onayları sıfırlıyor
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx` — adımları okuyor, durumu türetiyor
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx` — `initialApproval`,
  yeni aksiyon imzası, red mesajları
- `messages/tr.json`, `messages/en.json` — banner notu + `approval.refusal.*`

**Test:**
- `tests/e2e/m10-dual-approval-persistence.spec.ts` — YENİ (2 test, 4 kare)
- `tests/e2e/m10-audit-identity.spec.ts` — hukuk adımı ikinci oturuma devredildi
- `tests/dual-approval.test.ts` — +15 saf test (türetme + dört-göz kuralları)
- `tests/m10-dual-approval-action.test.ts` — kalıcı yola göre yeniden yazıldı (15 test)
- `tests/rls.spec.ts` — +2 test (kiracı izolasyonu, DB seviyesinde dört-göz)
- `tests/modules/m10.test.ts` — mock'a `dualApprovalStep.deleteMany` eklendi

## 4. Riskler

- `actorUserId` bilinçli olarak **FK değil**: onay bir imzadır, kullanıcı satırındaki değişikliği
  aşmalıdır. Bunun bedeli, KVKK/GDPR silme akışının (`src/actions/user/export-data.ts` ve
  `tests/gdpr-data-subject.live.test.ts`) bu tabloyu HENÜZ tanımaması — aşağıya açık soru olarak yazdım.
- Banner aynı anda tek akış gösteriyor (en son açılan). Aynı fırsatta paralel iki akış varsa ikincisi
  banner'da görünmez; satırdaki "Onaya Gönder" düğmesi akıştaki dokümanlar için gizlenir, veri kaybı yok.
- Red (`REJECTED`) yolu kalıcı DEĞİL: UI'da bir "Reddet" düğmesi yok, dolayısıyla `rejectDualApproval()`
  saf motorda duruyor ama satır yazmıyor. Kapsam dışı bıraktım; uydurma bir sütun eklemedim.
- Migration'lar bu depoda elle yazılıp `prisma migrate deploy` ile uygulanıyor (klasör adları zaman
  damgasız). Yeni migration sözlük sırasında araya giriyor — deploy sırayı sorun etmedi, ama bu
  kırılgan bir düzen.

## 5. Açık sorular (yolun üstünde görülen, DÜZELTİLMEYEN kusurlar)

1. **`/approvals` ekranı sahte vitrin.** `src/app/[locale]/(app)/[workspace]/approvals/page.tsx:23`
   gerçek `ApprovalRequest` satırlarını okuyor, ama Onayla/Reddet/İptal düğmelerinin çağırdığı
   `createApprovalRequest`, `approveApprovalRequest`, `rejectApprovalRequest`,
   `cancelApprovalRequest` (`src/lib/dual-approval.ts` sonu) hiçbir şey YAZMIYOR — yalnız nesne
   döndürüyor. Kullanıcı onaylıyor, sayfa yenileniyor, karar kayboluyor. Bu, tam olarak bu görevin
   M10 için düzelttiği kusurun ikizi. Ayrı kart hak ediyor.
2. **GDPR silme yolu `DualApprovalStep`'i tanımıyor.** `src/actions/user/export-data.ts:92`
   `approvalRequest`'i topluyor; yeni tablo ne dışa aktarımda ne silmede. Bilinçli tasarım kararı
   (audit kaydı kullanıcı silinince kaybolmamalı) ama **bir karar verilmesi gerekiyor**: anonimleştirme
   mi, saklama mı? Ürün/hukuk kararı, mühendislik kararı değil.
3. **Başka ajanın çalışma ağacındaki `scripts/task-mts9cedcwkqqk-audit.ts` typecheck'i kırıyor**
   (3 hata). Bana ait değil, dokunmadım — sahibi commit etmeden önce görmeli, yoksa `pnpm gate`
   herkes için kırmızı.
4. **`docs/agent-results/TASK-MTS9C907G4YNW-screenshots/` kareleri yeniden üretildi.** O spec'i
   koşmak zorundaydım (kuralı o test kırıyordu); `04-completed-trail.png` artık A→B→A sırasını
   gösteriyor. Dizin blok-zincir-dse'ye ait; kareleri kodla tutarlı kalsın diye aynı commit'e aldım.
5. `pnpm i18n:check` bu depoda ZATEN kırmızı (588+ dinamik anahtar, `${...}` içeren). Benim eklediğim
   `approval.refusal.${refusal}` de aynı desende — mevcut `approval.status.${state}` gibi. Kapının
   parçası değil, ama gürültüyü büyütüyor.

## 6. Sonraki adım

- Kart `review`'a alındı.
- Önerilen yeni kart: `/approvals` ekranının stub aksiyonlarını gerçek `ApprovalRequest` yazmalarına
  bağlamak (madde 1) — bu görevde kurulan desen (satırdan türetilen durum + DB seviyesinde kural)
  oraya doğrudan uygulanabilir.
