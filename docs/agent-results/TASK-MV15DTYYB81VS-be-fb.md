---
sözleşme: 3
biçim: html
sayfa: TASK-MV15DTYYB81VS-be-fb.html
görev: TASK-MV15DTYYB81VS
kod: TASK-MV15DTYYB81VS
ajan: be-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: TTO sayfası ve IP kontrol listesi yedeği iki dilde; tto/client.tsx sabit metni 27→0; lint, typecheck, tam unit, i18n:check ve M7 e2e 15/15 yeşil; PR #69 #68'in üstüne açıldı, merge edilmedi.
platform: mac (Darwin, Chromium headless 1234). Kod platforma bağlı değil (React istemcisi + sunucu eylemi + JSON katalog); Windows/Linux koşulmadı çünkü bu makinede yalnız mac var.
sürüm: 1
tarih: 2026-10-09T16:07:25.620Z
---

# CE-691 · M7 TTO sayfası i18n (tr + en)

TTO sayfasının tüm görünür metni m7.tto altına taşındı (tr + en).
- tto/client.tsx: 27 sabit metin → 0; dosya i18n temel listesinden çıktı.
- IP kontrol listesi yedek metni kullanıcının dilinde üretiliyor.
- lint 0 hata, typecheck geçti, i18n:check geçti.
- pnpm test (CI eşdeğeri): 4075 test geçti (+3 yeni).
- M7 e2e: 15/15. Yeni test 15, /en sayfasında Türkçe harf olmadığını doğruluyor.
- PR #69, #68'in dalının üstüne kuruldu. #68 merge edilince tabanı dev'e çevrilecek.

## Ne yapıldı
1. Dal `be-fb/m7-tto-i18n`, `be-fb/m7-module-unavailable` (#68) üstüne açıldı. Worktree: `/Users/macbook/alan/fb-worktrees/m7-tto-i18n`. **Karttan sapma:** kart "#68 merge edildikten sonra dev'den" diyordu. #68 henüz merge edilmediği için dal ona yığıldı (stacked); aynı dosyada çakışma olmaz. #68 merge edilince PR #69'un tabanı `dev`'e çevrilmeli.
2. `messages/{tr,en}.json` → `m7.tto` altına 11 grup eklendi: header, stats, trlValue, tabs, form, patentStatus, portfolio, roadmap, checklist, matcher, ipChecklistFallback. TR metinler birebir korundu; EN gerçek çeviri. Sayılar ICU argümanıyla veriliyor; "Hedef TRL" satırı `t.rich` + `<strong>` ile yazıldı. Kapatma butonuna `aria-label` eklendi (`matcher.close`).
3. `tto/client.tsx`'teki görünür metnin tamamı `t()` çağrısına taşındı. Görsel tasarıma dokunulmadı.
4. `m7/server/actions.ts`: LLM yedek kontrol listesi artık `createTranslator({ locale, messages, namespace: 'm7.tto' })` ile üretiliyor. Locale `promptLocale()`'dan geliyor. `getTranslations` seçilmedi, çünkü next-intl istek yapılandırması ister ve birim testte çalışmaz. Statik katalog deseni repoda zaten var (`src/lib/email/*`, `efatura.ts`). İkinci bir yükleyici açılmadı; prompt'lara dokunulmadı.
5. `i18n-baseline.json`: yalnız `tto/client.tsx` satırı silindi (27 → 0). Mandal bu dosyayı artık 0'da tutuyor.
6. Testler:
   - **Birim:** `tests/modules/m7.test.ts` içine tr/en yedek metin testleri ve TRL 9 tavanı eklendi (+3).
   - **E2E:** `tests/e2e/m7-tto-accelerator.spec.ts` içindeki Türkçe sabit seçiciler `tr.json`'dan okunuyor; assert'ler aynı kaldı. Yeni test 15 `/en`'de 4 ekranı (portföy, modal, kontrol listesi, yol haritası) dolaşıyor. `main` metninde `[ÇĞİÖŞÜçğıöşü]` olmamalı. `/tr` kontrolünde ise olmalı.
7. Kapı mantığı, `useActionErrorText` ve `Common.moduleUnavailable` değişmedi.

## Kanıt (ham çıktı)
- `grep -nE '[ÇĞİÖŞÜçğıöşü]' tto/client.tsx m7/server/actions.ts` → çıktı yok (exit 1)
- `pnpm i18n:check` → `Literals found: 272 in 33 file(s)` / `Baseline allows: 272 in 33 file(s)` / `✅ i18n check passed`
- `pnpm lint` → `✖ 4 problems (0 errors, 4 warnings)`; `pnpm typecheck` → exit 0
- `pnpm test` (CI eşdeğeri, `EVIDENCE_S3_TEST_*` unset) → `Test Files 319 passed | 18 skipped (337)`, `Tests 4075 passed | 447 skipped (4522)`, exit 0
- `pnpm test` (`.env.test` ham) → `1 failed | 318 passed`, yalnız `user-erasure-object-store` (ECONNREFUSED). CE-690'da origin/dev'de de aynı olduğu kanıtlandı.
- `pnpm exec playwright test tests/e2e/m7-tto-accelerator.spec.ts` → `15 passed (18.7s)`, exit 0
- **Önce kırmızı:** eski `actions.ts` ile birim → `2 failed | 10 passed` (en yedek ve TRL tavanı). Eski `client.tsx` + `actions.ts` ile e2e 15 → `getByRole('heading', { name: 'University TTO Portfolio & EU Call Matcher' })` bulunamadı, `1 failed`.

## Değişen dosyalar (commit `10ea66d3`)
`i18n-baseline.json`, `messages/en.json`, `messages/tr.json`, `src/app/[locale]/(app)/[workspace]/tto/client.tsx`, `src/modules/m7/server/actions.ts`, `tests/e2e/m7-tto-accelerator.spec.ts`, `tests/modules/m7.test.ts`

## PR
https://github.com/yaslan/fonbridge/pull/69. Taban `be-fb/m7-module-unavailable`. Merge edilmedi.

## Riskler
- PR yığılı: #68 değişirse #69 rebase ister. #68 merge edilince taban `dev`'e çevrilmeli.
- Kontrol listesi sekmesi Markdown'ı ham gösteriyor (`###`, `**`); bu eskiden beri böyle, kapsam dışı. Hazır listede, öğenin durumu ne olursa olsun "tescilli patent belgesi hazırlandı" maddesi işaretli geliyor; metin aynen taşındı, yalnız çevrildi. İkisi için ayrı kart önerilir.

## Definition of Done
- [ ] Dal, #68 merge edildikten sonraki dev tabanında: **sapma**, dal #68'e yığılı (yukarıda)
- [x] tto/client.tsx'te görünür sabit metin yok (grep boş, dedektör 0)
- [x] IP kontrol listesi yedeği locale'e göre; EN kullanıcı İngilizce görüyor
- [x] Her yeni anahtar iki katalogda; i18n:check temiz
- [x] lint, typecheck, tam unit ve M7 e2e yeşil; ham çıktılar yukarıda
- [x] /en'de Türkçe kalmadığını kanıtlayan e2e (test 15) geçiyor
- [x] TR ve EN ekran görüntüleri raporda
- [x] PR açık (#69), merge edilmedi
- [x] Platform: web; mac'te doğrulandı, kod platforma bağlı değil

Bu raporun sayfası: TASK-MV15DTYYB81VS-be-fb.html (AgentSpace Raporlar sekmesinde açılır).
