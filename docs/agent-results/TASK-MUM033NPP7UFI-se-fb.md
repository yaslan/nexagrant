# TASK-MUM033NPP7UFI — FB E2E networkidle göçü (se-fb)

Sprint FB-GAP-1 · Kaynak: devop-fb TASK-MULXYMNTUELIK trace bulguları + crw-fb İNCELEME-6 Ö-1.

## 1. Ne yapıldı

- **Göç:** `tests/e2e` altındaki tüm `networkidle` beklemeleri (28 dosyada 54 kod satırı) testin gerçekten beklediği sinyale çevrildi. Buna 3 başarısız trace'in noktaları da dahil: `price-lock:74`, `plan-storefront:203`, `fixtures/m9-tenant:126`. Timeout artırılmadı, retry ya da skip eklenmedi. Karar kalıbı:

  | Durum                                                                           | Yerine konan                                                                                                                                                                                                          |
  | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Giriş/`goto` sonrası, ardından `expect(locator)` geliyor                        | Hiçbir şey. Locator auto-wait'i senkronizasyonu zaten sağlıyor (sign-in yardımcıları, reload'lar).                                                                                                                    |
  | Client state'e dokunan `click` / `check` / `selectOption` / `fill` öncesi       | `expectHydrated(hedef)` (`fixtures/hydration.ts`): Aylık toggle'ı, "Aday Bul", kart başlığı, Efor sekmesi, upload butonu, owner picker, billing formu, "Etkinleştir", alert satırı, kayıt onay kutusu, tema toggle'ı. |
  | `toHaveCount(0)` / `not.toContainText` ilk render'dan önce boşuna geçebilir     | Aynı render'dan pozitif bir çapa önce bekleniyor (plan-storefront ×3, opportunity-archive).                                                                                                                           |
  | Hidrasyon uyarısı ölçen specler (hydration-clean, theme-no-script-warning, st6) | Hidrate olan yüzey ya da `body` için `expectHydrated`. Mevcut `waitForTimeout(1500/500)` değerleri olduğu gibi kaldı, artırılmadı.                                                                                    |

- **Koruyucu kural:** `eslint.config.mjs` → `tests/e2e/**/*.ts` için `no-restricted-syntax` / `Literal[value='networkidle']` = **error**. Kural hem `waitForLoadState('networkidle')` hem `{ waitUntil: 'networkidle' }` biçimini yakalıyor. CI zaten `pnpm lint` koşuyor.
- **7 eski yorum** (auth, gate-tenant-isolation, m10, m9-calendar, module-plan-gate, fabricated-fallbacks, f10) yeniden yazıldı; "network-idle wait" ifadesi kullanıldı. Böylece `networkidle` literali yalnız `fixtures/hydration.ts` yorumunda kalıyor.
- **Ek (kapsam içi, `tests/e2e`):** göçten sonra kalan tek kırmızı `saved-search.spec.ts:49` idi ve networkidle dışı bir kök nedeni vardı (§4). Tek satırlık `expectHydrated` ile kapatıldı.

## 2. Kanıt

**DoD grep:**

```
$ grep -rn networkidle tests/e2e
tests/e2e/fixtures/hydration.ts:6: * `waitForLoadState('networkidle')` stood in for this and is not the same
```

**Lint kuralı gerçekten tetikleniyor** (geçici prob dosyası, sonra silindi):

```
tests/e2e/zz-probe.spec.ts
  3:31  error  Do not wait for 'networkidle' in E2E: next dev never goes idle (HMR websocket). ...  no-restricted-syntax
  4:39  error  Do not wait for 'networkidle' in E2E: ...  no-restricted-syntax
✖ 2 problems (2 errors, 0 warnings)   exit=1
```

Yerel: `npx eslint .` → exit 0 · `npx tsc --noEmit` → exit 0 (origin/dev tabanlı ayrık worktree).

**CI: son SHA `959bf02c` üzerinde 3 koşu, `E2E_WEB_SERVER=dev`:**

| Koşu                                                                        | Tetik             | Sonuç   | E2E                                       |
| --------------------------------------------------------------------------- | ----------------- | ------- | ----------------------------------------- |
| [36510434729](https://github.com/yaslan/fonbridge/actions/runs/36510434729) | push              | success | 177 passed, 1 skipped, 0 failed (14.3 dk) |
| [36510439038](https://github.com/yaslan/fonbridge/actions/runs/36510439038) | workflow_dispatch | success | 177 passed, 1 skipped, 0 failed (10.6 dk) |
| [36510445197](https://github.com/yaslan/fonbridge/actions/runs/36510445197) | workflow_dispatch | success | 177 passed, 1 skipped, 0 failed (14.5 dk) |

Skip: `price-lock-deeper-campaign.spec.ts:69`. Tasarım gereği atlanıyor, çünkü `BILLING_ACTIVE_TIER=ILK5` ile başlatılmış bir sunucu istiyor.

**Ara SHA `056e83f6` (yalnız göç) üzerinde 3 koşu:** [36508751097](https://github.com/yaslan/fonbridge/actions/runs/36508751097) failure: 174 passed, **1 failed (`saved-search`)**, 2 did not run. [36508795169](https://github.com/yaslan/fonbridge/actions/runs/36508795169) ve [36508801527](https://github.com/yaslan/fonbridge/actions/runs/36508801527) success, 177 passed.

**Karşılaştırma tabanı: göç öncesi `9d03f474` (devop-fb koşuları):** [36503809474](https://github.com/yaslan/fonbridge/actions/runs/36503809474) failure, `m9-ics-download.spec.ts:67` → `page.waitForLoadState: Test timeout of 60000ms exceeded` (m9-tenant fixture'ı üzerinden; bu göçle düzeldi). [36503812341](https://github.com/yaslan/fonbridge/actions/runs/36503812341) failure, `saved-search.spec.ts:49` → `waitForRequest` 30 sn. [36503806283](https://github.com/yaslan/fonbridge/actions/runs/36503806283) ölçüm sırasında 1 saati aşkın süredir "E2E Test" adımında asılı duruyordu.

## 3. Değişen dosyalar

origin/dev'e push edildi, iki commit:

- `056e83f6` test(e2e): wait for hydration or a locator, never networkidle; lint-ban it. 36 dosya: `eslint.config.mjs` + `tests/e2e/` altında alert-console-truncation, alerts-sweep-failure-console, auth, billing-identity-form, billing-invoice-history, evidence-fabrication, evidence-unverified-badge, f10-absence-not-zero, fabricated-fallbacks, fixtures/m9-tenant.ts, g0-computed-score, gate-tenant-isolation, hydration-clean, m10-audit-identity, m6-evaluator, m8-matching, m9-brief-persistence, m9-calendar-connect, module-plan-gate, opportunity-archive, partb-template-identity, pipeline-dashboard-happy-path, pipeline-note-author, plan-entitlement, plan-storefront, price-lock-deeper-campaign, price-lock, purge-failure-alert-console, qa-alert-console-probe, registration-consent, relationship-owner-assign, relationship-tenant-isolation, render-purity-refactor, st6-marketing-figures, theme-no-script-warning (`.spec.ts`).
- `959bf02c` test(e2e): saved-search types into the search box only once it is hydrated. 1 dosya.

`src/`, `ci.yml` ve `playwright.config.ts` dosyalarına dokunulmadı. Push, scratchpad'deki ayrık worktree'den (`origin/dev` tabanlı) yapıldı. **Yerel `dev`'e bu iki commit alınmadı:** yerel dev 37 commit ayrık durumda, patron kararı bekliyor, üstelik fe-fb'nin commit'lenmemiş işi var. Bu rapor yerel dev'e path'li commit'le eklendi ve origin/dev'e aynı yoldan cherry-pick edildi.

## 4. Riskler

- **saved-search kök nedeni (kapatıldı):** hata karesinde (artifact `e2e-results-36508751097-1/.../test-failed-1.png`) arama kutusu **boş ve odaklı** görünüyor. `fill(QUERY)` server-render işaretlemesine inmiş. React hidrasyonda controlled input'u `''` yapmış, bu yüzden debounce'lu `?q=` isteği hiç çıkmamış. Kök neden networkidle değil; ama aynı sınıf bir hata ("hidrasyondan önce etkileşim"). Taban `9d03f474`'te de aynı şekilde kırmızıydı.
- **CI'da çalışmayan dal:** `price-lock-deeper-campaign.spec.ts` içindeki iki `expectHydrated` beklemesi CI'da koşmuyor, çünkü spec skip ediliyor. Kalıp price-lock.spec ile birebir aynı ve o spec 6/6 koşuda yeşil. Yine de ILK5 sunucusuyla ayrıca koşulmadı.
- `expectHydrated(page.locator('body'))`: React 19'da `body` bir HostSingleton ve hidrasyonda props anahtarı alıyor (`acquireSingletonInstance`). Bu, kök kabuk hidratesinin sinyali. Suspense altındaki alt ağaçlar için mevcut `waitForTimeout(1500)` duruyor. theme/hydration-clean/st6 6/6 koşuda yeşil.
- Yerel Playwright AgentSpace kill-guard'a (R8) takılıyor. Bu yüzden spec'ler yerelde koşulmadı; tüm E2E doğrulaması CI'dan geliyor (kural gereği).

## 5. Açık sorular

- Yerel `dev`'e `056e83f6` ve `959bf02c` cherry-pick edilsin mi? Patron yerel dev kararını verene kadar bekletildi.
- `9d03f474`'teki 36503806283 koşusu 1 saati aşkın süre "E2E Test"te asılıydı; devop-fb bakmalı (bu göçle ilgisi yok).

## 6. Sonraki adım

- devop-fb: Göçten sonra `E2E_WEB_SERVER=dev` 6 koşunun 5'inde tamamen yeşil (tek kırmızı, düzeltilen saved-search). "start modu" tartışmasına gerek kalmadı.
- `docs/E2E_TESTING.md` §3.4'e "controlled input'a `fill` de hidrasyon ister" notu eklenebilir (bu kartın kapsamı dışında, `docs/`).

**Platform beyanı:** Kod değişikliği Playwright test kodu ve ESLint yapılandırmasından ibaret; platforma bağlı yol yok (süreç öldürme, dosya yolu ya da kabuk kullanılmıyor). E2E doğrulaması **Linux**'ta yapıldı (GitHub Actions `ubuntu` runner, chromium). Lint ve typecheck **mac**'te (darwin) koşuldu. Windows'ta koşulmadı: CI matrisinde Windows yok. Değişiklik yalnız Playwright API'si ve DOM kullanıyor, bu yüzden platform farkı beklenmiyor.
