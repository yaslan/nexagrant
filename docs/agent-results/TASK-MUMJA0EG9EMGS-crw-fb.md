# TASK-MUMJA0EG9EMGS — FB İNCELEME-19 (crw-fb)

Kod değiştirmedim, push yapmadım. Bütün kapılar dev HEAD `0b93f2ed` üzerinde, ayrık bir worktree'de koştu (`git worktree add --detach`). Worktree'ye kendi `pnpm install --offline --frozen-lockfile` ve `prisma generate` kurulumunu yaptım, `.env` dosyasını kopyaladım. İş bitince worktree'yi kaldırdım. Kart açıklamasını board'dan okudum (REST, salt-okunur).

## Karar tablosu

| # | Kart | Ajan | Commit | Karar | Bulgular |
|---|------|------|--------|-------|----------|
| 1 | TASK-MUMABL78X5JLX (pilot, 2. tur) | be-fb | `fe021b59`, `9459b5d3`, rapor `178f9ffc` | **ONAY** | B-1 kapandı (canlı + pozitif kontrol). Ö-2 ve Ö-4 doğru, 5/5 mutasyon öldü. `587a50e0` ile birlikte doğru çalışıyor. Notlar: N-1, N-2 |
| 2 | TASK-MUMI52B8UW21O (ADR-0007 kararları) | cs-fb | `90f76612` | **ONAY, notlu** | K-1: "B-1 açık" satırları artık eski. K-2: küçük kod-adı kayması |
| 3 | TASK-MUMH6W5I1W9WC (Modüller sayfası) | fe-fb | `cdd3482b` | **ONAY** (B-4a kapandı) | Build yine kırmızı, ama suç bu kartta değil: **B-5**, `587a50e0` (devop-fb, TASK-MULQLL2T8ZJX4) |

**Bu üç kartta bloke eden bulgu yok.**

**Dev dalı bloke:** HEAD'de `pnpm build` exit 1. Neden i18n ratchet: `opportunities/[id]/application/client.tsx` 38 → 39 literal. Suçlu commit `587a50e0`, yani devop-fb kartı (TASK-MULQLL2T8ZJX4, şu an in_progress). Bu İNCELEME-19'un üç kartından biri değil. Push'tan önce (1 Ekim) kapanması şart, çünkü `.github/workflows/i18n-check.yml` de kırmızı olur.

## 1. Ne yapıldı

**Kart 1 (be-fb):**
- `addBudgetLineByToken`, `grantPilot`/`lockPilotRow`, `syncStripeSubscription`/`handleSubscriptionCancellation` ve admin paneli diff'ini satır satır okudum.
- Yazma yolu envanterini kendim yeniden çıkardım:
  - Python ile her `'use server'` export'u için kapı taraması yaptım.
  - `src/app` altında POST/PUT/PATCH/DELETE dışa aktaran her route için kimlik taraması yaptım.
- G1 senaryosunu gerçek tarayıcıda yeniden koştum, pozitif kontrolle birlikte.
- 5 mutasyon denedim.
- tsc, eslint, `rls:check` ve `rls:bypass-check` koştu.

**Kart 2 (cs-fb):**
- ADR-0007, `ILKADIM-PILOT.md` ve ROADMAP diff'ini `catalog.ts`, `pilot.ts`, `BUSINESS_MODEL.md` ve `messages/tr.json` ile karşılaştırdım.

**Kart 3 (fe-fb):**
- `cdd3482b` diff'ini okudum.
- i18n check'i dosya sürüm sürüm koştum (`6e550b68` → `cdd3482b`). Suçlu commit'i `git log` ve sürüm sürüm checkout ile buldum.
- Temiz worktree'de `pnpm build` koştum: önce olduğu gibi, sonra baseline'ı geçici yükselterek.

## 2. Kanıt

### 2.1 G1 canlı yeniden koşusu (İNCELEME-17 B-1 senaryosu, aynı kiracı, aynı parça)

Kurulum:
- **Sunucu:** kendi worktree'mden `next start -p 3119` (HEAD `0b93f2ed`, prod build). `INNGEST_DEV=0` ve `DEMO_LOGIN_ENABLED=false` verildi, çünkü prod build ikisini açık görünce başlamayı reddediyor.
- **DB:** paylaşılan `fabrika` DB'si.
- **Tarayıcı:** Playwright Chromium headless (1243), gerçek form doldurma ve tıklama.
- **Kiracı ve parça:** kiracı `cmumi0obu002tndxk0l2l4m48` ("Crwfb-Pilot-Mumi0mfa Kuruluşu"), parça `crwfb-part-mumi0mfa`.
- **Token:** Eski ham token'ı saklamamıştım ve `587a50e0` sonrası DB'de yalnız hash var. Bu yüzden yeni bir ham token ürettim, `magicTokenHash` alanına onun SHA-256 değerini yazdım. Kiracının "yeni bağlantı ver" işlemine karşılık gelir.

```
before|t|1                                          ← pilot süresi dolmuş (trialEndsAt < now), bütçe 1 satır
G1-expired GET portal: 200
G1-expired POST responses: ["200 text/x-component"]
G1-expired table after reload: "Partner PM Talep Edilen Hibe Probe Partner 3 PM €20.625"
after|1|[{"partnerName": "Probe Partner", "personMonths": 3, …}]          ← YAZMADI (önce: yazıyordu)

-- pozitif kontrol: trialEndsAt = now()+1 gün (pilot sürüyor) --
G1-active POST responses: ["200 text/x-component"]
G1-active table after reload: "… Probe Partner 3 PM €20.625 CRW Probe active 4 PM €27.500"
after-active|2|{"partnerName": "CRW Probe active", "personMonths": 4, "requestedTotal": 27500, …}   ← form yolu çalışıyor
restored|2026-09-29 09:52:29.735|t                  ← trialEndsAt eski değerine geri alındı

G1-expired-again POST responses: ["200 text/x-component"]
after-expired-again|2                               ← süresi dolunca yine yazmadı
```

Pozitif kontrol şunu gösteriyor: ret, formun ya da token'ın bozuk olmasından gelmiyor, kapıdan geliyor. Kareler `docs/agent-results/TASK-MUMJA0EG9EMGS-screenshots/` altında:
- `01-g1-expired-refused.png`
- `02-g1-active-control.png`
- `03-g1-expired-again.png`

Paylaşılan **:3000** aynı token'la hâlâ **404** dönüyor. be-fb de aynısını görmüştü. `curl` ile `/tr/portal/partner/<raw>` → 404, benim prod sunucumda ise 200. :3000 başkasının `next dev` sunucusu ve `magicTokenHash` göçünden önce başlamış. Bellekteki Prisma client'ın eski şemada kaldığını tahmin ediyorum, doğrulamadım. Kod kusuru değil. Sunucuyu yeniden başlatmadım, çünkü benim değil.

### 2.2 Testler ve mutasyon (ayrık worktree, `0b93f2ed`)

```
pnpm exec vitest run src/lib/billing/pilot.test.ts src/lib/billing/pilot-gates.test.ts \
  src/lib/billing/subscription-sync-tenant-scope.test.ts src/lib/secret-token.test.ts
 Test Files  4 passed (4)      Tests  34 passed (34)          (verbose: skip / ↓ yok)

bash mut.sh — her satırda tek dosya değişti, ardından git checkout; sonunda dirty: ''
M0-baseline                [changed:0] => Tests 19 passed (19)
M1-portal-gate-off         [changed:1] => 1 failed  × the partner portal token cannot write into an expired pilot; a running one can
M2-grant-lock-off          [changed:1] => 2 failed  × two concurrent first grants … × two concurrent extensions …
M3-stale-off               [changed:1] => 1 failed  × two concurrent extensions from the same screen extend once …
M4-sync-intx-guard-off     [changed:1] => 1 failed  × a grant landing after the Stripe fast-path read is still caught … (Ö-4)
M5-sync-lock-only-off      [changed:1] => 1 failed  × … (Ö-4)       ← guard dururken yalnız kilidi kaldırmak da yakalanıyor
```

### 2.3 Diğer kapılar (`0b93f2ed`)

```
npx tsc --noEmit                    → exit 0
npx eslint m11/server, pilot.ts, subscription-sync.ts, settings/modules → exit 0
pnpm rls:bypass-check               → ✅ no new tenant bypass … 33 on the sanctioned cross-tenant path, 0 still owed
pnpm rls:check                      → ✅ every one of them carries ENABLE + FORCE + tenant_isolation
```

### 2.4 `pnpm build` (temiz worktree, `env -u NODE_ENV pnpm build`)

```
# HEAD 0b93f2ed, olduğu gibi
❌ More hard-coded text than the baseline allows (1):
   - src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx  38 → 39  (+1)
> Build error occurred  Error: Command failed: tsx scripts/i18n-check.ts
exit 1

# Suçlu commit (dosya sürüm sürüm, i18n-check):
587a50e0: Literals found: 326 …  application/client.tsx 38 → 39 (+1) ❌
96c4166c: Literals found: 325 …  ✅ i18n check passed

# Kart 3 dosyası (settings/modules/client.tsx) sürüm sürüm:
6e550b68: settings/modules/client.tsx 24 → 25 (+1)       ← İNCELEME-18 B-4a
cdd3482b: (listede yok = baseline 24'ün içinde)          ← kapandı
i18n-baseline.json: son değişiklik 37d4a1d4 (ratchet'in kendisi). 6e550b68~1..HEAD arası diff BOŞ → baseline artırılmamış.
messages/tr.json:602 "noSubscription": "Aboneliğiniz yok · ücretsiz paket" · en.json:602 "No subscription · free plan"

# Yalnız bu ayrık worktree'de, geçici: application/client.tsx 38→39 (derlemenin geri kalanını görmek için)
✅ i18n check passed …
✓ Compiled successfully in 8.6s
✓ Generating static pages using 11 workers (30/30)
exit 0
# ardından: git checkout -- i18n-baseline.json → git status temiz
```

Build'deki tek Turbopack uyarısı `src/instrumentation.ts:20 process.exit` ("not supported in the Edge Runtime"). `375d32f2`'den beri var, bu kartlardan gelmiyor.

### 2.5 ADR-0007 ve kod eşlemesi (kart 2)

| ADR iddiası | Kod | Sonuç |
|---|---|---|
| Madde 2: `public-team` → `pro` = M1, M2, M3, M4, M5, M6, M8 | `catalog.ts:507-509` `planId:'public-team', basePlanId:'pro', seats:6`. `catalog.ts:436` `pro` → `['M1','M2','M3','M4','M5','M6','M8']` | **birebir** |
| Madde 2: davet kodu, karne ve radar modül kapısına bağlı değil | `grep -rlE "moduleGate\|assertModuleAccess"` → `src` altında 29 dosya, `fon-hazirlik`, `belediye-cagrilari`, `lib/agency`, `(app)/ajans` içinde 0 | doğru |
| Madde 2: "öncelikli yüzey, yalnız değil" (K-3) | ADR m.2, ILKADIM-PILOT §2.2 ("'Öncelikli', 'yalnız bunlar açık' demek değildir") ve ROADMAP üst not + #24 aynı dili kullanıyor | tutarlı |
| Madde 5: salt-okunur = karar (29.09), B ve C reddedildi | ADR m.5 "Reddedilen seçenekler: B … C …", ROADMAP #24 "[KAPANDI 29.09 — patron kararı]", ILKADIM §0 "Süre dolunca" satırı ve §2.2 | tutarlı |
| Madde 5: bant metni | `messages/tr.json:2416` "… yeni kayıt ve düzenleme kapalı." | doğru |
| Madde 6: M6 ve BUSINESS_MODEL farkı | BUSINESS_MODEL §5.1 Ekip "+ M1, M4, M8" (satır 45), §5.2 "M6 Evaluator Lens €99 Ekip" (satır 60). ADR bölüm numaralarını doğru veriyor | doğru |

## 3. Bulgular (önem sırasıyla)

### B-5 (dev dalını bloke eder; bu üç kartın dışında): `587a50e0` i18n ratchet'i kırdı, `pnpm build` kırmızı
- **Yer:** `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx`. Yeni portal bağlantısı düğmesinde bir sabit metin var ve dosya baseline 38'i aşıyor (39).
- **Senaryo:**
  - Temiz klonda `pnpm build` exit 1 veriyor (§2.4).
  - 1 Ekim push'unda `i18n-check.yml` ve build işi kırmızı olur.
  - Standalone imaj üretilemez.
- **Kimin:** devop-fb, TASK-MULQLL2T8ZJX4 (in_progress). fe-fb'nin `cdd3482b` mesajındaki "ratchet back to baseline" kendi dosyası için doğru. Ama dal, `cdd3482b`'den önce `587a50e0` yüzünden zaten kırmızıydı.
- **Düzeltme:** Yeni metni `messages/{tr,en}.json` altına taşıyın (düğme ya da hata metni, hangisi eklendiyse). Baseline'ı yükseltmeyin. Kartın DoD'sine `npx tsx scripts/i18n-check.ts` + `pnpm build` eklenmeli.

### N-1 (kart 1, öneri, bloke etmez): süresi dolmuş pilotta portal formu sessizce başarısız oluyor
Kare 01/03'te form gönderiliyor, alanlar temizleniyor ama hiçbir mesaj çıkmıyor. Ortak kişi gönderdiğini sanıyor. Sayfadaki inline server action (`portal/partner/[token]/page.tsx`) `addBudgetLineByToken` sonucunu kullanmıyor. be-fb bunu riskler bölümünde (§4-5) yazmış. Ö-1 (TASK-MUMIIUEGJ6N8B) iç kullanıcı için çözüldü. Portal için de "Bu çalışma alanı salt-okunur" mesajı ya da formu hiç göstermemek ayrı bir küçük UX kartı olabilir.

### N-2 (kart 1, bilgi): yazma yolu envanteri eksiksiz
Kendi taramamda kapısız `'use server'` export'ları şunlar:
- `admin/blog/*`, `admin/cordis/*`, `admin/billing handleConfigureSso`: be-fb'nin §4-1'de bulduğu ayrı güvenlik açığı, TASK-MUMJ2ERCFP964.
- `lib/actions/auth.ts`: giriş ve çıkış.
- Yazmayanlar: `calculateLumpSumBudget` (saf hesap), `generateSectionDraftAi` (sabit metin), `getOpportunityFormMembers` / `getSuggestedTopics` (okuma).
- Yazanlar zaten kapıda: `ajans createInviteCode` / `revokeInviteCode` (`managerScope` → `requireTenantAction`), `computeSeatCandidatesForm` (içteki `computeSeatCandidates` üzerinden).

Route tarafı İNCELEME-17'deki listeyle aynı. Tek yeni oturumsuz yazma yolu yok. Yeni `partner-link.ts issuePartnerPortalLink` `requireTenantAction()` ile kapıda, yani süresi dolmuş pilot yeni bağlantı da veremiyor. be-fb'nin tablosuyla birebir.

### K-1 (kart 2, notlu onay): "B-1 açık" satırları artık eski
- ADR-0007 "Sonuçlar/Ürün" bölümünde "**Açık iş (29.09):** İNCELEME-17 B-1 … hâlâ yazabiliyor" yazıyor.
- ROADMAP pilot kapısı (f) "DÜZELTME GEREKLİ: B-1 …" ve "TASK-MUMHVNJLRYQU9 (todo)" diyor. #24 K-1 de "tek istisna açık B-1" diyor.
- `90f76612` (13:11), `fe021b59`'dan (13:13) iki dakika önce commit'lendi, bu yüzden yazıldığı an doğruydu. cs-fb raporu §6'da bunu "sonraki adım" diye kendisi yazmış.
- Artık şöyle güncellenmeli: "B-1 kapandı: `fe021b59`, İNCELEME-19 canlı ONAY".

### K-2 (kart 2, küçük): ADR'de kod adı kayması
ADR "Sonuçlar" bölümü "`pipeline/actions.ts` ayrıca `assertTenantWritable` çağırır" diyor. `0b93f2ed` (TASK-MUMIIUEGJ6N8B) sonrası dosya `assertTenantActionWritable` çağırıyor (`pipeline/actions.ts:155,315`), bu da içinde `assertTenantWritable`'ı sarıyor. Anlam aynı. K-1 güncellemesiyle birlikte düzeltilebilir.

### Kontrol edilip sorun bulunmayanlar
- **B-1 ve `587a50e0` birlikte:**
  - Parça `magicTokenHash: hashSecretToken(raw)` ile bulunuyor, ardından `secretTokenMatches` ile sabit zamanlı karşılaştırma yapılıyor. Pilot kapısı bundan **sonra**, `readPartContent` ve yazmadan **önce** çalışıyor.
  - Yanlış token, kapıya varmadan `success:false` dönüyor. Kiracı bilgisi sızmıyor.
  - İkisi de canlıda (§2.1) ve testte (M1) doğrulandı.
- **Ö-2:**
  - Kilit anahtarı kiracıya özel `sha256("billing.pilot:"+id)`, `pg_advisory_xact_lock` ile alınıyor ve commit ya da rollback'te bırakılıyor.
  - İlk atamada kilitlenecek satır olmadığı için `FOR UPDATE` yerine advisory lock seçilmesi doğru.
  - `expectedEndsAt` akışında iki sekme aynı ekrandan uzatırsa sonuç `extended` + `stale` oluyor.
  - Bir sekme ilk atamayı yaparken diğeri `extend` işaretliyse: `seen=null`, satır aktif, sonuç `stale`, yani doğru.
- **Ö-4:**
  - Kontrol, claim'den sonra aynı transaction'da, kilit altında yapılıyor. `PilotSubscriptionProtected` rollback'i claim'i de geri alıyor.
  - Kilit sırası kilitlenmeye (deadlock) yol açmıyor: `grantPilot` `StripeEventLog`'a dokunmuyor, sync ise pilot kilidinden önce `Subscription` satırını kilitlemiyor.
  - M4 ve M5 ayrı ayrı yakalandı.
- **Kart 3:** Yeni anahtar `settings.modules.noSubscription` tr ve en'de var, i18n check "every key used in src/ resolves" diyor. Modüller sayfasını oturumlu açmadım: prod sunucuda demo girişi kapalıydı. fe-fb'nin önceki kareleri geçerli, bu commit yalnız bir metni anahtara taşıyor.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUMJA0EG9EMGS-crw-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUMJA0EG9EMGS-screenshots/01-g1-expired-refused.png`, `02-g1-active-control.png`, `03-g1-expired-again.png`

Kaynak kod değişmedi.

## 5. Riskler ve dev DB'de kalanlar
- Kiracı `cmumi0obu002tndxk0l2l4m48` ("Crwfb-…", adında crw geçiyor) duruyor:
  - Pilot yine süresi dolmuş, `trialEndsAt` = 2026-09-29 09:52:29.735 (orijinal değer).
  - Parça `crwfb-part-mumi0mfa` artık **2 bütçe satırı** taşıyor. İkincisi "CRW Probe active", pozitif kontrolden geliyor.
  - `magicTokenHash` benim ürettiğim yeni token'ın hash'i. Ham token yalnız scratchpad'imde duruyor, kalıcı bir yere yazılmadı.
  - be-fb'nin temizlik kartı (TASK-MUMHVNJLRYQU9) bu kiracıyı da silebilir. İnceleme bittiği için sakıncası yok.
- Paylaşılan :3000 portal sayfasında 404 dönüyor (§2.1). Bunu gören başka bir ajan kod hatası sanabilir. Sunucunun sahibi yeniden başlatmalı.

## 6. Açık sorular
- B-5: Push 1 Ekim'e kadar devop-fb kartında mı düzeltilecek, yoksa ayrı bir kart mı açılacak? Lider karar versin.
- N-1: Portal için "salt-okunur" mesajı ayrı UX kartı mı olsun? Öneri, karar değil.

## 7. Sonraki adım
- **devop-fb (TASK-MULQLL2T8ZJX4):** B-5, application/client.tsx'teki yeni metni i18n'e taşısın ve `pnpm build` kanıtı versin.
- **cs-fb:** K-1 ve K-2 belge güncellemesi yapılsın: ADR-0007 "Açık iş" satırı ve ROADMAP (f) ile #24.
- TASK-MUMABL78X5JLX ve TASK-MUMH6W5I1W9WC `done`'a alınabilir. TASK-MUMI52B8UW21O K-1 güncellemesiyle kapanabilir, çünkü güncelleme küçük.

**Platform beyanı:** Her şey **mac**'te doğrulandı: Darwin 27, Node + pnpm 11.25, Docker `fabrika-postgres`, Chromium headless-shell 1243, Next 16.3.4 prod build. İncelenen kod sunucu tarafı TS ve Postgres: `pg_advisory_xact_lock`, `node:crypto` SHA-256 ve `timingSafeEqual`. Süreç, dosya yolu, kabuk ya da ekran bağımlılığı yok, bu yüzden Windows ve Linux'ta aynı davranış beklenir. Bu makinede yalnız macOS var, Windows ve Linux'ta **koşulamadı**. Kart 2 yalnız belge işi, platforma bağlı değil.
