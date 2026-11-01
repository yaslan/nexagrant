# AKTAR-MURBCJ0A-1 #gates — Stage-Gate ayarlarında sahte Kaydet kaldırıldı (fe-fb)

**Hüküm:** BAŞARILI. Sahte kaydetme kaldırıldı. Sayfa artık motorun gerçekten kullandığı değerleri salt okunur gösteriyor. RED → GREEN kanıtlandı, iki mutant öldü.
**Tip:** bug (canlıya çıkış denetimi kritik bulgusu cae-fb K-1)
**Platform:** mac (macOS 27.0.1, Node v26.5.0, Chromium/Playwright). Değişiklik platformdan bağımsız: süreç, dosya yolu, kabuk ya da kısayol kodu yok. Yalnız sunucu bileşeni, mesaj kataloğu ve CSS var. Windows ve Linux'ta koşulmadı (bu makinede yok). Koddan beklenen davranış aynı; CI Linux'ta aynı spec'leri koşar.
**Dal / ağaç:** `fe-fb/gates-readonly` (dev @542e64d8'den) · `/Users/macbook/alan/FONBRIDGE-wt-fefb-gates` · push YOK
**Commit'ler:** `2afbc920` kod + test · rapor commit'i bu dosyayla birlikte (SHA aşağıda §3'te)

## 1) Ne yapıldı

1. **Form tamamen kaldırıldı:** input'lar, Kaydet tuşu, `saving` state'i, `setTimeout(800)` ve `alert('Settings saved successfully!')` gitti. `'use client'` da kaldırıldı; sayfa artık **server component**. TR rotası `ayarlar/kapilar/page.tsx` aynı bileşeni re-export ediyor, dosyaya dokunulmadı.
2. **Değerler motorun okuduğu yerden okunuyor.** Kopyalanmış sayı yok:
   | Satır | Kaynak | Motorda kullanıldığı yer |
   |---|---|---|
   | G0 en düşük bileşik puan | `DEFAULT_GATE_RULES.G0.minScore` | `gates/evaluate.ts:133` |
   | G0 en düşük uyum alt puanı | `DEFAULT_G0_RULES.minAlignment` | `decideG0` (`g0-canonical.ts`) |
   | G0 en düşük taban oran (%) | `DEFAULT_G0_RULES.minBaseRate` | `decideG0` |
   | G0 ülke uygunluğu | `DEFAULT_G0_RULES.requireEligibleCountry` | `decideG0` |
   | G1 koordinatör geçmişi | `DEFAULT_GATE_RULES.G1` | `evaluate.ts:145`. **Yalnız kaydediliyor, kapıyı engellemiyor.** Sayfa bunu böyle yazıyor. |
   | G2 tüm koltuklar dolu | `DEFAULT_GATE_RULES.G2.requireAllSeatsFilled` | `evaluate.ts:152` |
   | G3 kriter / toplam eşiği | `DEFAULT_GATE_RULES.G3` | `evaluate.ts:161` |
   | G0 ağırlıkları + toplam | `resolveWeights(Tenant.settings)` | `computeG0` (`g0-compute.ts:319`) |
3. **Açık not (TR+EN):** "Bu değerler şu an platform genelinde sabittir ve çalışma alanı bazında değiştirilemez." Metinler `messages/{tr,en}.json` → `settings.gates` altında. Takvim ayar sayfasıyla aynı `getTranslations` düzeni kullanıldı. Sayfa artık i18n borcu taşımıyor; `i18n-baseline.json`'dan çıkarıldı (i18n:check "8 → 0, remove from the baseline" dedi).
4. **Erişilebilirlik:** Başlıklar tek h1 ve altı h2 (ölçüldü, §2). Değerler `<dl>/<dt>/<dd>` içinde. Breadcrumb `<nav aria-label>` ve `aria-current="page"` ile işaretli. Not `role="note"`. `text-muted` hiç kullanılmadı, yalnız `text-ink`/`text-ink-2` var. En düşük kontrast açık temada 9,56:1, koyu temada 12,49:1.
5. **E2E:** `tests/e2e/gate-settings-readonly.spec.ts` yazıldı. Kendi kiracı fixture'ı var: `tests/e2e/fixtures/gate-settings-tenant.ts`. Spec önce eski kodda RED görüldü, sonra GREEN.
6. **Yan düzeltmeler (değişikliğin doğrudan sonucu):**
   - `tests/e2e/mobile-main-overflow.spec.ts`'deki gate testi eski formun `form button[type=submit]`'ini bekliyordu ve adları kod anahtarlarıyla (`alignment`…) arıyordu. Değişiklikten sonra kırılacaktı. Test artık katalogdaki TR adlarını uzatıyor ve `weight-alignment` hydration'ını bekliyor. Bekçi gevşetilmedi; aynı 42 karakterlik bölünmez ek ve aynı genişlikler korunuyor.
   - `scripts/esr-calibration.ts`: üretilen raporda "/settings/gates hâlâ 'Minimum AI Alignment Score' diye etiketliyor" cümlesi vardı. Artık yanlış olduğu için güncellendi. `g0-canonical.ts` başındaki eski yorum da aynı sebeple düzeltildi.

### Görevden bilinçli sapma: ağırlıklar `DEFAULT_SCORING_WEIGHTS` yerine `resolveWeights(Tenant.settings)`
Keşifte bir şey çıktı: G0 skorlayıcısı ağırlıkları `Tenant.settings.scoringWeights`'ten kiracı bazında okuyor (`g0-compute.ts:82,319`). Uygulamada bu alana yazan bir ekran yok, ama DB'de bu alanı dolu olan bir kiracıya düz `DEFAULT_SCORING_WEIGHTS` gösterirsek sayfa yine yalan söyler. Bu, K-1'in aynısı olurdu. `resolveWeights` alan boşken `DEFAULT_SCORING_WEIGHTS`'i döndürüyor, yani tek doğruluk kaynağı korunuyor. Kiracıya özel değer varsa sayfa bunu bir cümleyle söylüyor ve değerin yanına "varsayılan 30" yazıyor. Okuma başarısız olursa varsayılanı uydurmuyor, "okunamadı" mesajı gösteriyor. Eski kod bu durumda da yanlıştı: RED ekranında kiracının ağırlığı 42 iken sayfa 30 gösteriyor (`before-tr.png`).

### Bilinçli olarak gösterilmeyenler
`G2.maxWeeksFromG0`, `G2.requireBudgetApproved` ve `G4.minHoursBeforeDeadline` `defaults.ts`'te tanımlı ama `evaluate.ts` bunları **uygulamıyor**. G4 için kodda zaten not var. Bunları göstermek "uygulanıyor" izlenimi verirdi, bu yüzden listeye girmedi.

## 2) Kanıt (kopyalanmış çıktı)

**RED — eski kod (542e64d8), yeni spec:**
```
  1) [chromium] › tests/e2e/gate-settings-readonly.spec.ts:38:9 › … › en: /en/sg-e2e/settings/gates shows the live thresholds and offers no save
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('main').getByRole('button', { name: /save|kaydet/i })
    Expected: 0
    Received: 1
  2) [chromium] › … › tr: /tr/sg-e2e/ayarlar/kapilar shows the live thresholds and offers no save
    Expected: 0
    Received: 1
```

**GREEN — yeni kod, son koşu (gate spec + overflow spec birlikte):**
```
  ✓   1 … gate-settings-readonly.spec.ts:38:9 › … › en: /en/sg-e2e/settings/gates shows the live thresholds and offers no save (1.8s)
  ✓   2 … gate-settings-readonly.spec.ts:38:9 › … › tr: /tr/sg-e2e/ayarlar/kapilar shows the live thresholds and offers no save (836ms)
  ✓   8 … mobile-main-overflow.spec.ts:93:9 › … › /tr/fabrika-beta/ayarlar/kapilar (1.6s)
  ✓   9 … mobile-main-overflow.spec.ts:93:9 › … › /tr/fabrika-beta/settings/gates (1.6s)
  ✓  13 … mobile-main-overflow.spec.ts:215:7 › … › gate settings: a longer weight name than today’s (2.3s)
  14 passed (35.9s)
```
Spec şunları doğruluyor. Kaydet tuşu yok (`count 0`). `<main>` içinde `input/select/textarea/form` yok. Hiçbir dialog açılmıyor. h1 ve not metni katalogdan geliyor. Şu değerler sabit import edilerek karşılaştırılıyor: G0 min skor = `DEFAULT_GATE_RULES.G0.minScore`, uyum = `DEFAULT_G0_RULES.minAlignment`, taban oran, G3 iki eşik. Ayrıca ağırlıklar: kiracı değeri 42 ve varsayılan `baseRate`. TR ve EN rotaları ayrı ayrı test ediliyor.

**Mutant testleri (testin gerçekten ısırdığı):**
```
M1 sayfa kiracı yerine DEFAULT_SCORING_WEIGHTS gösterir →
    Locator:  locator('main').getByTestId('weight-alignment')
    Expected: "42"
    Received: "30"          (2/2 ✘ — ÖLDÜ)
M2 ağırlık <dt>'sinden min-w-0 break-words kaldırılır →
    Error: gate settings at 320px: <main>.scrollWidth − clientWidth
    Expected: 0
    Received: 136           (✘ — ÖLDÜ)
```
İki mutanttan sonra da kod `page.bak`'tan geri yüklendi ve son GREEN koşusu geri yüklenmiş kodla yapıldı.

**typecheck / lint / i18n / birim:**
```
$ pnpm typecheck   → TC 0
$ pnpm lint        → LINT 0   ✖ 9 problems (0 errors, 9 warnings)   — uyarılar dokunulmamış dosyalarda:
                     src/lib/invitations/accept.ts, tests/e2e/e2e-profile-save.spec.ts, tests/settings-profile-update.test.ts
$ pnpm i18n:check  → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
$ vitest run (esr-calibration, g0-compute, g0-features, g0-scoring ×2, gates, i18n-check-script,
  i18n-hardcoded-detector, i18n, localized-routes, retired-brand-name, teardown-where-guard, where-guard-src)
   Test Files  13 passed (13)
        Tests  229 passed (229)
```
**Tam vitest süiti (`pnpm test`):** `27 failed | 284 passed`. Kalan 27 dosyanın hepsi `*.live.test.ts` ya da DB kullanan `plan-*/rls` spec'leri. Hata metni: `Authentication failed against the database server, the provided database credentials for fabrika_app are not valid`. Yerel 5433 DB'sinde `fabrika_app` rolünün parolası `.env` ile uyuşmuyor; bu bir ortam sorunu. Hiçbiri bu değişiklikte dokunulan dosyaları import etmiyor. Gizli kapı testleri (`retired-brand-name`, `where-guard-src`, `teardown-where-guard`) yukarıdaki hedefli koşuda yeşil.

**Duyarlılık ve kontrast (geçici ölçüm spec'i, commit'lenmedi):**
```
tr desktop overflowX=0 · tr tablet overflowX=0 · tr mobile overflowX=0
en desktop overflowX=0 · en tablet overflowX=0 · en mobile overflowX=0
H1 Aşama Kapısı Eşikleri | H2 G0 · Konu triyajı | H2 G1 · Rol kontrolü | H2 G2 · Konsorsiyum kilidi | H2 G3 · Değerlendirme | H2 G0 puanlama ağırlıkları
tr light lowest contrast: 9.56 rgb(51, 65, 85) Panel …
tr dark  lowest contrast: 12.49 rgb(203, 213, 225) En düşük bileşik G0 puanı …
main focusables: Panel | Ayarlar   (form alanı yok; klavyeyle yalnız breadcrumb bağlantıları)
```
**Fixture artığı yok:** `leftover tenant,user = [ 0, 0 ]`

**Ekran görüntüleri** (`docs/agent-results/AKTAR-MURBCJ0A-1/`):
- Önce: `before-tr.png`, `before-en.png`. Form, input ve Kaydet tuşu var; kiracı ağırlığı 42 iken "alignment 30" gösteriliyor.
- Sonra: `after-{tr,en}-{desktop,tablet,mobile}.png`, `after-{tr,en}-desktop-dark.png`, `after-{tr,en}-weights-{light,dark}.png`. Ağırlık görüntüsünde "Uyum 42 · varsayılan 30" ve "Toplam 112" görünüyor.

## 3) Değişen dosyalar
Commit `2afbc920`:
- `src/app/[locale]/(app)/[workspace]/settings/gates/page.tsx`: yeniden yazıldı; client form yerine salt okunur server component
- `messages/en.json`, `messages/tr.json`: `settings.gates` eklendi (+40/+40)
- `i18n-baseline.json`: gates sayfası satırı silindi
- `tests/e2e/gate-settings-readonly.spec.ts` (yeni) ve `tests/e2e/fixtures/gate-settings-tenant.ts` (yeni)
- `tests/e2e/mobile-main-overflow.spec.ts`: gate testi yeni yapıya uyarlandı
- `scripts/esr-calibration.ts`, `src/lib/scoring/g0-canonical.ts`: eskimiş "yanlış etiket" metni ve yorumu düzeltildi

Rapor commit'i: bu dosya ve `docs/agent-results/AKTAR-MURBCJ0A-1/*.png` (14 görsel).

## 4) Riskler
- **Kiracı ağırlık okuması:** sayfa artık bir DB okuması yapıyor (`withTenant` → `tenant.settings`). Okuma düşerse ağırlık bölümü "okunamadı" gösterir. Eşikler sabitlerden geldiği için görünmeye devam eder. Bu bilinçli bir tercih: varsayılanı uydurmak yerine hatayı göstermek.
- **G1 metni:** "kapıyı engellemez" ifadesi bugünkü `evaluate.ts` davranışını anlatıyor. Biri G1'i engelleyici yaparsa bu metin de güncellenmeli. Değer `G1.requireCoordinatorHistoryIfCoordinator`'a bağlı, ama "engellemez" ifadesi koda bağlı değil.
- **E2E ortamı:** Playwright koşucusu `.env`'i yüklemiyor. Yerelde `DATABASE_URL` dışarıdan verildi (`export DATABASE_URL=$(grep … .env)`). Diğer fixture'lı spec'lerle aynı durum, CI kendi env'ini veriyor.

## 5) Açık sorular
- Kalıcı, çalışma alanı bazlı kapı ayarı ayrı bir iş ve patron kararı bekliyor (kapsam dışı bırakıldı). Karar "evet" çıkarsa tablo/server action/doğrulama (negatif değer reddi dahil) o işte yapılmalı.
- `Tenant.settings.scoringWeights` bugün yalnız DB'den değiştirilebiliyor. Sayfa bunu "platform ekibi tanımlamış" diye anlatıyor. Bu alanın sahibi ve süreci netleşmeli.
- `defaults.ts`'te tanımlı ama uygulanmayan üç kural (G2 süre ve bütçe, G4 son tarih) ayrı bir kartla ya uygulanmalı ya da silinmeli.

## 6) Sonraki adım
- crw-fb incelemesi → `fe-fb/gates-readonly` dev'e merge (push/merge patron/lider onayıyla).
- Yerel `fabrika_app` parolası düzelince tam `pnpm test` izole DB'de yeniden koşulmalı (ortam işi, bu kartın değil).
