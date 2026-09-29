# TASK-MULXYMNTUELIK — FB E2E kararlılığı (devop-fb)

**Sprint:** FB-GAP-1 · **Kaynak:** docs/agent-results/TASK-MULXF5M8J8AGY-crw-fb.md §3 Ö-1 · **Commit:** `9d03f474` (origin/dev) · **Platform:** CI = Linux (ubuntu-latest); yerel = macOS, yalnız gözlem ve analiz (yerel Playwright kill-guard'a takıldı, aşağıya bkz.)

## 1. Ne yapıldı

1. **Artifact (`.github/workflows/ci.yml`):** E2E ya da önceki bir adım başarısız olursa (`if: failure()`) `test-results/` ve `playwright-report/`, `e2e-results-<run_id>-<attempt>` adıyla yükleniyor (14 gün, `if-no-files-found: ignore`). `playwright.config.ts` CI'da `list`'e ek olarak `html` reporter'ı da açıyor (`open: 'never'`). Böylece `playwright-report/` gerçekten oluşuyor. Eski config yalnız `list` kullanıyordu, bu klasör hiç oluşmuyordu.
2. **Sunucu anahtarı (`playwright.config.ts`):** `E2E_WEB_SERVER=dev|start`. `dev` = `pnpm dev --port` (varsayılan, yerelde ve her push/PR'da). `start` = `pnpm start --port`, önceden `next build` gerektirir. `ci.yml`'e `workflow_dispatch` girdisi `e2e_server` (dev|start) eklendi. `start` seçilince E2E'den önce ayrı bir `Build for E2E (next build)` adımı koşuyor. Push ve PR koşuları her zaman `dev` kullanıyor.
3. **Demo giriş kilidi korunuyor:** `start` modunda `DEMO_LOGIN_ENABLED` verilmiyor. Production build bu bayrakla açılmıyor (`src/lib/demo-login.ts` `assertDemoLoginAllowed`, `src/instrumentation.ts` → `process.exit(1)`). Kilit bypass edilmedi. leed-fb kararı: kilit gevşetilmeyecek.
4. Timeout, retry ya da skip değişmedi. Spec dosyalarına dokunulmadı.

**Karar (leed-fb onayı):** CI'da E2E varsayılanı `dev` kalıyor. `start` anahtar olarak duruyor ama CI gate'inde kullanılmıyor. Gerekçe: specler demo giriş koltuklarıyla oturum açıyor (`grep -rlE "callback/credentials|/login'|/giris|…" tests/e2e` → 31 spec + 5 fixture; kaba bir desen, yani demo girişine bağlı ~30 spec). Production build demo girişini kasıtlı olarak reddediyor. `start`'a karşı bu specler tasarım gereği kırmızı olur. Bu, kararlılık değil kapsam kaybıdır.

## 2. Kanıt

### 2.1 Üç ardışık CI koşusu (`dev` sunucusu, commit `9d03f474`, üçü paralel başlatıldı)

| Koşu                                                                        | Olay                    | E2E sonucu                                     | E2E süresi                      | Artifact                             |
| --------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------- | ------------------------------- | ------------------------------------ |
| [36503801522](https://github.com/yaslan/fonbridge/actions/runs/36503801522) | push                    | 3 failed, 172 passed, 1 skipped, 2 did not run | 18 dk 15 sn (00:40:33→00:58:48) | `e2e-results-36503801522-1` (66 MB)  |
| [36503809474](https://github.com/yaslan/fonbridge/actions/runs/36503809474) | workflow_dispatch (dev) | 1 failed, 176 passed, 1 skipped                | 16 dk 41 sn                     | `e2e-results-36503809474-1` (4,4 MB) |
| [36503812341](https://github.com/yaslan/fonbridge/actions/runs/36503812341) | workflow_dispatch (dev) | 1 failed, 174 passed, 1 skipped, 2 did not run | 15 dk 26 sn                     | `e2e-results-36503812341-1` (21 MB)  |

Başarısız testler:

- 36503801522: `plan-storefront.spec.ts:200` (networkidle, :203), `price-lock.spec.ts:71` (networkidle, :74), `saved-search.spec.ts:49` (`page.waitForRequest` 30 sn, **farklı imza**)
- 36503809474: `m9-ics-download.spec.ts:67` (networkidle, `fixtures/m9-tenant.ts:126`)
- 36503812341: `saved-search.spec.ts:49` (`page.waitForRequest` 30 sn, farklı imza)

Sonuç: 5 kırmızının 3'ü yine `waitForLoadState('networkidle')` 60 sn imzası, yine farklı spec'lerde. `saved-search:49` iki koşuda networkidle dışı bir imzayla düştü. Bu kartın kapsamı değil, aşağıda §5'te.

### 2.2 Artifact indirilebiliyor

```
$ gh run download <run> -R yaslan/fonbridge -n e2e-results-<run>-1 -D art/<run>
36503801522 exit=0
36503809474 exit=0
36503812341 exit=0
art/36503801522/test-results/price-lock-…-a-stranger-the-list-price-chromium/trace.zip 11074167
art/36503801522/test-results/saved-search-…-creates-the-SavedSearch-row-chromium/trace.zip 10270422
art/36503801522/test-results/plan-storefront-a-private-…-rom-the-public-pricing-page-chromium/trace.zip 11150233
art/36503809474/test-results/m9-ics-download-…-eeps-one-identity-per-brief-chromium/trace.zip 1650514
art/36503812341/test-results/saved-search-…-creates-the-SavedSearch-row-chromium/trace.zip 9947267
```

Her artifact'ta `playwright-report/index.html` de var.

### 2.3 Trace analizi: networkidle'ın beklediği şey

Üç networkidle trace'inin `*.network` kayıtlarındaki son 4 olay (python ile `0-trace.network` okundu):

```
plan-storefront :203  (goto /tr/pricing → networkidle 740578 ms)
   00:52:54.019Z 200 /_next/image?url=%2Flogo.png&w=96
   00:52:54.701Z 200 /_next/static/chunks/[turbopack]_browser_dev_hmr-client_hmr-client_ts_1mojsay._.js
   00:52:54.726Z 101 ws://localhost:3000/_next/hmr?id=ZEaI0ZLDAQZbYGWXopZAp
   → sonra 58 sn hiç ağ olayı yok, 60 sn'de timeout
price-lock :74  (goto /tr/pricing → networkidle 815502 ms)
   00:54:09.071Z 200 /_next/image?url=%2Flogo.png&w=96
   00:54:09.762Z 200 …hmr-client_hmr-client_ts_1mojsay._.js
   00:54:09.787Z 101 ws://localhost:3000/_next/hmr?id=dQ2g4CTwroUxmVqbQ-HJA
   → sonra hiç ağ olayı yok, 00:55:09 timeout
m9-tenant.ts :126  (giriş → click → networkidle 554969 ms)
   00:49:36.530Z 304 …hmr-client_hmr-client_ts_1mojsay._.js
   00:49:36.655Z 101 ws://localhost:3000/_next/hmr?id=sml_4OJ3lWTodP-mVKTZs
   00:49:37.042Z 200 /__nextjs_font/geist-latin.woff2
```

Trace'te `[HMR] connected` console satırı da var. Sayfa yüklenmiş, `goto` `load` ile dönmüş (`after call@138`). Frame snapshot'ında localhost dışı URL yok, analitik ya da harici script yüklenmiyor. Kaydedilen HTTP isteklerinin hepsi yanıt almış.

**Kök neden adayı (kanıtlanmış değil, aday):** networkidle, dev modunda **Turbopack HMR websocket'ine (`ws://localhost:3000/_next/hmr`) ve ona bağlı HMR istemci akışına** takılıyor. Üç trace'te de `goto`'dan sonraki son ağ olayı bu bağlantı, ardından 58 sn sessizlik ve networkidle hiç oturmuyor. HMR yalnız `next dev`'de var. SSE, analitik ya da harici kaynak yok.

**Dürüst sınır:** Açık kalan isteğin _adı_ trace'ten okunamıyor. Playwright `.network` dosyasına yalnız **biten** istekleri yazıyor, askıda kalan istek hiç görünmüyor. Kanıt dolaylı: "son olay HMR, sonra sessizlik" üç trace'te de tekrarlanıyor. Kesin ad için `tests/e2e/fixtures/hydration.ts`'teki `InflightRequests` yardımcısı (timeout'ta açık istekleri adıyla yazıyor) bu spec'lere takılmalı. Bu, se-fb'nin taşıma kartıyla kendiliğinden gelir.

Yan gözlem: `[WebServer] ⨯ Error: The destination stream closed early.` (koşu başına 5–8) ve `⨯ Error: aborted` başarısız testlerin zaman damgalarıyla eşleşmiyor. Örneğin 36503801522'de 00:54:05–00:55:09 arasında sunucu log'unda yalnız bir `/logo.png` uyarısı var. Bunlar navigasyonla iptal edilen RSC akışları. Bu arızanın nedeni değiller.

### 2.4 `next build` + `next start` ölçümü

- Koşu [36503806283](https://github.com/yaslan/fonbridge/actions/runs/36503806283) (workflow_dispatch, `e2e_server=start`).
- `Build for E2E (next build)`: **başarılı, 1 dk 18 sn** (00:40:29→00:41:47). `experimental.authInterrupts` build'de sorun çıkarmadı. `output: 'standalone'` ile `next start` yalnız uyarı veriyor (`node_modules/next/dist/server/next.js:243`, hata değil).
- E2E sonucu: **71 failed, 88 passed, 1 skipped, 18 did not run; E2E 1 sa 18 dk** (00:41:47→02:00:04). Artifact `e2e-results-36503806283-1` yüklendi.
  - 71 kırmızının **tamamı demo giriş yokluğundan**: 65'i `locator.fill` timeout (`waiting for locator('input[type="email"]')`, demo e-posta alanı yok), 6'sı `toBeVisible` (ör. `registration-consent:72`, `disclosure-ack` formu yalnız demo girişte render ediliyor). Süreyi uzatan şey bu 60 sn'lik timeout'lar, sunucu değil.
  - **`page.waitForLoadState` hatası: 0** (`grep -c "Error: page.waitForLoadState"` → 0). dev koşularında düşen networkidle noktaları start'ta geçti: `plan-storefront.spec.ts:200` ✓, `price-lock.spec.ts:71` ✓, `registration-consent.spec.ts:72` networkidle'ı (:75) geçip :78'deki demo formunda düştü. `hydration-clean`, `theme-no-script-warning`, `st6-marketing-figures` (`waitUntil: 'networkidle'`) ✓.
  - Yorum: Bu HMR adayını **destekliyor**. Aynı networkidle çağrıları HMR websocket'i olmayan sunucuda hiç takılmadı. Tek koşu olduğu için kanıt değil, destek. `start`, gate olarak kullanılamaz (yukarıdaki karar). Kalıcı çözüm networkidle'ı kaldırmak (§6).

## 3. Değişen dosyalar

- `.github/workflows/ci.yml`: `workflow_dispatch` + `e2e_server` girdisi, koşullu `Build for E2E` adımı, `E2E_WEB_SERVER` env, başarısızlıkta artifact yükleme
- `playwright.config.ts`: `E2E_WEB_SERVER` anahtarı, start'ta `DEMO_LOGIN_ENABLED` yok, CI'da html reporter
- `docs/agent-results/TASK-MULXYMNTUELIK-devop-fb.md` (bu rapor)

Geri alma: `git revert 9d03f474`. Tek commit, iki dosya, veri ya da şema etkisi yok.

## 4. Riskler

- E2E gate `dev`'de hâlâ kırmızı. Bu kart gözlemlenebilirlik ekledi, networkidle'ı düzeltmedi. Düzeltme se-fb'ye devredildi (§6).
- Artifact boyutu: başarısız test başına ~10 MB trace. Çok kırmızılı bir koşu yüzlerce MB tutabilir. 14 gün saklama bunu sınırlıyor.
- Üç koşu aynı commit'te paralel başlatıldı. Postgres her runner'da ayrı servis container'ı, yani koşular birbirini etkilemiyor.

## 5. Açık sorular / kapsam dışı bulgular

- **`saved-search.spec.ts:49`**: 3 koşunun 2'sinde `page.waitForRequest: Timeout 30000ms`, networkidle dışı yeni bir imza (Aramayı Kaydet tıklaması istek üretmiyor; muhtemelen hidrasyon öncesi tıklama). Ayrı kart önerilir. Bu da `expectHydrated` ile çözülebilir.
- Her koşuda `DriverAdapterError: NullConstraintViolation` ve `[users-scheduled-deletion] failed for user purge-alert-s-…` log satırları var. Testler geçiyor, bunlar kasıtlı hata senaryosu gibi duruyor. Doğrulanmadı.
- `instrumentation.ts:18` `process.exit` için "Edge Runtime" uyarısı her derlemede log'u şişiriyor (koşu başına binlerce satır). Zararsız ama log okumayı zorlaştırıyor.

## 6. Sonraki adım: se-fb devir listesi

leed-fb, networkidle kullananların `tests/e2e/fixtures/hydration.ts` (`expectHydrated` + `InflightRequests`) ile değiştirilmesi için se-fb'ye ayrı kart açıyor. `grep -rc networkidle tests/e2e` → **36 dosya, 64 kullanım** (dosya başına sayı parantez içinde):

- `tests/e2e/alert-console-truncation.spec.ts` (1)
- `tests/e2e/alerts-sweep-failure-console.spec.ts` (1)
- `tests/e2e/auth.spec.ts` (1)
- `tests/e2e/billing-identity-form.spec.ts` (2)
- `tests/e2e/billing-invoice-history.spec.ts` (1)
- `tests/e2e/evidence-fabrication.spec.ts` (1)
- `tests/e2e/evidence-unverified-badge.spec.ts` (1)
- `tests/e2e/f10-absence-not-zero.spec.ts` (1)
- `tests/e2e/fabricated-fallbacks.spec.ts` (1)
- `tests/e2e/fixtures/hydration.ts` (1)
- `tests/e2e/fixtures/m9-tenant.ts` (1)
- `tests/e2e/g0-computed-score.spec.ts` (5)
- `tests/e2e/gate-tenant-isolation.spec.ts` (1)
- `tests/e2e/hydration-clean.spec.ts` (4)
- `tests/e2e/m10-audit-identity.spec.ts` (1)
- `tests/e2e/m6-evaluator.spec.ts` (3)
- `tests/e2e/m8-matching.spec.ts` (2)
- `tests/e2e/m9-brief-persistence.spec.ts` (2)
- `tests/e2e/m9-calendar-connect.spec.ts` (1)
- `tests/e2e/module-plan-gate.spec.ts` (1)
- `tests/e2e/opportunity-archive.spec.ts` (3)
- `tests/e2e/partb-template-identity.spec.ts` (1)
- `tests/e2e/pipeline-dashboard-happy-path.spec.ts` (1)
- `tests/e2e/pipeline-note-author.spec.ts` (1)
- `tests/e2e/plan-entitlement.spec.ts` (2)
- `tests/e2e/plan-storefront.spec.ts` (7)
- `tests/e2e/price-lock-deeper-campaign.spec.ts` (2)
- `tests/e2e/price-lock.spec.ts` (2)
- `tests/e2e/purge-failure-alert-console.spec.ts` (1)
- `tests/e2e/qa-alert-console-probe.spec.ts` (1)
- `tests/e2e/registration-consent.spec.ts` (2)
- `tests/e2e/relationship-owner-assign.spec.ts` (1)
- `tests/e2e/relationship-tenant-isolation.spec.ts` (2)
- `tests/e2e/render-purity-refactor.spec.ts` (1)
- `tests/e2e/st6-marketing-figures.spec.ts` (3)
- `tests/e2e/theme-no-script-warning.spec.ts` (2)

Notlar: `fixtures/hydration.ts`'teki eşleşme yalnız yorum, taşınacak kod değil. `fixtures/m9-tenant.ts:126` ortak bir yardımcı, bu run'da düşen m9-ics-download buradan geçiyor ve önce bu düzeltilmeli. `hydration-clean.spec.ts` `goto`/`reload` `waitUntil: 'networkidle'` kullanıyor ve hidrasyon uyarılarını topladığı için bekleme koşulu testin kendisi. se-fb orada ayrıca karar vermeli.

## Platform beyanı

Doğrulama **Linux**'ta yapıldı (GitHub Actions ubuntu-latest, 4 koşu). Analiz macOS'ta yapıldı (artifact indirme, trace ayrıştırma). Değişiklik yalnız CI YAML'ı ve Playwright config'i; platforma bağlı kod yolu yok (`pnpm dev|start --port`, env değişkeni). Yerel `playwright test` macOS'ta **koşulamadı**: AgentSpace kill-guard'ı (R8, canlı uygulama açıkken playwright yasak) çalıştırmayı reddetti. Yerel `next build` worktree'de node_modules olmadığı için anlamlı sonuç vermedi, build ölçümü CI'dan alındı. Windows koşulmadı: CI matrisi yalnız ubuntu ve kartın kapsamı CI.
