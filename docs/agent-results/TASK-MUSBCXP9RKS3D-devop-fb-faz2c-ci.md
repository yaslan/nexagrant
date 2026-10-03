---
sözleşme: 3
görev: TASK-MUSBCXP9RKS3D
kod: TASK-MUSBCXP9RKS3D
ajan: devop-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Kısmen bitti: start-mode koşusu bitti ve sayıldı (55 failed / 4 skipped / 26 did not run / 136 passed, 59.7 dk) — faz 2c'nin kendi spec'leri start'ta yeşil, kalan 52 kırmızı hâlâ demo formunda bekleyen henüz göç etmemiş spec'ler (A sınıfı), 2 evidence spec'i bilinen depo eksiği, registration-consent:84 ayrı triage ister; dal start modunda gate olacak durumda değil.
platform: Linux CI (GitHub Actions ubuntu-latest), `workflow_dispatch e2e_server=start`, run 37134974386. Yerelde Playwright koşulmadı (gerek yoktu; yerel koşu olmadığı için `pgrep -fl "playwright test"` kontrolü de gerekmedi). macOS'ta yalnız gh/jq/awk ile log okundu. Windows: koşulamadı, platform-bağımlı kod yolu yok (yalnız CI log analizi).
sürüm: 1
tarih: 2026-10-03T17:10:54.706Z
---

# faz2c start-mode CI kanıtı — fe-fb/e2e-prod-2c @4605b71f, run 37134974386: 55 kırmızı / 136 yeşil; 52'si demo form (A), 2 evidence (bilinen), 1 register formu (ayrı); m9-brief-generate-failure:71 YEŞİL

## 1. Ne yapıldı
- `gh workflow run ci.yml --ref fe-fb/e2e-prod-2c -f e2e_server=start` (input adı `e2e_server`, seçenekler `dev|start`, ci.yml doğrulandı) → run **37134974386**, head **4605b71f** (PR #16'nın o anki başı). 15:55:46 → 17:06:41 UTC (71 dk; E2E adımı 59.7 dk). Log `gh run view --log` ile çekildi, sayım satırı doğrudan okundu.
- Koşu bittikten sonra dal ilerledi: `d094d061` (2bbf6dad dev da3491a7 merge + "evidence fixture signIn waits for the evidence URL again"). Bu koşu talimattaki 4605b71f'i ölçer; d094d061 ölçülmedi.
- Aynı sırada dev'e PR #18 (CSP R2_ENDPOINT), #21 (E2E server env'de LLM anahtarları boş), #22 (m1-partner-outreach dış link mock) girdi; dev başı b2c1e6e4. Bu koşu onları içermez.

## 2. Kanıt
### 2a. Sayım satırı (log, `grep -E "  [0-9]+ (failed|passed|skipped|flaky|did not run)"`)
```
  E2E_WEB_SERVER: start
  55 failed
  4 skipped
  26 did not run
  136 passed (59.7m)
```
Tam kırmızı/atlanan satır listesi: `TASK-MUSBCXP9RKS3D-devop-fb-faz2c-ci/run-37134974386-red-lines.txt`.

### 2b. Kırmızıların sınıflandırması (55)
**A — hâlâ demo formunda (52 test, 24 dosya):** hepsi aynı imza: `locator.fill: Test timeout of 60000ms exceeded` / `waiting for locator('input[type="email"]')`, `/tr/giris` ya da `/en/login` sayfasında spec'in kendi `signIn()` yardımcısı. `DEMO_LOGIN_ENABLED=false` → form yok. Henüz `signInAs()`'a göçmemiş spec'ler:
```
calls-sedia-status 63/74/84/94/104/112 · m9-calendar-connect 76/103/119/131/152 · f10-absence-not-zero 66/87/100/128/145
st6-empty-tenant-no-fabrication 97/113/127/167 · fabricated-fallbacks 86/105/125/137 · m1-partner-outreach 81(en)/81(tr)/148
price-lock 100/123 · pipeline-dashboard-happy-path 101/141 · partb-template-identity 168(en)/168(tr) · module-plan-gate 86/122
m8-matching 231/323 · g0-computed-score 78/198 · admin-blog-persistence 81 · alert-console-truncation 59 · alerts-sweep-failure-console 100
billing-identity-form 82 · billing-invoice-history 69 · dashboard-outcome-case 81 · document-export-tenant-isolation 129
mobile-main-overflow 93 (beforeAll'daki fill, "Test ended") · plan-entitlement 101 · purge-failure-alert-console 96
qa-alert-console-probe 32 · relationship-owner-assign 104 · render-purity-refactor 146
```
Örnek (calls-sedia-status.spec.ts:63):
```
    Error: locator.fill: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for locator('input[type="email"]')
    > 54 |   await page.locator('input[type="email"]').fill(EMAIL);
```
**Bilinen B (2):** `evidence-fabrication.spec.ts:43:5` ve `evidence-unverified-badge.spec.ts:89:5` — `expect(locator).toBeVisible()` 30 sn; start modunda nesne deposu yok (PR #15 reddi). MinIO PR #17 + CSP PR #18 (merge edildi) ile kapanır; kanıt dalında start modunda yeşil görüldü (run 37135097509, bkz. TASK-MUSJ4RYVZEZ6Q raporu).
**Ayrı (1):** `registration-consent.spec.ts:84:5` — `/tr/register`'da `form` (görünür, e-posta alanlı) 60 sn içinde bulunamadı. Demo login değil; start modunda kayıt formunun render'ı ayrıca bakılmalı (B adayı, kanıt yetersiz).

### 2c. Beklenen kırmızı m9-brief-generate-failure:71 — YEŞİL
```
  ✓  123 m9-brief-generate-failure.spec.ts:71:7 › a dropped request surfaces in the band, keeps the form, and retries (2.5s)
  ✓  124 m9-brief-generate-failure.spec.ts:133:7 › an action that comes back with no brief is reported, not ignored (1.6s)
  ✓  125 m9-brief-generate-failure.spec.ts:184:7 › the happy path still ends with a brief and no band (1.5s)
```
Bu dalda (4605b71f, faz2c-final göçü) 3/3 geçti; crw2-fb'nin kök-neden araştırmasına girdi olarak: kırmızı dev-mode'a ya da eski başa özgü olabilir.

### 2d. Faz 2c'nin kendi kapsamı start'ta temiz
Dev + MinIO kanıt dalındaki (2c'siz) start koşusu 37135097509'da kırmızı olup bu koşuda **kırmızı olmayan** dosyalar: auth, concept-template-tenant-isolation, e2e-profile-save, gate-settings-readonly, gate-tenant-isolation, identity-strings, m6-evaluator, m9-brief-generate-failure, m9-brief-persistence, m9-briefs-form, m9-ics-download, module-gate, notfound-status, opportunity-archive, pipeline-note-author, relationship-tenant-isolation, saved-search → 2c'nin signInAs göçü / start-skip'i işini yapıyor.

### 2e. 26 "did not run" + 4 skipped
`-` işaretli 30 satır: serial `describe`'larda ilk kırmızıdan sonrası (mobile-main-overflow 11, relationship-owner-assign 3, registration-consent 2, identity-strings 2, document-export 1, price-lock-deeper-campaign 1 …) ve 2c'nin start-mode skip'leri. A sınıfı düzelince çoğu koşar.

## 3. Değişen dosyalar
Kod yok. Bu rapor + `…-faz2c-ci/run-37134974386-red-lines.txt`. `src/`, `.env*`, `playwright.config.ts`, `global-setup.ts` dokunulmadı.

## 4. Riskler
- Koşu 4605b71f'i ölçer; dal d094d061'e ilerledi ve dev'e #18/#21/#22 girdi — sayı güncel başta değişebilir (#21 LLM env ve #22 m1 mock A sınıfını değiştirmez ama yan etkileri olabilir).
- 52 A sınıfı spec'in signInAs'a göçü faz 2c kapsamı dışında kalmış görünüyor; start modu gate olabilmesi için ayrı faz gerekir.
- Start koşusu 71 dk; `timeout-minutes: 120` (PR #17) yeterli.

## 5. Açık sorular
- registration-consent:84 start modunda neden formu bulamıyor? (`test-results/registration-consent-…/error-context.md` CI artifact'ında.)
- m9-brief-generate-failure:71 bu dalda yeşilken crw2-fb'nin "kırmızı" gözlemi hangi baş/modda?

## 6. Sonraki adım
1. A sınıfı 24 dosyanın `signInAs()` göçü için kart (fe-fb/qae-fb). 2. d094d061 (ya da PR #16 merge sonrası dev) üzerinde start koşusunu tekrarla. 3. registration-consent:84 triage. 4. PR #17 merge → 2 evidence kırmızısı kapanır.
