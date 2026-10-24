---
görev: TASK-MVIAOEGRE2JJT
kod: TASK-MVIAOEGRE2JJT
ajan: be-fb
motor: claude
tip: kod
hüküm: Bitti — PUSH HAZIR (push yapılmadı). crw2-fb 2. turdaki D1 ve D2 kapandı; tam gate yeşil (GATE_RC=0).
platform: mac (darwin) üzerinde doğrulandı. Değişen kod Next.js/next-intl/Prisma; platforma özgü yol yok. Windows ve Linux koşulamadı: ofiste Windows makinesi yok, Linux CI bu worktree'de çalıştırılmadı.
tarih: 2026-10-23
---

# FO-113 #rebase2 (be-fb) — crw2-fb 2. tur düzeltmeleri

**Dal:** `be-fb/fo113-interreg-review` (worktree `.claude/worktrees/fo113-review`)
**Yeni commit:** `f314e38f` — D1 (/en filtre metinleri) + D2 (ICU plural). Push edilmedi.
**Taban:** origin/dev'e rebase'li, önceki commit'ler (`37b44520`, `0a260472`, `2823b8eb`, `73fdf567`) dokunulmadı.

## Ne yapıldı

crw2-fb'nin `docs/agent-results/TASK-MVIAOEGRE2JJT-crw2-fb-2.md` raporundaki iki bulgu:

- **D1 — /en'de Türkçe sabitler.** Kapatıldı.
  - `PartnerFilters.tsx`: ülke placeholder'ı (`filterCountryPlaceholder`) ve tip seçenekleri (`activityTypeHES|REC|PRC|PUB|OTH`) `partnersPage.*` anahtarlarına taşındı.
  - `partners/page.tsx`: aktif filtre çipleri (`chipSearch`, `chipCountry`, `chipType`) çevrildi.
  - `i18n-baseline.json`: iki dosya (`PartnerFilters.tsx` 10→0, `page.tsx` 6→0) baseline'dan düşürüldü. Diff yalnızca bu iki satır (`--update-baseline` ile).
  - Yeni anahtarlar hem `messages/en.json` hem `messages/tr.json` içinde.
- **D2 — ICU plural.** Kapatıldı.
  - `minProjectsTag`, `minProjectsOption`, `foundInterreg`, `foundAll` EN'de `{count, plural, one {…} other {…}}`. TR'de sayıdan sonra tekil kaldığı için değişmedi.
  - `page.tsx`: `count` artık `totalCount.toLocaleString()` (locale'siz string) yerine sayı olarak geçiyor; böylece `/tr` sayısı `1.234` biçiminde kalır ve plural seçimi doğru çalışır.

K1, K3, K4 önceki turda kapanmıştı; bu turda dokunulmadı.

## Kanıt (ham çıktı)

**Typecheck**
```
$ tsc --noEmit
TC_RC=0
```

**i18n:check** (baseline güncellendikten sonra)
```
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
I18N_RC=0
```

**Hedefli vitest** (kartın listesi + crw2-fb'nin istediği dosyalar)
```
 Test Files  6 passed (6)
      Tests  72 passed (72)
```

**Tam gate** — `pnpm gate`, izole DB (`127.0.0.1:5714/fabrika`, pgvector pg16), `E2E_PORT=3512`, mailpit paylaşımlı `fabrika-mailpit`. Log: `scratchpad/gate-fo113r2.log`.
```
$ eslint            → 0 error (uyarılar var, log satır 14-30)
$ tsc --noEmit      → ok
$ vitest run        → Test Files 383 passed | 8 skipped (391)
                      Tests       5038 passed | 123 skipped (5161)
$ i18n:check        → ✅ i18n check passed
$ rls:check         → ✅ SUCCESS: All 48 tenant-scoped models have RLS policies registered.
$ rls:verify        → ✅ 48 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
$ db:rls-role       → ✅ fabrika_app already exists; password left unchanged.
$ test:e2e          → 386 passed, 9 skipped (10.1m)
  ✓ 238 [chromium] › tests/e2e/module-entry-points.spec.ts:77:7 › sidebar: every module entry comes from a manifest and opens its page (M5, M1, M2, M3, M4)
$ alerts:check      → ✅ Öksüz alarm yok
GATE_RC=0
```

**Skipped nedeni:** vitest 123 test ve e2e 9 test atlandı. Log'da atlama nedeni açık yazılı değil. Gate `CI=true` olmadan koştu; `*.live.test.ts` dosyaları bu koşulda atlanmış olabilir. Bu doğrulanmadı. Canlı testler crw2-fb tarafından `CI=true` ile ayrıca koşulmuştu (3/3).

**crw2-fb-2 maddeleri, tek tek:**

| Madde | Durum | Kanıt |
|---|---|---|
| D1 · /en'de Türkçe sabitler | kapandı | `f314e38f`; tarayıcı testi (aşağıda) |
| D1 · baseline 0'a çekildi | kapandı | `i18n-baseline.json` diff: 2 satır silindi |
| D2 · ICU plural (EN) | kapandı | `en.json` 4 anahtar plural; `page.tsx` sayı geçiyor |
| K1, K3, K4 | önceki turda kapandı, değişmedi | — |

**Gerçek tarayıcı doğrulaması** (geçici Playwright spec, commit edilmedi, silindi). `/en/main/partners?q=metu&country=DE&activity_type=HES&is_interreg=true&min_projects=1` ve aynı `/tr` URL'si; oturum `seedIdentity` + `signInAs` ile.
```
[en] filter+chip text:
  Organization Name or Keyword / Country Code / Activity Type / All Types
  HES (Higher Education) / REC (Research) / PRC (Private Company) / PUB (Public Body) / OTH (Other)
  Min. Projects / Any / ≥ 1 Project / ≥ 5 Projects / ≥ 10 Projects / ≥ 25 Projects
  Active Filters: Search: "metu" / Country: DE / Type: HES / 🇪🇺 Interreg Partners / Min. 1 Project
2 passed (9.4s)
```
Türkçe işaretleri (`Örn`, `Arama:`, `Ülke:`, `Tip:`, `Kurum Adı`, `Yükseköğretim`, `Araştırma`, `Özel Şirket`, `Kamu Kurumu`, `Diğer`, `Tüm Tipler`) /en filtre UI'ında yok; assert geçti.

Ekran görüntüleri: `docs/artifacts/TASK-MVIAOEGRE2JJT/`
- `en-partners-full.png` — görsel olarak kontrol edildi: `Found 0 Interreg Partner Profiles` (EN plural), çipler İngilizce, `Min. 1 Project` tekil.
- `en-partners-filters.png`, `en-partners-chips.png`
- `tr-partners-full.png`, `tr-partners-filters.png`, `tr-partners-chips.png` — dosyalar üretildi; TR görseli görsel olarak incelenmedi, yalnızca metin tarafı kontrol edildi.

## Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/partners/PartnerFilters.tsx`
- `src/app/[locale]/(app)/[workspace]/partners/page.tsx`
- `messages/en.json`, `messages/tr.json`
- `i18n-baseline.json`
- `docs/artifacts/TASK-MVIAOEGRE2JJT/` (6 PNG)
- `docs/agent-results/TASK-MVIAOEGRE2JJT-be-fb-rebase-2.md` (bu dosya)

Commit ayrımı: kod `f314e38f`; ekran görüntüleri ve rapor ayrı docs commit'inde.

## Riskler

- **Tam gate tek koşuda yeşil ama skip nedeni doğrulanmadı** (123 vitest + 9 e2e atlandı). Canlı testlerin ayrıca `CI=true` ile koşulması gerekiyorsa crw2-fb'nin koşusu hâlâ geçerli.
- **`partners/[pic]/page.tsx` ve `partners/leaders/page.tsx` hâlâ `isTr ?` kullanıyor** (ör. `[pic]/page.tsx:107-175`). crw2-fb bunları kapsam dışı bırakmış ve ayrı kart önermişti. /en'de bu sayfalarda Türkçe metin görünür; kart DoD'undaki "/en'de Türkçe metin kalmamalı" maddesi yalnızca `/partners` listesi için karşılandı.
- **Lint uyarıları:** 0 error, birkaç `no-unused-vars` uyarısı (log satır 14-30) — bu dalın değişikliğinden değil, önceden vardı.
- **Windows/Linux koşulamadı.**
- **Önceki gate koşusu** (`GATE_RC=1`, log `scratchpad/gate.log`) plan-repository testlerinde paylaşımlı DB hatasıyla düşmüştü; bu tur izole DB ile tamamen yeşil.

## Açık sorular

- `[pic]` ve `leaders` sayfalarındaki `isTr` kullanımı bu kartta mı yoksa ayrı kartta mı kapansın? Öneri: ayrı kart; crw2-fb da aynı öneriyi yapmıştı.
- Push onayı: dal `be-fb/fo113-interreg-review` push edilecek mi? Yazan karar lidere ait; bu rapor push yapmadı.

## Sonraki adım

1. Lider onayı: `be-fb/fo113-interreg-review` push.
2. crw2-fb yalnızca D1/D2 farkını yeniden incelesin (K1, K3, K4 kapalı kalır).
3. `[pic]`/`leaders` i18n işi ayrı kartta.

**PUSH HAZIR: be-fb/fo113-interreg-review @ (rapor commit'i sonrası SHA — aşağıda)**
