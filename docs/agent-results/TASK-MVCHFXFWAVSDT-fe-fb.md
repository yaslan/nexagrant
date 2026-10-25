---
sözleşme: 3
biçim: html
sayfa: TASK-MVCHFXFWAVSDT-fe-fb.html
görev: TASK-MVCHFXFWAVSDT
kod: TASK-MVCHFXFWAVSDT
ajan: fe-fb
motor: claude
tip: diğer
okur: kullanıcı
hüküm: Kısmen bitti: tek ortak public layout kuruldu ve 45/45 public URL'de (404 dahil, tr+en) tam 1 header + 1 footer ölçüldü, lint/typecheck/test/i18n/RLS yeşil; ama push ve PR, Docker'ın askıda kalması yüzünden (mailpit'e bağlı 6 e2e testi) pre-push gate'te bekliyor.
platform: mac (Darwin 27, Chrome + Playwright, Next dev). Değişiklik yalnız React layout/JSX ve test dosyaları; işletim sistemine bağlı kod yolu yok — Windows/Linux'ta davranış aynı (koşulamadı: bu makinede yalnız mac var). Tarayıcı: Chrome (Playwright channel:'chrome'); Safari koşulamadı, ancak değişiklik yalnız DOM yerleşimi/landmark (sticky header'ın sarmalayıcısı display:contents — Safari 16+ destekler).
sürüm: 1
tarih: 2026-10-17T15:10:37.450Z
---

# FO-68 · Tüm public sayfalarda ortak Header + Footer

## Kararlar

```karar
kimlik: karar-1
soru: FO-68 dalı hazır ama push, Docker askıda olduğu için (mailpit/SMTP'ye bağlı 6 e2e testi) pre-push gate'te kalıyor. Nasıl ilerleyelim?
seçenek: A | Ofis sahibi Docker Desktop'ı yeniden başlatsın; ben gate'i normal ortamda koşup push + PR açayım
seçenek: B | Bu seferlik --no-verify ile push edeyim; 6 testin ortamdan kaynaklandığı raporda kanıtlı, CI tam süiti koşar
seçenek: C | Bekle; Docker başka biri tarafından düzeltilince devam et
öneri: A
karar_kimligi: K-569004
```

- `src/app/[locale]/(public)/layout.tsx` = PublicNavbar + içerik + PublicFooter; 25 public rota (ve eski `(marketing)/blog`) bu gruba taşındı. URL'ler değişmedi, TR rewrite'larına dokunulmadı.
- Sayfa içi 11 navbar/footer çağrısı ve `/calls`'taki özel header kaldırıldı; privacy/terms/dpa/calls/region/no-workspace/accept-invite/portal/i18n-check artık header+footer'lı. 404 (`src/app/not-found.tsx`) çifti kendisi çiziyor.
- ÖNCE: 45 URL'nin 25'inde tam set; SONRA: 45/45'te tam 1 header + 1 footer + 1 main (Playwright landmark sayımı).
- Yeni e2e `tests/e2e/public-shell.spec.ts` (4 test) yeşil; mutant (main içine 2. navbar) ile kırmızıya döndüğü ölçüldü.
- Tam vitest 4634/0, lint/typecheck/i18n/rls:check/bypass/rls:verify/alerts yeşil; tam e2e 334 geçti, 6 kırmızı yalnız mailpit/SMTP (Docker 16:50'den beri askıda).
- Dal `fe-fb/fo68-public-layout` (commit 995a9256) yerelde; push/PR karar bekliyor.

## Ne yapıldı
- **Ortak layout:** `src/app/[locale]/(public)/layout.tsx` — `PublicNavbar` + `{children}` + `PublicFooter`; ikisi de baskıda gizli (fon-hazirlik raporu temiz çıksın diye, eski davranış korunarak). Navbar'ın sarmalayıcısı `display:contents`, böylece `sticky` çalışmaya devam ediyor.
- **Taşınan rotalar** (`git mv`, URL değişmez): ana sayfa, accept-invite, acik-cagrilar, belediye-cagrilari, blog (eski `(marketing)`), calls (+turkey, [region], topic), compliance/dpa, experts(+verified), fiyatlandirma, fon-hazirlik, funding-readiness, giris, i18n-check, kayit, login, municipal-calls, no-workspace, open-calls, portal/partner/[token], pricing, privacy, register, terms, turkiyeye-acik-cagrilar, uzman(+dogrulandi). `[locale]` altında yalnız `layout.tsx`, `(app)`, `admin`, `(public)` kaldı.
- **Tekrarlar kaldırıldı:** 10 sayfa + `PricingClient` + `ExpertPreregPage`/`ExpertVerifiedPage` içindeki navbar/footer; `/calls`'taki el yapımı "Back" header'ı. Kök sarmalayıcılar `min-h-screen` → `flex-1` (footer altta kalır, çift ekran yüksekliği yok).
- **Header/footer'ı hiç olmayanlar** artık `<main id="main">` içinde: privacy, terms, compliance/dpa, calls, calls/[region], portal, i18n-check; no-workspace ve accept-invite'ın mevcut `<main>`'i `flex-1` oldu.
- **404:** `src/app/not-found.tsx` `[locale]`'in üstünde olduğu için kendi `NextIntlClientProvider`'ıyla aynı çifti çiziyor; kart koyu sabit renklerden tema token'larına geçti (açık/koyu temada okunur).
- **(app) ve admin'e dokunulmadı** — giriş yapmış kullanıcı panelleri kendi kabuklarıyla kalıyor. Not: `(app)` içindeki `notFound()` kök 404'e düştüğü için giriş yapmış kullanıcı da 404'te public header'ı görür (404 zaten tek ve public bir sayfa).
- **Test için küçük prop:** `PublicNavbar`/`PublicFooter`'a `data-testid` eklendi.
- **Yol referansları:** taşınan dosyalara işaret eden 17 test, `i18n-baseline.json`, `scripts/tenant-bypass-baseline.json` ve 4 kaynak yorumu güncellendi; `docs/ARCHITECTURE.md` + `PROJECT.md` rota grubu tanımı güncellendi.

## Kanıt
ÖNCE/SONRA envanteri, landmark sayıları ve ekran görüntüleri (gizlilik, 404, /calls, giriş, fiyatlandırma, 390px mobil) raporun HTML sayfasında. Özet:

| Ölçüm | ÖNCE | SONRA |
|---|---|---|
| Tam header+footer olan URL (tr+en, 45) | 25 | **45** |
| Header'ı olmayan | privacy, terms, dpa (iki dil), calls/[region], no-workspace, accept-invite, i18n-check, 404, portal 404 | yok |
| Footer'ı olmayan | yukarıdakiler + /calls (yalnız kendi header'ı vardı) | yok |
| Çift header/footer | 0 | 0 |
| Yatay taşma (1280 / 390px) | yok | yok |

Komut çıktıları (izole DB `127.0.0.1:5499/fo68`, CI sırasıyla kuruldu: db push → rls-role → rls → migrations ×2 → rls → seed):
```
pnpm lint            → 0 hata (4 eski uyarı, dokunulmayan dosyalarda)
pnpm typecheck       → temiz
pnpm test (tam)      → Test Files 355 passed | 2 skipped; Tests 4634 passed | 54 skipped
pnpm i18n:check      → ✅ both catalogs agree … no file gained hard-coded text (246/246 baseline)
rls:check / rls:bypass-check / rls:verify --require-db → ✅
pnpm alerts:check    → ✅ Öksüz alarm yok
playwright public-shell + notfound-status + legal-pages + locale-switcher → 24 passed
playwright notifications-center → 17 passed; theme-dark-variant → passed
Tam e2e (pre-push gate)     → 334 passed, 8 skipped, 6 failed (hepsi SMTP/mailpit, aşağıda)
```
**Mutant:** gizlilik sayfasının `<main>`'ine ikinci `PublicNavbar` eklendi → ilk spec sürümü yakalamadı (main içindeki `<header>` banner landmark sayılmıyor). Spec bileşeni de sayacak şekilde güçlendirildi → `Expected: 1, Received: 2` ile kırmızı; dosya md5 ile geri yüklendi (`42d2200b…`).

**Değişikliğe bağlı olup düzeltilen 2 spec:** `theme-dark-variant` (region sarmalayıcısı artık `main.bg-gray-50`), `notifications-center` izolasyon testi (404'teki header'ın TR|EN düğmeleri B'nin yazdığı yolu dil değiştirerek gösteriyor — A'dan veri değil; bu iki link `switchLocalePath` ile birebir sabitlendi, header dışındaki her link yine 0 olmalı).

**Ortamdan gelen 6 kırmızı:** `expert-prereg:154` ve `team-members-ui` ×5. `playwright.config.ts` sunucuya SMTP'yi zorla `localhost:1025` ve mailpit'i `:8025` veriyor; bu portları Docker Desktop'ın port vekili (`com.docker.backend`) tutuyor ama Docker motoru 16:50'den beri yanıt vermiyor (`docker ps` askıda). Ölçüm: :1025'e bağlanınca SMTP karşılama satırı 8 sn'de gelmedi, mailpit API zaman aşımı; sunucu logu `invitation email failed: smtp:ETIMEDOUT`. Bu testler `(app)` ayarlar sayfası ve uzman ön kaydına ait; bu PR'ın dokunduğu bir kod yolu değil.

## Değişen dosyalar
Commit `995a9256` (dal `fe-fb/fo68-public-layout`, worktree `/Users/macbook/alan/FONBRIDGE-fo68`): 77 dosya, +331/−216 (taşımaların çoğu saf yeniden adlandırma). Yeni: `src/app/[locale]/(public)/layout.tsx`, `tests/e2e/public-shell.spec.ts`. Değişen: `src/app/not-found.tsx`, `PublicNavbar.tsx`, `PublicFooter.tsx`, `expert-prereg/Expert{Prereg,Verified}Page.tsx`, taşınan sayfalar, yol referansı içeren testler/baseline'lar, `docs/ARCHITECTURE.md`, `PROJECT.md`.

## Riskler
- Taşıma, açık PR'larda bu sayfalara dokunan dallarla yeniden adlandırma çakışması üretebilir (git rename takibi çoğunu kendisi çözer).
- `revalidatePath('/[locale]/blog')` çağrıları grup adı içermiyor — eski `(marketing)` grubunda da öyleydi; kök layout dinamik (cookies/headers) olduğu için davranış değişmiyor.
- Navbar'daki `#stage-gate`, `#moduller`, `#cordis` çapaları ana sayfa dışında boşa düşüyordu, şimdi daha çok sayfada görünür. Kapsam dışı bıraktım (ayrı kart önerilir).
- Docker motoru askıda: diğer ajanların DB/mailpit'e bağlı işleri de etkileniyor olabilir.

## Açık sorular
Push kararı aşağıdaki karar kutusunda.

## Sonraki adım
Karar gelince: (A) Docker yeniden başlatılınca `pnpm gate`'i normal ortamla koşup push + PR (CRW-FB incelemesi). İzole Postgres (`127.0.0.1:5499`, scratchpad) ve worktree bu iş için açık duruyor.

Bu raporun sayfası: TASK-MVCHFXFWAVSDT-fe-fb.html (AgentSpace Raporlar sekmesinde açılır).
