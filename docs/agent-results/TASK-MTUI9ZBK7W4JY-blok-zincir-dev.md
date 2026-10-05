# TASK-MTUI9ZBK7W4JY — e2e test hygiene: a green test that measured nothing, and a spec on a borrowed tenant

**Ajan:** blok-zincir-dev · **Platform:** mac (darwin 25.6.0, Apple Silicon) · **Branch:** dev
**Rapor durumu:** canlı yazıldı — her adım ölçüldükçe eklendi (önceki iki turda pane kaybolduğu için rapor hiç oluşmamıştı).

---

## 1. Ne yapıldı

Üç iş: (a) `tests/e2e/module-gate.spec.ts` gerçekten ölçen hâle getirildi, (b)
`tests/e2e/plan-entitlement.spec.ts` paylaşılan `demo-tenant`'tan kendi kiracısına taşındı,
(c) `pnpm gate` güncel HEAD üzerinde yeniden koşuldu (§6).

### 1a. Devralınan teşhis bir hipotezdi — ölçtüm, iki yerde yanlıştı

Görev metni şunu söylüyordu: *"`module-gate.spec.ts:20-34` oturumsuz `/en/default/evidence`'a
gidiyor ve **d1de9d4**'ten sonra bu istek `/en/login`'e 307 veriyor"*. Düzeltmeden önce ölçtüm:

```
$ for u in /en/default/dashboard /en/default/pipeline /en/default/evidence /tr/default/firsatlar; do
    curl -s -o /dev/null -w "status=%{http_code} redirect=%{redirect_url}\n" "http://localhost:3000$u"; done
=== /en/default/dashboard ===  status=307 redirect=http://localhost:3000/en/login
=== /en/default/pipeline ===   status=307 redirect=http://localhost:3000/en/login
=== /en/default/evidence ===   status=307 redirect=http://localhost:3000/en/login
=== /tr/default/firsatlar ===  status=307 redirect=http://localhost:3000/tr/giris
```

Yönlendirme doğrulandı, ama **sebebi ve kapsamı** devredilenden farklı çıktı:

**(i) Yönlendirmeyi `d1de9d4` yapmıyor.** Kaynak `src/app/[locale]/(app)/layout.tsx:50` ve
`git blame` onu **c915bc43 (2026-09-06)** tarihine bağlıyor — `d1de9d4`'ten (09-09) **üç gün
önce**:

```
$ git blame -L 46,52 "src/app/[locale]/(app)/layout.tsx"
c915bc431 (Yasin ASLAN 2026-09-06 17:44:55 +0300 50)   if (!session?.user) {
c915bc431 (Yasin ASLAN 2026-09-06 17:44:55 +0300 51)     redirect(`/${locale}/${locale === 'tr' ? 'giris' : 'login'}`);
```

`d1de9d4` sayfa içindeki `requireTenantPage`'i ekledi, ama `(app)` layout'u zaten anonim
ziyaretçiyi sayfa render edilmeden önce kesiyordu. Yani test 3 gündür ölüydü, 1 saattir değil.

**(ii) Bozuk olan tek test değil, dosyanın tamamı.** Görev yalnız 20-34. satırları işaret
ediyordu. Diğer iki test `expect(page.locator('h1, [role="main"]').first().isVisible())` diyor —
ve giriş sayfasında bir `<h1>` **var**:

```
$ curl -sL "http://localhost:3000/en/default/pipeline" | grep -oE '<h1[^>]*>|role="main"|<main[^>]*>'
<h1 class="text-2xl font-bold font-heading text-ink tracking-tight">
<main class="flex-1 flex items-start justify-center px-4 pt-2 pb-12 sm:pt-4 sm:pb-16">
```

Yani üç testin üçü de giriş ekranında yeşil yanıyordu. Bir testi düzeltip diğer ikisini
"geçiyor" diye bırakmak, aynı kusuru geçen bir cümlenin arkasına saklamak olurdu.

**(iii) `default` slug'ı bir kırmızı ringa — ama sandığım sebepten değil.** Önce
"`default` demo kiracının çalışma alanı değil, o yüzden yanlış kiracıya bakıyorduk" diye
yazmıştım; **bu yanlıştı** ve kendi takım hafızam düzeltti
([[fabrika-workspace-url-segment-is-decorative]], 2026-09-07). Yoldaki `[workspace]`
segmenti kiracıyı **belirlemez**: `requireTenantPage(locale)` yalnız locale alır, kiracıyı
oturumdan çözer (`src/lib/tenant.ts:99-112`), ve `evidence/page.tsx` `workspace` param'ını
alıp hiç kullanmaz. Yani slug'a ne yazılırsa yazılsın, oturum açmış bir kullanıcı **kendi**
kiracısını görürdü.

Doğru ifade: `default` slug'ı testin bozukluğunun sebebi değil, **teşhisi zorlaştıran bir
gürültü**. Tek gerçek sebep oturumun olmaması. (Yine de spec'i kendi fixture slug'ına
taşıdım: URL'in kullanıcıya doğru şeyi söylemesi, ölçmese bile, okunabilirlik kazancı.)

Kayıt için ölçülen slug'lar — demo-tenant'ın çalışma alanı `main`, `default` ise otomatik
açılan tek kullanımlık kiracılarda:

```
workspaces: [{"slug":"samples","tenantId":"esr-calibration"},{"slug":"default","tenantId":"cmtrhjys1..."},
             {"slug":"main","tenantId":"demo-tenant"}, {"slug":"default","tenantId":"cmtu6umhw..."}, ...]
```

### 1b. `module-gate.spec.ts` — ölçen hâle getirildi

Spec artık **okuduğu anahtarların sahibi olan kendi kiracısını** kuruyor
(`tests/e2e/fixtures/module-gate-tenant.ts`, depodaki `notfound-tenant.ts` / `m9-tenant.ts`
kalıbının aynısı). Plan `basic` — kataloğun M2/M3/M5 verdiği plan — ve iki modül de bu planın
**içinde**, yani buradaki hiçbir sonuç "plan kapsamı" yüzünden değişemez:

| Modül | Durum | Beklenen |
|---|---|---|
| M5 (Proposal Production Workflows) | `ON` | `/pipeline` ve `/firsatlar` gerçekten açılır |
| M3 (Evidence Pack) | `OFF` | 🔒 reddi, gerekçe **anahtar** (`MODULE_OFF`), plan değil |

Kapının diğer yarısı (plan kapsamı) `module-plan-gate.spec.ts`'te, kendi kiracısını bilerek
`pro`↔`ultra` çeviren spec'te duruyor. İkisinin ayrı kalması, bu dosyada bir kırmızının
yalnızca `ModuleState` anahtarı anlamına gelmesini sağlıyor.

Üç test, üç somut iddia:

1. **oturumsuz** — modül sayfası hiç sunulmaz: `maxRedirects: 0` ile **307'nin kendisi ve
   hedefi** iddia ediliyor (EN → `/en/login`, TR → `/tr/giris`), sonra yönlendirme izlenip
   sayfada modülden hiçbir şey olmadığı doğrulanıyor.
2. **M5 `ON`** — pipeline panosu (`Fırsat & Teklif Boru Hattı`) gerçekten render oluyor ve
   `/firsatlar` alias'ı **aynı** panoyu veriyor (alias `firsatlar/page.tsx`'te `PipelinePage`
   re-export'u; iddia bunu gösteriyor, "HTML döndü"yü değil).
3. **M3 `OFF`** — gerçek 🔒 ekranı ve cümlenin `MODULE_OFF` olduğu
   ("The Evidence Pack module is turned off for your workspace."), `PLAN_UPGRADE_REQUIRED`
   olmadığı.

**Kendi yazdığım bir tuzağı düzelttim:** ilk denemede 3. testin sonuna
`not.toContainText('Evidence Pack')` koymuştum. Bu yanlış: reddin metni modülü **bilerek**
adıyla anıyor, yani bu iddia doğru çıktıyı yasaklardı. Doğru işaret sayfanın kendi gövde
metni:

```ts
// Nothing behind the gate rendered. The marker is the page's own body copy, not
// the words "Evidence Pack": the refusal names the module on purpose, so a
// `not.toContainText('Evidence Pack')` here would forbid correct output.
await expect(page.locator('body')).not.toContainText(
  "Centralize your organization's core capabilities",
);
```

### 1c. `plan-entitlement.spec.ts` — kendi kiracısına taşındı

Spec `demo-tenant`'ın `planId`'sini `basic`↔`ultra` çevirip `afterAll`'da geri koyuyordu.
`seed-plan-e2e.ts` bu sorunu iki spec için (`m10-audit-identity`, `module-plan-gate`) zaten
çözmüştü; bu spec dışarıda kalmıştı. Üçüncü bir fixture eklendi:

- `lens` → `plan-e2e-lens-tenant`, plan **`basic`** (M6 gerçekten plan dışında başlasın diye),
  rol `TENANT_OWNER` (modül yönetimi yalnız sahibe açık).
- `PlanFixture`'a isteğe bağlı `modules` alanı eklendi. Varsayılan hâlâ `['M10']`; `lens` ise
  `modules: []` veriyor — konusu **planın satmadığı** bir modül olan bir fixture'a `ON` satırı
  yazmak, okuduğu ayarlar sayfasına kendisiyle çelişen bir durum koyardı.
- `beforeAll` → `seed()`, `afterAll` → `rollback()`; "eski değeri sakla/geri koy" mantığı
  tamamen kalktı (kiracı artık fixture'ın kendisi).

Ayrıca bir tuzak kapatıldı: `setPlan()` artık `planVersionId: null` da yazıyor. Fixture
`basic`'e `pv_basic_1` bağlı geliyor; `planId` `ultra`'ya çevrilirken bu işaretçi yerinde
kalsaydı satır kendisiyle çelişir, `getEntitlements` her kontrolde "reddedilen sürüm" uyarısı
basıp kataloğa düşerdi. Sürüm yolunun kendi spec'i var
(`plan-entitlement-from-version.spec.ts`), bu spec'in konusu katalog.

---

## 2. Kanıt

### 2.1 Yeşil koşu (güncel ağaç, HEAD `290cc8c`)

```
$ pnpm typecheck
$ tsc --noEmit                                         # çıktı yok = temiz

$ npx playwright test tests/e2e/module-gate.spec.ts tests/e2e/plan-entitlement.spec.ts
  ✓  1 module-gate.spec.ts:48  › a module page is never served without a session (…)
  ✓  2 module-gate.spec.ts:68  › M5 is ON, so the pipeline board renders — and /firsatlar is the same module
  ✓  3 module-gate.spec.ts:85  › M3 is OFF, so the Evidence Pack is refused — and the reason is the switch
[seed-plan-e2e] ready — ultra=plan-e2e-ultra-ws (ultra) flip=plan-e2e-flip-ws (pro) lens=plan-e2e-lens-ws (basic)
[seed-plan-e2e] rolled back
  ✓  4 plan-entitlement.spec.ts:100 › Basic cannot reach M6 and Ultra can
  4 passed (9.1s)
```

### 2.2 KIRMIZI olabildiğinin ispatı — üç mutasyon, hepsi **konuyu** bozuyor (iddiayı değil)

Testin gevşetilmediğini göstermenin tek yolu, ölçtüğü şeyi bozup kırmızıya döndüğünü
görmek. Üç mutasyon da üretim durumuna/koduna uygulandı, sonra geri alındı.

**A — anonim yönlendirmeyi kaldır** (`layout.tsx`, `if (false && !session?.user)`):

```
  ✘  1 › a module page is never served without a session
    Error: /en/mg-e2e/pipeline must not serve a module page anonymously
    Expected: 307
    Received: 500
  1 failed / 2 passed
```

**B — yönlendir, ama yanlış hedefe** (`'giris'/'login'` → `'kayit'/'register'`) — hedef
iddiasının da taşıyıcı olduğunu gösterir:

```
  ✘  1 › a module page is never served without a session
    Expected: "/en/login"
    Received: "/en/register"
  1 failed / 2 passed
```

**C — iki modül anahtarını takas et** (`{ M5: 'OFF', M3: 'ON' }`):

```
  ✘  2 › M5 is ON, so the pipeline board renders — and /firsatlar is the same module
    Expected substring: "Fırsat & Teklif Boru Hattı"
    Received string:    "🔒This module is not availableThe Proposal Production Workflows module is
                         turned off for your workspace.If you need access, talk to your workspace
                         administrator or the Fabrika team."
  ✘  3 › M3 is OFF, so the Evidence Pack is refused — and the reason is the switch
    Expected substring: "This module is not available"
  2 failed / 1 passed
```

Üçü de geri alındı; `git diff --stat -- "src/app/[locale]/(app)/layout.tsx"` boş,
fixture `{ M5: 'ON', M3: 'OFF' }` hâline döndü. **Eski testler bu mutasyonların hiçbirinde
kırmızıya dönmezdi** — hiçbiri modül sayfasına ulaşmıyordu.

### 2.3 `demo-tenant` artık kirlenmiyor (ölçülmüş, iddia değil)

Spec'in öncesi/sonrası aynı satır:

```
BEFORE: demo-tenant plan={"planId":"pro","planVersionId":"pv_pro_1"} M6={"status":"OFF"} e2e-leftovers=[]
  ✓  1 plan-entitlement.spec.ts:100 › Basic cannot reach M6 and Ultra can
AFTER:  demo-tenant plan={"planId":"pro","planVersionId":"pv_pro_1"} M6={"status":"OFF"} e2e-leftovers=[]
```

Eskiden bu koşu sırasında `demo-tenant.planId` `basic`, sonra `ultra` oluyordu; aynı anda
`demo-tenant`'ı okuyan her spec bunu görüyordu. Artık dokunulmuyor ve fixture kiracıları
koşu sonrası ortada kalmıyor (`e2e-leftovers=[]`).

---

## 3. `pnpm gate` — tam koşu, güncel HEAD (`aef5706`)

Koşu 2026-09-09 23:00:27'de başladı, ~3.7 dk sürdü. `pnpm gate` `&&` zinciridir; son aşamanın
koşmuş olması kendinden öncekilerin geçtiğini gösterir. Ham çıktı (gürültü ayıklanmış):

```
$ pnpm gate
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check
  && pnpm rls:check && pnpm rls:verify && pnpm test:e2e

$ prisma generate                     → ok
$ eslint                              → ✖ 2 problems (0 errors, 2 warnings)
      docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts  'R' assigned but never used
      docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts  '_url' defined but never used
$ tsc --noEmit                        → çıktı yok = temiz
$ vitest run --passWithNoTests
       Test Files  140 passed | 2 skipped (142)
            Tests  1670 passed | 8 skipped (1678)
$ tsx scripts/i18n-check.ts
       Keys in messages/tr.json: 1436 · Keys in messages/en.json: 1436
       ✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
$ tsx scripts/check-rls.ts
       ✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.
          (Declared, not measured — `pnpm rls:verify` asks the database.)
$ tsx scripts/check-rls-live.ts
       Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
          ✓ okuma (negatif) · ✓ okuma (pozitif) · ✓ yazma (negatif) · ✓ yazma (pozitif) · ✓ yazma (çapraz)
       ✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
$ playwright test
       1 skipped
       146 passed (3.1m)
```

`grep -c ELIFECYCLE gate.log` → `0`. **Kapı yeşil.**

İki not, gizlemeden:

- **2 lint uyarısı** (0 hata) — ikisi de `docs/agent-results/…-evidence/` altındaki eski probe
  dosyalarında, benim dokunduğum dosyalarda değil. Kapı `--max-warnings` kullanmadığı için
  bunlar kapıyı kırmızıya çevirmiyor; olduğu gibi bildiriyorum.
- e2e logunda `[users-scheduled-deletion] failed for user purge-alert-s-…
  PrismaClientKnownRequestError` satırları görünüyor. Bu bir kırılma **değil**:
  `purge-failure-alert-console.spec.ts` başarısız bir silme işlemini bilerek üretip alarmın
  konsola düştüğünü ölçüyor, ve o test geçti (`✓ 118`).

---

## 4. "Kapı kapattığı ağacın son hâlinde ölçüldü mü?" — evet, artık kapanıyor

Sorulan şuydu: önceki yeşil kapı koşum **22:29**'da bitti, RAG birleştirmesi (`d27d8f4`,
`src/lib/ai/` dizininin tamamen kaldırılması) **22:33**'te commit'lendi — yani kapı, kapattığı
ağacın son hâlini ölçmemiş olabilir. **Bu doğru bir itiraz ve önceki koşu bu boşluğu
taşıyordu.**

Bu turun koşusu boşluğu kapatıyor, üstelik fazlasıyla: koşu `aef5706` üzerinde yapıldı ve bu
commit `d27d8f4`'ten **sonra** gelen şu commit'lerin hepsini içeriyor:

```
aef5706  (bu koşunun HEAD'i)
290cc8c  fix(billing): gate checkout behind a session, and send a signed-out cart to login
72dd16f  fix(billing): stop leaking raw export errors to invoice downloads
fd49ba4  fix(admin): remove unevidenced RLS/status badges from console
0c09ef1  docs(memory): close the two-RAG note and record the tenantId sweep residue
fbab391  docs(agent-results): record TASK-MTU4AYW5R9DGL diagnosis, gate run and commit
2f692ab  docs(agent-results): correct the RAG merge report's shared-tree section
d27d8f4  refactor(k6): finish the RAG merge — one module, one search, no src/lib/ai  ← şüpheli commit
```

Yani `d27d8f4` bu koşuda ölçülmüş ağacın içinde ve kapı yeşil: RAG birleştirmesi kapıyı
kırmadı. **Dürüst kayıt için:** bu koşu benim çalışma ağacımdaki commit'lenmemiş
değişiklikleri de içeriyordu (aşağıdaki 4 dosya) ve ağaçta o sırada başka ajanların işi de
duruyordu; yani "yalnız `aef5706`" değil, "`aef5706` + o anki çalışma ağacı" ölçüldü. Bu,
kapının koştuğu her turda böyledir — paylaşılan ağaçta çalışıyoruz.

---

## 5. Değişen dosyalar

```
 scripts/seed-plan-e2e.ts           |  44 ++++++++++---     (yeni `lens` fixture + fixture başına `modules`)
 tests/e2e/module-gate.spec.ts      | 127 +++++++++++-----   (3 boş test → 3 ölçen test)
 tests/e2e/plan-entitlement.spec.ts |  50 +++++++------      (demo-tenant → kendi kiracısı)
 tests/e2e/fixtures/module-gate-tenant.ts                    (YENİ, 131 satır)
 docs/agent-results/TASK-MTUI9ZBK7W4JY-blok-zincir-dev.md    (YENİ, bu rapor)
```

**Temizlik:** `scripts/.tmp-probe.ts` (izlenmeyen, içinde `prisma.user.deleteMany` olan geçici
betik) silindi — depoda kalmadı.

**Dokunulmayanlar:** ağaçta aynı anda başka ajanların işi duruyordu (`src/lib/llm.ts`,
`src/lib/billing/*`, `src/modules/m6/*`, `.agentspace/memory/**`, diğer `docs/agent-results/*`).
`git add -A` / `git commit -a` **kullanılmadı**; yalnız yukarıdaki 5 yol adıyla eklendi.

---

## 6. Riskler

1. **`PIPELINE_HEADING` sabiti Türkçe ve i18n dışı.** `pipeline/board.tsx:327` başlığı
   `Fırsat & Teklif Boru Hattı` olarak **koda gömülü** yazıyor (CLAUDE.md §8 ihlali, benden
   önce var olan borç). Testim bu dizgeye tutunuyor; başlık i18n'e taşındığında test
   güncellenmeli. Bunu bu turda düzeltmedim — kapsam dışı ve ayrı bir kart.
2. **`seed-plan-e2e.rollback()` tüm fixture'ları siler.** `module-plan-gate` ve
   `plan-entitlement` ikisi de `beforeAll`'da `seed()` çağırdığı için sıralı koşuda
   (`workers: 1`, `fullyParallel: false`) bu güvenli. Playwright bir gün paralel dosya
   koşumuna alınırsa bu iki spec birbirinin kiracısını silebilir.
3. **Kendi fixture'ı olan e2e, rotanın *mevcut* kiracılarda çalıştığını kanıtlamaz.**
   ([[fabrika-e2e-own-fixture-hides-route-bugs]] — M6 panel rotası kendi fixture'ında yeşilken
   demo-tenant'ta sonsuz iskelette takılmıştı.) Bu spec `mg-e2e-tenant`'ta koşuyor; "pipeline
   ve evidence demo/beta kiracılarında açılıyor" demek için dogfood gerekir, bu test yetmez.
   Ölçtüğü şey kapı mantığı, rotanın veri sağlığı değil.
4. **`module-gate` fixture'ı `basic` planına bağlı.** Kataloğun `basic` grant'ı
   (M2/M3/M5) değişirse M3/M5 plan dışına düşer ve testler *entitlement* sebebiyle kırmızı
   olur — mesaj yine doğruyu söyler (`PLAN_UPGRADE_REQUIRED` görünür), ama sebep
   dosyanın konusu olmaz.

---

## 7. Açık sorular

1. **2 lint uyarısı** `docs/agent-results/**/*.mts` probe dosyalarından geliyor. Kapı
   `--max-warnings 0` kullanmıyor. `docs/agent-results/` eslint kapsamı dışına alınsın mı,
   yoksa uyarılar kalsın mı? (Benim dosyalarım değil, karar bende değil.)
2. **`module-gate.spec.ts`'in oturumsuz testi aslında `(app)` layout'unun auth kapısını
   ölçüyor**, modül kapısını değil. Dosya adı "module-gate". Ayrı bir `auth-boundary.spec.ts`
   daha dürüst olur mu, yoksa "bu sayfalara oturumsuz erişilemez" iddiası modül kapısı
   dosyasında kalsın mı?

---

## 8. Sonraki adım

- Kart `review`'a alınabilir: iki spec de ölçüyor, üçü de kanıtlanmış şekilde kırmızıya
  dönebiliyor, kapı yeşil.
- İsteğe bağlı takip: `pipeline/board.tsx` başlığını `t('...')`'e taşıyıp testi anahtara
  bağlamak (Risk 1).

---

## Platform beyanı

**mac** (darwin 25.6.0, Apple Silicon) üzerinde doğrulandı — `pnpm gate` tam koşu + Playwright
Chromium, gerçek tarayıcıda gerçek tıklama/yazma ile.

**Windows / Linux: koşulamadı** — bu turda o platformlarda makine yok. Koddan söyleyebileceğim:
dokunduğum dosyalarda **platforma bağlı hiçbir yol yok** — süreç öldürme, kabuk/ikili adı, mutlak
dosya yolu, DPI/ekran, mikrofon-kamera izni geçmiyor. Yazdıklarım POSIX-nötr TypeScript:
Prisma çağrıları, Playwright `page.goto`/`page.request` ve URL dizgeleri. Ekran görüntüsü yolları
`shotsDir()`'ten geliyor ve o zaten `node:path` yerine ileri-eğik-çizgi birleştirme kullanıp
`mkdirSync` ile dizini açıyor; Windows ileri eğik çizgiyi kabul eder. Tek gerçek platform
bağımlılığı Playwright'ın Chromium ikilisi, o da her üç platformda `playwright install` ile
geliyor. Yani bu değişikliklerin diğer platformlarda farklı davranmasını **beklemiyorum**, ama
**ölçmedim** — beyan bu.

---

## Kapı durumu

**YEŞİL.**

- **Komut:** `pnpm gate` (= `db:generate && lint && typecheck && test && i18n:check && rls:check && rls:verify && test:e2e`)
- **Commit:** `aef5706` (+ o andaki paylaşılan çalışma ağacı, benim 4 dosyam dahil)
- **Sonuç:** 8 aşamanın 8'i geçti — lint 0 hata (2 uyarı), tsc temiz, vitest **1670 passed / 8 skipped**,
  i18n iki katalog da 1436 anahtar ve eşit, RLS 44/44 tablo **canlı ölçümle** (`fabrika_app`,
  `rolbypassrls=false`) doğrulandı, e2e **146 passed / 1 skipped**. `ELIFECYCLE` yok.
- **Zamanlama sorusu kapandı:** bu koşu `d27d8f4`'ü (RAG birleştirmesi) içeren ağaç üzerinde
  yapıldı; önceki koşunun 4 dakikalık boşluğu artık ölçülmüş durumda.
