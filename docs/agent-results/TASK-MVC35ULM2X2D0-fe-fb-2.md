# TASK-MVC35ULM2X2D0 (FO-31): "İlk 100" ve "24 saat" BE sabitlerinden · fe-fb

> İkinci teslim. İlk rapor (`TASK-MVC35ULM2X2D0-fe-fb.md`) eski dal içindir ve olduğu gibi duruyor.

**Hüküm:** BİTTİ. Değişiklik güncel `origin/dev` (7f8d3de4, #78 dahil) üzerine açılan yeni `fe-fb/fo31-prereg-constants` dalında. PR `dev`'e açıldı, merge edilmedi.
**Platform:** mac (Darwin 27), Google Chrome (Playwright `channel: 'chrome'`, headless) + jsdom (vitest). Safari ve Firefox koşulmadı. Değişiklik bir sunucu bileşeni, ICU mesajları ve bir prop'tan ibaret. Tarayıcıya ya da işletim sistemine bağlı bir yol yok, Windows/Linux'ta da aynı davranır.

## Neden yeni dal
İlk teslim (c322bd9f + 41a7327c) PR #76'nın dalına push edildi. Ancak #76 o push'tan önce merge edilmişti (merge 4105f930, dal ucu 117a236f), bu yüzden FO-31 `dev`'e hiç girmedi (`git merge-base --is-ancestor c322bd9f origin/dev` → NOT_IN_DEV). İki commit güncel `origin/dev`'e cherry-pick edildi, çakışma çıkmadı. FO-23'ün (#78) metin anahtarlarına dokunmadığı doğrulandı. Doğrulama bu tabanda baştan yapıldı.

## Ne yapıldı
- **ICU parametreleri** (`messages/tr.json` ve `messages/en.json`, yalnız 5 anahtar):
  - `meta.description`, `hero.founder_open` (`{count}` korundu) ve `hero.founder_unknown` → `{limit}`
  - `success.verify` (`{email}` korundu) ve `verified.text_expired` → `{hours}`
- **`ExpertPreregPage.tsx`** (sunucu): `FOUNDER_SEAT_LIMIT` ve `VERIFY_TOKEN_TTL_MS` `constants.ts`'ten okunuyor. Metadata ve şerit `limit` alıyor. Forma `verifyHours={VERIFY_TOKEN_TTL_MS / 3_600_000}` iniyor.
- **`ExpertPreregForm.tsx`** (istemci): yeni `verifyHours: number` prop'u var, metin `t('success.verify', { email, hours })` ile kuruluyor. `constants.ts` istemciye import edilmiyor.
- **`ExpertVerifiedPage.tsx`**: import + `t(`text_${error}`, { hours })` satırı. Sayfanın geri kalanına dokunulmadı (FO-29'un alanı).
- **Testler** (`tests/expert-prereg-form.test.tsx`):
  - `verifyHours` artık props'la geçiriliyor.
  - `hours=48` ile başarı ekranında "48 saat" görünüyor, "24" görünmüyor.
  - tr ve en'de 5 anahtar `limit=150` / `hours=48` ile render ediliyor: "150" ve "48" var, `100` ve `24` yok.

## Kanıt (ham çıktı, yeni taban)
```
perl -e 'alarm 900;exec @ARGV' pnpm vitest run tests/expert-prereg-form.test.tsx
 Test Files  1 passed (1)
      Tests  18 passed (18)
pnpm lint        → ✖ 4 problems (0 errors, 4 warnings), exit 0; uyarıların hiçbiri dokunduğum dosyalarda değil
pnpm typecheck   → tsc --noEmit, exit 0
pnpm i18n:check  → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
E2E_PORT=3032 pnpm exec playwright test tests/e2e/expert-prereg.spec.ts → 5 passed (15.2s), 0 skipped (mailpit açık)
```
`node -e` taraması (ExpertPrereg altında `\b(100|24)\b` geçen metinler):
```
tr temiz
en temiz
```
`grep -rnE "\b(100|24)\b" src/components/expert-prereg` sonucunda ilgili bir sabit kalmadı. Kalan eşleşmeler:
- `ExpertPreregForm.tsx:122`: utm değerini `slice(0, 100)` ile kesme
- `paths.ts:15,19`: `parseFounderNumber` 1..100. Kart buna dokunmayı yasaklıyor, FO-29 kaldıracak.

Gerçek Chrome (`next dev -p 3031`, `SMTP_HOST=localhost SMTP_PORT=1025` → mailpit):
```
tr şerit: İlk 100 kayıt Kurucu Uzman: kalıcı rozet + ömür boyu Pro üyelik — kalan koltuk: 99
tr meta: Türkiye'nin doğrulanmış AB proje uzmanları rehberine ücretsiz ön kayıt. İlk 100 kayıt Kurucu Uzman rozeti ve ömür boyu Pro üyelik kazanır.
en şerit: The first 100 sign-ups become Founding Experts: permanent badge + lifetime Pro membership — seats left: 99
en meta: Free pre-registration for Türkiye's directory of verified EU project experts. The first 100 sign-ups become Founding Experts with a permanent badge and lifetime Pro membership.
tr expired: Doğrulama bağlantısı 24 saat geçerlidir. info@fonbridge.com adresine yazın, yeni bağlantı gönderelim.
en expired: Verification links are valid for 24 hours. Write to info@fonbridge.com and we will send you a new one.
success status: E-postanızı doğrulayın: fo31-1792227261274@example.test adresine gönderdiğimiz bağlantıya 24 saat içinde tıklayın. Doğrulanmayan kayıt rehbere alınmaz.
```
Form klavye ve tıklamayla dolduruldu: il combobox'ı, onay kutuları, KVKK, "Ön kaydı gönder".

Geçici `FOUNDER_SEAT_LIMIT = 150`, ardından `git checkout -- constants.ts`:
```
tr şerit: İlk 150 kayıt Kurucu Uzman: kalıcı rozet + ömür boyu Pro üyelik — kalan koltuk: 149
tr meta: … İlk 150 kayıt Kurucu Uzman rozeti ve ömür boyu Pro üyelik kazanır.
en şerit: The first 150 sign-ups become Founding Experts: permanent badge + lifetime Pro membership — seats left: 149
en meta: … The first 150 sign-ups become Founding Experts …
--- geri alındı, git diff:
(git diff --stat -- src/lib/expert-prereg/server/constants.ts boş)
```
FO-29 henüz dev'de değil, bu yüzden `?error=expired` URL'si hâlâ süresi dolmuş ekranını gösteriyor.

Kareler (`docs/agent-results/TASK-MVBIYE9O6JCQ7-evidence/`, yeni tabanda yeniden çekildi; önceki dosyalar ezilmedi):
- `fo31-dev-after-tr-uzman.png`, `fo31-dev-after-en-experts.png`
- `fo31-dev-after-success.png`: kare, "24 saat" satırı sabit navbar'ın altında kalmayacak biçimde kaydırıldı.
- `fo31-dev-after-tr-uzman-dogrulandi-expired.png`, `fo31-dev-after-en-experts-verified-expired.png`
- `fo31-dev-limit150-tr-uzman.png`, `fo31-dev-limit150-en-experts.png`

## Değişen dosyalar
- `messages/tr.json`, `messages/en.json` (yalnız 5 `ExpertPrereg` anahtarı)
- `src/components/expert-prereg/ExpertPreregPage.tsx`
- `src/components/expert-prereg/ExpertPreregForm.tsx`
- `src/components/expert-prereg/ExpertVerifiedPage.tsx` (import + 1 satır)
- `tests/expert-prereg-form.test.tsx`
- `docs/agent-results/TASK-MVBIYE9O6JCQ7-evidence/fo31-dev-*.png` (7 yeni kare; ilk teslimin `fo31-*.png` kareleri olduğu gibi duruyor)

## Riskler
- `VERIFY_TOKEN_TTL_MS` tam saate bölünmezse (ör. 90 dk) metinde "1.5 saat" görünür. Bugün 24 saat. Süre değişirse metnin birimi de gözden geçirilmeli.
- `/ 3_600_000` hesabı iki sunucu bileşeninde ayrı ayrı yazılı. `constants.ts`'e yardımcı eklemek kartın kapsamı dışında kaldı.
- Elle yapılan probe paylaşılan DB'de 2 `fo31-…@example.test` kaydı açtı. İkisi de `DELETE … RETURNING` ile silindi (çıktı: `DELETE 2`).
- Eski dal `fe-fb/uzman-on-kayit` üzerinde dev'e girmemiş iki commit duruyor (c322bd9f, 41a7327c). İçerikleri bu PR'da. O dal silinebilir; silme kararı lidere ait.

## Açık sorular
Yok.

## Sonraki adım
- crw2-fb: bu PR'da FO-31 (m2) incelemesi.
- FO-29 bu PR merge edildikten sonra `ExpertVerifiedPage.tsx`'e dokunmalı. O dosyada bu PR yalnız tek bir satırı değiştiriyor.
