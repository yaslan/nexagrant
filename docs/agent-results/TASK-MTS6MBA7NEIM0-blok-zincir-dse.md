# TASK-MTS6MBA7NEIM0 — dört kırmızı e2e: M9 brief üretim hataları + fırsat arşivleme

**Ajan:** blok-zincir-dse (Tasarımcı) · **Dal:** dev · **Tarih:** 2026-09-08 · **Port:** 3110 (izole dev sunucusu)

---

## 1. Ne yapıldı

Dört kırmızının dördü de **aynı sınıf kök nedene** çıktı: spec'ler ekranı modül kapısının
arkasında buluyordu. Ölçülen kırılma noktası bir buton ya da bir aksiyon değil, iki *modül
kapısı gerçeği*ydi (`src/lib/modules/access.ts`): tenant'ın **planı** modülü kapsıyor mu ve
tenant'ın kendi **`ModuleState`** satırı açık mı. İkisinden biri eksikse sayfa yerine kilit
ekranı geliyor ve testin bütün seçicileri "element not found" ile düşüyor — kusur test edilen
özellikte değil.

### 1a. `tests/e2e/m9-brief-generate-failure.spec.ts` (3 kırmızı: :54, :116, :167)

Üç test de `signInAndOpenBriefs` sonrası ilk `fill`'de 60 sn timeout veriyordu. Sayfa
anlık görüntüsü (bu koşuda alındı, aşağıda):

```
- main:
  - alert:
    - heading "Bu modül şu anda kullanılamıyor" [level=1]
    - paragraph: "Meeting Briefs modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Ultra."
```

Spec `owner@demo.fabrika.test` ile giriş yapıp `/tr/fabrika-beta/opportunities/demo-opp-1/briefs`
açıyordu. Bu ikili artık tutarlı değil — canlı veritabanında ölçüldü:

| Ölçüm | Sonuç |
|---|---|
| `owner@demo.fabrika.test` membership tenant'ı | `cmtrhjys10001ncxk13gwtbcb` ("Owner Kuruluşu") |
| `demo-opp-1` tenant'ı | `demo-tenant` |
| `slug='fabrika-beta'` olan **workspace** | yok (bu bir **tenant** slug'ı) |
| `ModuleState` satırı, `moduleId='M9'` | tüm veritabanında **0 satır** |
| M9'u veren plan (`PLAN_GRANTS`) | yalnız `ultra` |

Yani hesap ne fırsatın sahibi, ne M9'u veren planda. Plan yarısı `15de510`
(*feat(authz): plan entitlement gates module access*, 09-07 20:43) ile eklendiğinde spec
sessizce kırmızıya döndü.

**Düzeltme:** spec, kendi kiracısını kuran mevcut fikstüre (`tests/e2e/fixtures/m9-tenant.ts` —
`ultra` Subscription + `ModuleState ON` + workspace + membership + Opportunity + kredi,
`afterAll`'da tamamen siliniyor) bağlandı. `m9-briefs-form.spec.ts` zaten bu fikstürle yeşil.
**Testin tek bir iddiası gevşetilmedi/atlanmadı** — değişen tek şey tarayıcının giriş yaptığı
kiracı: import bloğu, `BRIEFS_URL`, `signInAndOpenBriefs` gövdesi, `beforeAll/afterAll`.

### 1b. `tests/e2e/opportunity-archive.spec.ts:46` (:64 kartı ekranda yok)

Aynı sınıf, kapının öbür yarısı. Bu koşudaki sayfa anlık görüntüsü:

```
- main:
  - alert:
    - heading "Bu modül şu anda kullanılamıyor" [level=1]
    - paragraph: Proposal Production Workflows modülü kiracınızda kapalı.
```

`scripts/seed-archive-e2e.ts` tenant + workspace + user + membership + iki Opportunity
kuruyor ama **`ModuleState` satırı kurmuyordu**. `moduleGate('M5')` boru hattı tahtasına
`df6e7ab` (*feat(modules): automatic moduleGate enforcement on manifest-owned routes*,
09-07 19:23) ile geldi — fikstür (`ea8b5c8`, 14:41) ondan eskiydi. Satır yoksa varsayılan
`OFF`, dolayısıyla `MODULE_OFF` kilidi.

**Düzeltme:** fikstüre `ModuleState(M5) = ON` upsert'ü eklendi, rollback'e de silme.
Bilerek **Subscription eklenmedi**: `PLAN_GRANTS`'te `free` planı zaten M5 içeriyor
(`src/lib/billing/catalog.ts:374`), ve kilit mesajı da entitlement'ın geçtiğini
("kiracınızda kapalı", `PLAN_UPGRADE_REQUIRED` değil) söylüyordu — kendine plan yazan bir
fikstür ürünün gerçekte yaptığından azını test ederdi.

### 1c. Ek not — ekran görüntüsü yolu

İki spec de başka görevlerin kanıt klasörlerine (`TASK-MTQURC2H4E0WF-screenshots`,
`TASK-MTQZNBGENT12T-screenshots`) yazıyordu; her koşu o raporların kanıtını eziyordu.
İkisi de `docs/agent-results/TASK-MTS6MBA7NEIM0-screenshots/` altına alındı. Eski klasörler
**değiştirilmedi** (dosya zaman damgaları 09-07'de kaldı).

---

## 2. Kanıt (hepsi bu koşuda, 2026-09-08 08:01–08:03, port 3110)

### 2.1 Önce — dört kırmızı

```
$ E2E_PORT=3110 pnpm exec playwright test tests/e2e/m9-brief-generate-failure.spec.ts
Running 3 tests using 1 worker
  ✘  1 …m9-brief-generate-failure.spec.ts:54:7 › a dropped request surfaces in the band… (1.0m)
  ✘  2 …m9-brief-generate-failure.spec.ts:116:7 › an action that comes back with no brief… (1.0m)
  ✘  3 …m9-brief-generate-failure.spec.ts:167:7 › the happy path still ends with a brief… (1.0m)

    Error: locator.fill: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for getByRole('main').getByPlaceholder(/Ortak \/ Kurum Adı/)
```

```
$ E2E_PORT=3110 pnpm exec playwright test tests/e2e/opportunity-archive.spec.ts
    Error: expect(locator).toBeVisible() failed
    Locator: getByRole('main').getByText('Archive E2E — opportunity to archive')
    Error: element(s) not found
```

Kök nedenin doğrudan kanıtı — Playwright'in kaydettiği sayfa anlık görüntüleri
(`test-results/*/error-context.md`), §1a ve §1b'de alıntılandı: her iki ekranda da
`main` içinde yalnız modül-kilidi `alert`'ü var.

Veritabanı ölçümü (`prisma` üzerinden, tek seferlik sorgu):

```
user { id: 'cmtrhjyry0000ncxkbm1xnfma', email: 'owner@demo.fabrika.test' }
memberships [ { tenantId: 'cmtrhjys10001ncxk13gwtbcb', role: 'TENANT_OWNER', … } ]
workspaces fabrika-beta []
demo-opp-1 [ { id: 'demo-opp-1', tenantId: 'demo-tenant', workspaceId: 'demo-workspace', … } ]
M9 states []
```

### 2.2 Sonra — dördü de yeşil

```
$ E2E_PORT=3110 pnpm exec playwright test \
    tests/e2e/m9-brief-generate-failure.spec.ts \
    tests/e2e/m9-briefs-form.spec.ts \
    tests/e2e/opportunity-archive.spec.ts

Running 6 tests using 1 worker
  ✓  1 …m9-brief-generate-failure.spec.ts:70:7 › a dropped request surfaces in the band, keeps the form, and retries (2.3s)
  ✓  2 …m9-brief-generate-failure.spec.ts:132:7 › an action that comes back with no brief is reported, not ignored (1.3s)
  ✓  3 …m9-brief-generate-failure.spec.ts:183:7 › the happy path still ends with a brief and no band (2.1s)
  ✓  4 …m9-briefs-form.spec.ts:51:7 › a half-filled meeting time is reported inline, and no alert() is ever raised (1.3s)
  ✓  5 …m9-briefs-form.spec.ts:94:7 › the calendar button explains itself instead of raising alert() (1.3s)
[seed-archive-e2e] ready — tenant=archive-e2e-tenant opportunities=archive-e2e-opportunity,archive-e2e-opportunity-kept clearedEfforts=0 clearedAuditEvents=0
[seed-archive-e2e] rolled back
  ✓  6 …opportunity-archive.spec.ts:46:7 › archiving hides the opportunity everywhere but keeps the record (2.9s)

  6 passed (12.2s)
```

(4. ve 5. testler benim işim değil; aynı fikstürü paylaştıkları için birlikte koşturuldu —
fikstür çakışması olmadığının kanıtı.)

Bu koşuda üretilen ekran görüntüleri — `docs/agent-results/TASK-MTS6MBA7NEIM0-screenshots/`:

```
$ ls -la docs/agent-results/TASK-MTS6MBA7NEIM0-screenshots/
01-board-before-archive.png      02-effort-empty-state.png     03-effort-logged.png
04-archive-confirmation.png      05-board-after-archive.png    06-detail-404-after-archive.png
01-form-filled.png               02-generate-failed-band.png   03-retry-succeeded.png
04-empty-brief-band.png          05-band-mobile.png            06-happy-path.png
```

`02-generate-failed-band.png`: gerçek M9 formu (kilit ekranı değil), Fraunhofer Institute
dolu, Brüksel saati bandı, ve `role="alert"` hata bandı — *"Brief oluşturulamadı. Girdileriniz
formda duruyor — bağlantınızı kontrol edip yeniden deneyin."* + **Yeniden dene** / **Kapat**.
`01-board-before-archive.png`: gerçek boru hattı tahtası, G0 sütununda iki fikstür kartı.

### 2.3 Kapı

```
$ pnpm lint
✖ 9 problems (0 errors, 9 warnings)     ← hepsi mevcut, benim dosyalarımda değil

$ pnpm typecheck
$ tsc --noEmit                          ← çıktı yok, temiz

$ pnpm test
 Test Files  99 passed | 2 skipped (101)
      Tests  1127 passed | 8 skipped (1135)
```

### 2.4 Koşum ortamı (3000 kullanılmadı)

Port 3000'de başka bir worker'ın dev sunucusu var (pid 50803). Next.js 16 aynı dizinde
ikinci bir dev sunucusuna izin vermiyor (`.next/dev/lock`), Turbopack da proje kökünün
dışına çıkan symlink'i reddediyor. Çözüm: repo'nun `rsync` kopyası + `cp -Rc` (APFS clone)
ile kopyalanmış `node_modules`, scratchpad altında, `next dev --port 3110`. 3000'e hiç
dokunulmadı.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `tests/e2e/m9-brief-generate-failure.spec.ts` | `fixtures/m9-tenant` fikstürüne bağlandı (import, `BRIEFS_URL`, `signInAndOpenBriefs`, `beforeAll/afterAll`), kök-neden yorumu, `SHOTS` yolu. **İddialar değişmedi.** |
| `tests/e2e/opportunity-archive.spec.ts` | yalnız `SHOTS` yolu |
| `scripts/seed-archive-e2e.ts` | `ModuleState(M5)=ON` upsert + rollback'te silme, gerekçe yorumu |
| `docs/agent-results/TASK-MTS6MBA7NEIM0-screenshots/*` | bu koşuda üretilen 12 ekran görüntüsü |

Ürün kodu (`src/modules/m9/**`, `src/app/…/pipeline/**`) **değiştirilmedi** — kusur orada değildi.

---

## 4. Yolun üstünde görülen, DÜZELTİLMEYEN şeyler (bildirim)

1. **Aynı koşuda kırmızı olan, bana ait olmayan dört e2e** (tam süit, 3110):
   `tests/e2e/dashboard-outcome-case.spec.ts:34`, `tests/e2e/f10-absence-not-zero.spec.ts:140`,
   `tests/e2e/gate-tenant-isolation.spec.ts:33`, `tests/e2e/m10-audit-identity.spec.ts:54`.
   Dokunulmadı.
2. **URL'deki `[workspace]` segmenti dekoratif.** `src/lib/tenant.ts:99` (`requireTenantPage`)
   kiracıyı yalnız oturumdan çözüyor; slug hiç doğrulanmıyor. `01-board-before-archive.png`'de
   kenar çubuğu `/tr/archive-e2e-ws/...` üretiyor, oysa tenant slug'ı `archive-e2e`. Yanlış
   slug ile URL yazan kullanıcı kendi verisini görüyor — sızıntı değil ama URL yalan söylüyor.
3. **`fabrika-beta`'yı ödünç alan iki spec daha var:** `tests/e2e/identity-strings.spec.ts:61`
   ve `tests/e2e/identity-honesty.spec.ts:19` — `owner@demo.fabrika.test` + `/tr/fabrika-beta/…`.
   Şu an yeşiller (açtıkları sayfalar modül kapılı değil), ama aynı tuzağın üstünde duruyorlar.
4. **`next.config.ts:11`** yapılandırma yüklenirken `execSync('tsx scripts/i18n-check.ts')`
   çalıştırıyor; `tsx` PATH'te yoksa her dev/build başlangıcında
   `⚠️ Could not run i18n check` uyarısı basıyor. Zararsız ama i18n kontrolü fiilen çalışmıyor.

---

## 5. Riskler

- Fikstürler gerçek veritabanına yazıyor. İkisi de `afterAll`'da kendi kiracısını siliyor
  (`teardownM9Tenant`, `rollback`), yukarıdaki koşumda ikisinin de temizlendiği görüldü.
  Koşum yarıda kesilirse `m9-e2e-tenant` / `archive-e2e-tenant` artığı kalır; her ikisi de
  idempotent, sonraki koşum üstüne yazar.
- `ModuleState(M5)` fikstürü kiracıya özel; başka kiracıyı etkilemez.
- M9 mutlu yolu LLM anahtarı olmadan da geçiyor: `generateMeetingBrief` LLM hatasında
  `templateBrief`'e düşüyor ve krediyi düşmüyor (`src/modules/m9/server/actions.ts:74-77`).
  Yani bu test "AI metni doğru" demiyor, "brief kaydedildi ve ekrana geldi" diyor.

## 6. Açık sorular

- Modül-kapılı her e2e kendi kiracısını mı kurmalı (şu anki yaklaşım), yoksa paylaşılan bir
  "e2e ultra tenant" fikstürü mü olmalı? Şu an M9 ve arşiv iki ayrı fikstür; üçüncü bir
  modül-kapılı spec gelirse üçüncüsü yazılacak.
- `[workspace]` slug'ı doğrulanacak mı (bkz. §4.2)? Bu bir ürün kararı, tasarım değil.

## 7. Sonraki adım

- §4.1'deki dört kırmızı ilgili ajanlara; ilk üçü de kapı/kimlik sınıfına benziyor,
  aynı teşhis yöntemi (`test-results/*/error-context.md` içindeki `main` bloğuna bakmak)
  dakikalar içinde ayırt ediyor.
- §4.3'teki iki spec fikstüre alınabilir — kırmızı olmadan, tuzağa düşmeden.
