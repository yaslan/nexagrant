# TASK-MVC35ULM2X2D0 (FO-31): "İlk 100" ve "24 saat" BE sabitlerinden · fe-fb

**Hüküm:** BİTTİ. Değişiklik PR #76'nın dalına (`fe-fb/uzman-on-kayit`) push edildi, merge edilmedi.
**Platform:** mac (Darwin 27), Chromium (Playwright headless) + jsdom (vitest). Safari ve Firefox koşulmadı. Değişiklik sunucu bileşeni, ICU mesajı ve bir prop'tan ibaret; tarayıcıya ya da işletim sistemine bağlı bir yol yok. Windows/Linux'ta da aynı.

## Ne yapıldı
- **ICU parametreleri** (`messages/tr.json`, `messages/en.json`, yalnız 5 anahtar):
  - `meta.description`, `hero.founder_open` (`{count}` kaldı) ve `hero.founder_unknown` → `{limit}`
  - `success.verify` (`{email}` kaldı) ve `verified.text_expired` → `{hours}`
- **`ExpertPreregPage.tsx`** (sunucu): `FOUNDER_SEAT_LIMIT` ve `VERIFY_TOKEN_TTL_MS` `constants.ts`'ten okunuyor. Metadata ve şeritte `limit` geçiriliyor; forma `verifyHours={VERIFY_TOKEN_TTL_MS / 3_600_000}` iniyor.
- **`ExpertPreregForm.tsx`** (istemci): yeni `verifyHours: number` prop'u → `t('success.verify', { email, hours })`. `constants.ts` istemciye import edilmiyor.
- **`ExpertVerifiedPage.tsx`**: import satırı + `t(`text_${error}`, { hours })` satırı. Anahtar dinamik olduğundan `text_invalid` da `hours` alıyor ama kullanmıyor (ICU fazla parametreyi yok sayar). Sayfanın geri kalanına dokunulmadı (FO-29).
- **Testler** (`tests/expert-prereg-form.test.tsx`):
  - `renderForm` artık `verifyHours` geçiriyor (varsayılan 24).
  - Yeni: `verifyHours=48` ile başarı ekranında "48 saat" var, "24" yok.
  - Yeni: tr ve en'de 5 anahtar `limit=150` / `hours=48` ile render ediliyor; "150"/"48" var, `100`/`24` yok.
- Dal önce güncel `origin/dev` ile birleştirildi (#73).

## Kanıt (ham çıktı)
Kırmızı (değişiklik öncesi, yeni testler):
```
× the success screen states the verify window it was given
× founder and verify copy takes limit/hours as parameters (tr)
× founder and verify copy takes limit/hours as parameters (en)
AssertionError: expected 'E-postanızı doğrulayın: ayse@example.…' to contain '48 saat'
AssertionError: expected 'Türkiye\'nin doğrulanmış AB proje uzm…' to contain '150'
Tests  3 failed | 15 passed (18)
```
Yeşil: `perl -e 'alarm 900;exec @ARGV' pnpm vitest run tests/expert-prereg-form.test.tsx` → `Tests  18 passed (18)`

`node -e` taraması (ExpertPrereg altında `\b(100|24)\b` geçen metinler):
```
tr ExpertPrereg içinde 100/24 geçen: []
en ExpertPrereg içinde 100/24 geçen: []
```
`grep -rn "100\|24" src/components/expert-prereg` → ilgili sabit yok. Kalanlar CSS (`calc(100%…)`, `-left-[10000px]`), utm kesme `slice(0, 100)` ve `paths.ts`'teki `parseFounderNumber` 1..100. Sonuncusunu FO-29 silecek; kart ona dokunmayı yasaklıyor.

Gerçek Chromium (dev sunucusu, mailpit SMTP):
```
after /tr/uzman      strip "İlk 100 kayıt Kurucu Uzman: … — kalan koltuk: 99"  meta "… İlk 100 kayıt Kurucu Uzman rozeti …"
after /en/experts    strip "The first 100 sign-ups become Founding Experts: … — seats left: 99"  meta "… The first 100 sign-ups …"
after success        "E-postanızı doğrulayın: fo20-e2e-fo31-…@e2e.fabrika.test adresine gönderdiğimiz bağlantıya 24 saat içinde tıklayın. …"
after /tr/uzman/dogrulandi?error=expired   "Doğrulama bağlantısı 24 saat geçerlidir. …"
after /en/experts/verified?error=expired   "Verification links are valid for 24 hours. …"
```
Geçici `FOUNDER_SEAT_LIMIT = 150` (sonra `git checkout -- constants.ts`):
```
limit150 /tr/uzman   strip "İlk 150 kayıt Kurucu Uzman: … — kalan koltuk: 149"  meta "… İlk 150 kayıt …"
limit150 /en/experts strip "The first 150 sign-ups …— seats left: 149"           meta "… The first 150 sign-ups …"
--- geri alındı, git diff:
(boş: git diff --stat src/lib çıktısı yok)
```
FO-29 henüz merge edilmediği için `?error=expired` URL'si hâlâ süresi dolmuş ekranını gösteriyor; mailpit yoluna gerek kalmadı.

Kareler (`docs/agent-results/TASK-MVBIYE9O6JCQ7-evidence/`):
- `fo31-after-tr-uzman.png`, `fo31-after-en-experts.png`
- `fo31-after-success.png`
- `fo31-after-tr-uzman-dogrulandi-expired.png`, `fo31-after-en-experts-verified-expired.png`
- `fo31-limit150-tr-uzman.png`, `fo31-limit150-en-experts.png`

Kapılar:
```
pnpm lint        → exit 0 (0 error; 4 warning, hepsi dokunmadığım dosyalarda)
pnpm typecheck   → exit 0
pnpm i18n:check  → ✅ i18n check passed
pnpm exec playwright test tests/e2e/expert-prereg.spec.ts (mailpit açık) → 5 passed, 0 skipped
```
Mailpit kapalıyken test 3 opt-in olduğu için atlanır (FO-28 koşusu: 4 passed / 1 skipped). e2e sabit metin beklemiyordu, değişiklik gerekmedi.

## Değişen dosyalar
- `messages/tr.json`, `messages/en.json` (yalnız 5 `ExpertPrereg` anahtarı)
- `src/components/expert-prereg/ExpertPreregPage.tsx`
- `src/components/expert-prereg/ExpertPreregForm.tsx`
- `src/components/expert-prereg/ExpertVerifiedPage.tsx` (import + 1 satır)
- `tests/expert-prereg-form.test.tsx`
- `docs/agent-results/TASK-MVBIYE9O6JCQ7-evidence/fo31-*.png` (7 kare)

## Riskler
- `VERIFY_TOKEN_TTL_MS` tam saate bölünmezse (ör. 90 dk) metinde "1.5 saat" görünür. Bugün 24 saat; böyle bir değişiklikte metnin birimi de gözden geçirilmeli.
- `hours` hesabı iki sunucu bileşeninde ayrı yazılı (`/ 3_600_000`). `constants.ts`'e yardımcı eklemek kartın kapsamı dışında kaldı.
- Probe iki `fo20-e2e-fo31-…` kaydı açtı; ardından koşulan e2e'nin `afterAll` adımı `fo20-e2e-` önekli satırları sildi.

## Açık sorular
Yok.

## Sonraki adım
- crw2-fb: PR #76'da M1 (FO-28) ile birlikte m2 (FO-31) yeniden incelemesi.
- FO-29, PR #76 merge'ünden sonra.
