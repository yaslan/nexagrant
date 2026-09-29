# TASK-MUMO37MNYHV42 — FB İNCELEME-24 · devop-fb

**Karar:**
- (1) TASK-MUMIIUEGJ6N8B (fe-fb, `0b93f2ed`): **DÜZELTME GEREKLİ**. Commit'in yaptığı iş doğru. Ancak kartın istediği "tüm yazma yolları" kapsamı tamamlanmadı (B-1…B-3).
- (2) TASK-MUMHVNJLRYQU9 (be-fb): be-fb'nin sildiği satırlar için **ONAY**. Ayrıca **KRİTİK ortam bulgusu B-4** var: yerel dev DB'de şu an **hiç kiracı yok**. Bu durum be-fb'nin silme işine bağlanamıyor, nedeni aşağıda.

Kod değiştirilmedi. DB'de yalnız kendi oluşturduğum test kiracısı ve kullanıcısı yazıldı, sonra silindi.

## 1) Ne yapıldı

### (1) Pilot süresi dolmuş mesajı, `0b93f2ed`

**Kod okundu:**
- `src/lib/pilot-expired.ts`
- `src/lib/hooks/use-action-error-text.ts`
- `src/lib/tenant.ts` (`requireTenantAction`, `assertTenantActionWritable`, `requireTenantApi`)
- `pipeline/actions.ts`
- `m11/server/actions.ts`
- `portal/partner/[token]/page.tsx`
- `calls/page.tsx`
- `settings/members/page.tsx`

**Yazma yollarının envanteri:**
- `assertTenantWritable` doğrudan yalnız 3 yerde çağrılıyor:
  - `tenant.ts` içinde `assertTenantActionWritable` ve `requireTenantApi`
  - `m11/server/actions.ts:587`, partner portalı
- `assertTenantActionWritable` 8 pipeline action'ında kullanılıyor.
- Diğer tüm action'lar `requireTenantAction()` üzerinden geçiyor.

**Hook kullanmayan istemci bileşenleri:** action import eden ama `useActionErrorText` kullanmayan istemci bileşenleri tarandı.
- Admin (platform) ekranları kapsam dışı, çünkü kiracı pilotu onları etkilemiyor.
- Geriye kalan kiracı bileşenleri B-1'de listelendi.

**Test ve mutantlar:** test dosyası koşuldu, iki mutant kendim koştum. Dosyalar yedekten geri yüklendi, md5 ile doğrulandı.

**Gerçek tarayıcı testi, :3000:**
- `/tr/register` formundan kendi test kiracımı açtım: "Devopfb-Pilot-Inc24".
- Pilotunu SQL ile süresi dolmuş yaptım: `Subscription` public-team, TRIALING, pilot, `trialEndsAt = now()-1dk`.
- Gerçek tıklamayla dört ekran denendi: il kaydet (tr ve en), kayıtlı arama, üye daveti (en).
- İş bitince kiracıyı ve kullanıcıyı sildim.

### (2) Test verisi temizliği (be-fb)

Kontroller yalnız SELECT ile yapıldı:
- Raporda sabit ID'si verilen 12 kiracı, e-posta deseniyle 12 kullanıcı ve davet satırı sorgulandı.
- `tenantId` sütunu olan her tabloda, silinen 12 ID'ye bağlı satır kalıp kalmadığına bakıldı.
- Ayrıca genel yetim satır taraması yapıldı.

## 2) Kanıt

### (1) Testler ve mutantlar
```
npx vitest run tests/pilot-expired-action-message.test.tsx   → Tests 9 passed (9)

MA isPilotExpired digest kontrolü düşürüldü (`&& digest !== digest`):
   → 5 failed (recognises every shape…, leaves everything else…, value-returning…,
     throwing action production-shaped…, English locale…)          ÖLDÜ
MB pipeline/actions.ts:155 createOpportunity → düz assertTenantWritable (damga yok):
   → hedef test 9/9 geçti; tam koşu `vitest run tests src`: 1 failed (oauth-registration.live,
     ilgisiz flake — temiz koşuda da double-charge-prevention FAIL satırı var)  YAŞADI
RESTORED_OK (md5 db16e2a6… = önce)
```

### (1) Gerçek tarayıcı (Chromium headless-shell 1243, `next dev` :3000, kendi süresi dolmuş test pilotum)
```
province-tr: Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
province-en: The pilot has ended, so editing is off. Ask your administrator to extend it.
saved-search POST status 500   → UI: "Kayıtlı arama işlemi başarısız oldu. Lütfen tekrar deneyin."
invite POST status 500         → UI: "Error: Failed to execute 'json' on 'Response': Unexpected end of JSON input"
pageerrors 0
```
Kareler `docs/agent-results/TASK-MUMO37MNYHV42-screenshots/` altında:
- `01-province-tr.png`, `01-province-en.png`
- `02-calls-saved-search-tr.png`
- `03-members-invite-en.png`

Not: paylaşılan dev sunucusunda **tüm `/api/*` route'ları şu an oturumsuz istekte bile boş gövdeli 500 dönüyor**. Örnek: `curl -X POST /api/saved-searches` → 500, `GET /api/invitations` → 500. Bu yüzden 403 `PILOT_EXPIRED` cevabı canlı gösterilemedi. Ağaçta başka bir ajanın commit'lenmemiş `invitations/route.ts` ve `email/*` değişiklikleri var. B-2 için canlıda gösterilen dal (`!res.ok` → `saveSearchError`) 403 ile birebir aynı dal, bunu koddan aşağıda gösteriyorum.

### (2) DB doğrulaması (`fabrika-postgres`, rol `fabrika` superuser/bypassrls)
```
12 silinen kiracı ID'si Tenant'ta                    → 0
ilkadim-pilot-befb + fefb-(none|pilot|pilot-expired|pro|outside)-<n> kullanıcıları → 0
Tenant adı deseni (Fefb-…-<n>, Ilkadim-Pilot-Befb)   → 0
Invitation ilkadim-uye2-befb@example.test            → 0
tenantId'li 35 FK'siz tablo + FK'li tüm tablolarda 12 silinen ID'ye bağlı satır → her tabloda 0
```
**Genel durum (B-4):**
```
SELECT count(*) FROM "Tenant"      → 0      (be-fb raporu: 49)
SELECT count(*) FROM "User"        → 42     (be-fb raporu: 42 ✓)
Workspace 0 · Membership 0 · Invitation 0
Kalan test kiracıları (Crwfb-Pilot-Mumi0mfa, Fefb-Pilot-Mumip77s, Kamu B11 Test Belediyesi) → yok
demo seed kiracısı → yok (postgres log 12:49 UTC: "Key (tenantId)=(demo-tenant) is not present in table Tenant")
```
**Kiracısı artık olmayan `tenantId` satırları (hiçbiri silinen 12 ID'den değil):**

| Tablo | Satır |
|---|---|
| Consent | 1805 |
| Document | 102 |
| Evidence | 92 |
| Chunk | 10 |
| AiUsageLog | 9 |
| Feedback | 5 |
| ApiKey | 2 |
| Claim | 2 |
| SavedSearch | 2 |
| CalendarConnection | 1 |

Kullanıcısı olmayan `userId` satırları: `Consent.userId` 1758, `CalendarConnection.userId` 1.

Temizlik (kendi test verim, sabit ID ile, tek transaction):
```
Consent 2 · AuditEvent 0 · Tenant 1 (kaskad: Workspace/Membership/Subscription) · User 1
NOTICE: no rows left   → tenants 0 | users 42 (başlangıç değerleri)
```

## Bulgular

**B-1 (DÜZELTME): M11 başvuru ekranı kapsanmamış ve raporda beyan edilmemiş.**
- Etkilenen action'lar, hepsi `requireTenantAction()` ile yazma:
  - `opportunities/[id]/application/client.tsx`: `addBudgetLine`, `addWorkPackage`.
  - `src/modules/m11/ui/PartBCollaborativeEditor.tsx`: `updateSectionContent`, `acquireSectionLock`, `releaseSectionLock`, `addSectionComment`, `resolveSectionComment`, `restoreSectionRevision`.
- Bu action'lar `useActionErrorText` kullanmıyor.
- Sonuç: süresi dolmuş pilotta bütçe satırı ve iş paketi eklemek sessizce başarısız oluyor (`catch` → yalnız `console.error`). Part B kaydetme ve kilit işlemlerinde ret yakalanmıyor.
- fe-fb raporu "48 kapsandı, 9 kapsam dışı" diyor. Bu 8 action iki listede de yok. "m11'e dokunulmadı" notu var, ama m11'in yazma yolları listelenmemiş.

**B-2 (DÜZELTME): API route yazma yolları kartın hedefini karşılamıyor.**
- `requireTenantApi({ write: true })` 403 döndürüyor, gövde `{ code: 'PILOT_EXPIRED', error: '<TR cümle>' }`.
- `calls/page.tsx:242-251` (kayıtlı arama kaydet/sil/bildirim) her `!res.ok` durumunda `saveSearchError` gösteriyor: "… Lütfen tekrar deneyin.". Kartın kaldırmak istediği davranış tam olarak bu. Kare `02-calls-saved-search-tr.png`.
- `settings/members/page.tsx:30`, `data.error` metnini olduğu gibi basıyor. en yerelde kullanıcı "Error: Ücretsiz pilot süresi doldu; …" görür. Yani ne i18n'e uyuyor ne de `Common.pilotExpired`'a.
- Öneri: `isPilotExpired`, `{ code: 'PILOT_EXPIRED' }` gövdesini zaten tanıyor (`code === PILOT_EXPIRED_DIGEST`). İki istemci `errorText(data, …)` ile bağlanabilir.
- Bu kusur `0b93f2ed`'den önce de vardı, commit bir gerileme getirmedi. Ama kart "tüm yazma yolları" diyor.

**B-3 (DÜZELTME, küçük): Partner portalı sessiz kalıyor.**
- Süresi dolmuş pilotta `addBudgetLineByToken` → `{ success: false }` dönüyor (`m11/server/actions.ts:589`).
- `portal/partner/[token]/page.tsx:119` satır içi form action'ı dönen değeri atıyor.
- Sonuç: partner "tekrar deneyin" görmüyor, ama hiçbir mesaj da görmüyor, formu tekrar tekrar gönderiyor.
- Öneri: `failureCode` ile `pilotExpired` döndürülsün ve sayfa bunu göstersin.

**B-4 (KRİTİK, ortam, be-fb'ye bağlanamaz): Yerel dev DB'de hiç kiracı kalmamış.**
- Durum: `Tenant` 0, `Workspace` 0, `Membership` 0. `User` 42 satır duruyor, demo kullanıcılar dahil (en eskisi 07.09).
- be-fb raporunda silme sonrası 49 kiracı yazıyor ve saydığı 42 kullanıcı bugün de tutuyor. Yani be-fb'nin transaction'ı yalnız 12 satırı sildi, eksik kiracılar sonradan gitti.
- Zamanlama: `pg_stat_user_tables` → `Tenant` autovacuum `12:48:15 UTC`. Toplu silme bundan hemen önce olmuş.
- **Açıkça belirtiyorum:** bu pencerede ben de mutant MB için `vitest run tests src` tam koşusunu yaptım (yaklaşık 12:46–12:49 UTC). Aynı saatlerde başka ajanların canlı testleri de koşuyordu. Postgres logu 12:49 UTC'de başka test hatalarını gösteriyor. Silmeyi kimin yaptığını kesinleştiremedim. Benim koşum da neden olabilir, kesin olarak dışlayamıyorum.
- Güçlü şüphe: canlı testlerde `deleteMany({ where: { id: tenantId } })` kalıbı var. Kurulum başarısız olup `tenantId` `undefined` kalırsa Prisma filtreyi yok sayar ve **tüm kiracıları siler**. Örnek: `tests/bearer-token-hash.live.test.ts:45` afterEach, korumasız. Buna karşılık `k3-topic-stats-import` `if (tenantId)` ile, `plan-entitlement-version` `ready` ile korunmuş.
- Yetim satırlar: 35 tabloda `tenantId` için FK yok. Bu yüzden kiracılar gitti ama tablo 2'deki satırlar kaldı.
- Veriye dokunmadım: ne geri yükledim ne sildim.
- Öneri: ayrı bir kart açılsın.
  - (a) Kök neden: `deleteMany` çağrılarında `id: undefined` korumasını ekle ve bir test koruması (guard) yaz.
  - (b) Patron onayıyla `pnpm db:seed` ya da bir yedekten geri yükleme. Test yetimleri de toplu temizlenebilir.

**N-1 (öneri): 8 pipeline action'ı `assertTenantActionWritable` üzerinden damga basıyor, ama bunu test eden bir test yok.** MB mutantı yaşadı: `createOpportunity` düz `assertTenantWritable`'a dönse hiçbir test düşmüyor, üretimde de "Fırsat eklenemedi. Lütfen tekrar deneyin." geri gelir. Önerilen test: `createOpportunity`'yi süresi dolmuş pilotla çağırıp `digest === 'PILOT_EXPIRED'` olduğunu doğrulasın.

**N-2 (ortam):** :3000'de tüm `/api/*` route'ları 500 dönüyor, oturumsuz istekte de. Muhtemelen paylaşılan ağaçtaki commit'lenmemiş iş yüzünden. Sahibi bakmalı.

## 3) Değişen dosyalar
- Yeni: `docs/agent-results/TASK-MUMO37MNYHV42-devop-fb.md` ve `docs/agent-results/TASK-MUMO37MNYHV42-screenshots/` (4 kare).
- Kod değişmedi.
- DB'de yalnız kendi test kiracım `cmumof6pv005lndxkytx9g0jr` ve kullanıcım `cmumof6ps005kndxkt3v3da18` oluşturuldu, ardından silindi.

## 4) Riskler
- B-4 yüzünden paylaşılan dev DB'de kiracıya dayanan tüm manuel testler, kayıt yapılmadıkça boş çalışma alanı görür. Demo girişi de etkilenmiş olabilir. `demo-tenant` FK hatası logda görülüyor.
- Üretimde `digest`'in tarayıcıya ulaşması hâlâ yalnız dev ortamında ve kaynak okumasıyla kanıtlı (fe-fb riski devam ediyor).

## 5) Açık sorular
- B-4: silmeyi hangi süreç yaptı? Benim tam test koşum da aday. Geri yükleme `db:seed` ile mi yoksa yedekle mi yapılsın? Bu karar patrona ait.
- Talimatın alt satırı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUMIIUEGJ6N8B-fe-fb.md` yoluna yazmamı istiyordu. Bu yol repo dışında ve fe-fb'nin rapor adını taşıyor. Görev metnindeki SONUÇ DOSYASI yolunu (bu dosya) esas aldım.

## 6) Sonraki adım
- fe-fb: B-1, B-2 ve B-3'ü düzelt, N-1 testini ekle.
- be-fb veya devop: B-4 için kök neden ve seed kartı açılsın.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, `next dev` :3000, Docker Postgres `fabrika-postgres`, Chromium headless-shell 1243). İncelenen kod sunucu tarafında TS ve React istemcisi. Süreç, dosya yolu, kabuk ya da DPI bağımlılığı yok. `digest` ve HTTP 403 platformdan bağımsız, Windows ve Linux'ta aynı davranış beklenir. Bu iki platform **koşulamadı**, çünkü makinede yalnız macOS var.

---

## Ek — B-4 takibi (patron: "kök neden kartı aç, db:seed ile geri yükle", 29.09)

**Kök neden kartı:** TASK-MUMSUA77J1C6Q (todo, FB-KAMU-2, atanmamış).
- İzole bir DB'de kanıt koşusu yapılacak.
- Değişkenle çağrılan `deleteMany` teardown'larına koruma eklenecek.
- Aynı hatanın geri gelmesini engelleyen bir guard ve mutant kanıtı istenecek.
- Seed'in ModuleState açığı kapatılacak.

**Geri yükleme:** `pnpm db:seed` koşuldu (exit 0).
- Seed idempotent, upsert tabanlı.
- Tek silme yan etkisi, listede olmayan `Plan` satırlarını emekliye ayırması. Bu yüzden Plan/PlanVersion önceden yedeklendi: scratchpad'de `plan-backup.sql`, 56 satır.
```
            önce  sonra
Tenant        0     1   (demo-tenant "Fabrika Beta")
User         42    42
Workspace     0     1
Membership    0    11
Subscription  0     1   (pro ACTIVE)
Opportunity   0     5
Call        444   444
Plan          7     7   PLANS_UNCHANGED (id listesi aynı)
```
Seed logu: 10 koltuk ve superadmin, 20 çağrı, 5 fırsat, 15 kapı kararı, 3 teklif, 10 efor, M6 değerlendirmesi, E11 geri bildirimi.
- Uyarı: `demo-topic-1..6` bulunamadığı için 5 K1 eşleşmesi atlandı. G0 hizalaması seed'lenmedi, bu seed'in kendi davranışı.

**Gerçek tarayıcı:** `alice@fabrika.test` ile giriş yapıldı → `/tr/default/dashboard`, h1 "Panel", pageerror 0.

**Açık, seed tam geri getirmedi:** `ModuleState` tablosu 0 satır.
- `prisma/seed.ts:22`'deki yorum bu satırları türettiğini söylüyor, ama seed ModuleState yazmıyor.
- Sonuç: demo-tenant'ta modüller kapalı. Fırsatlar sayfası "Bu modül şu anda kullanılamıyor" gösteriyor. Kare `04-seed-sonrasi-pipeline.png`.
- Silinen diğer test kiracıları (Crwfb-Pilot, Fefb-Pilot-Mumip77s, Kamu B11) seed kapsamında değil, geri gelmedi.

**Geri alma:** `DELETE FROM "Tenant" WHERE id='demo-tenant'` (kaskad), sonra gerekirse `plan-backup.sql`.
