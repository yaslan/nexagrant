# TASK-MUNU027UKJ2AD — fe-fb — Mobilde yan boşluk 2px (yapısal düzeltme)

**Durum:** TAMAM
**Dal:** `fe-fb/mobile-edge-2px` (dev `8089aa27`'den), dev'e merge edildi, push yok
**Platform beyanı:** macOS (Darwin 27, Chrome kanalı, gerçek tarayıcı) üzerinde doğrulandı. Değişiklik yalnız Tailwind sınıfları ve bir CSS token'ı; platforma bağlı kod yolu yok (süreç, dosya yolu, kabuk, DPI yok). Windows ve Linux'ta koşulmadı çünkü bu makinede yoklar. Kodda o platformlarda farklı davranacak bir şey yok: kırılma noktası CSS `min-width: 40rem`, tarayıcı motoru aynı.

## 1. Ne yapıldı

**Kök neden:** Boşluk katman katman birikiyordu. `(app)/layout.tsx` `<main p-4>` 16px veriyordu, sayfa kökü (`max-w-6xl mx-auto p-6`) bir 24px daha ekliyordu. 472px'teki belge sayfasında kart iki yandan 40px içeride başlıyordu (patron ekranı; "önce" karesinde aynı ölçüldü).

**Tek kaynak token:** `src/app/globals.css` → `@theme { --spacing-edge: 2px; }`. Tailwind v4 bundan `px-edge` / `mx-edge` üretiyor. Derlenmiş CSS'te `.px-edge{padding-inline:var(--spacing-edge)}` ve `--spacing-edge:2px` var.

**Her sayfada kenarın tek sahibi var:**

| Katman | Önce | Sonra (mobil <640) | sm+ |
|---|---|---|---|
| `(app)/layout.tsx` `<main>` | `p-4 sm:p-6` | `px-edge py-4` | `sm:p-6` AYNEN |
| `admin/layout.tsx` `<main>` | `p-4 sm:p-8` | `px-edge py-4` | `sm:p-8` AYNEN |
| Kabuk içi sayfa kökleri (45 konteyner: `(app)`, `admin`, `lib/modules/guard`, `modules/m5`) | `p-6` / `py-8 px-4` / `p-4 md:p-8` … | yatay 0, dikey aynı (`py-6`) | `sm:px-6` vb. ile aynı değer |
| Layout'suz public sayfalar (ana sayfa, blog, fiyatlandırma, çağrı sayfaları, giriş/kayıt, davet, no-workspace, portal, i18n-check) | `px-4 sm:px-6 lg:px-8` | `px-edge` | `sm:px-6 lg:px-8` AYNEN |
| Kök-kart olan sayfalar (privacy/terms/dpa) | kart kenarı 0px, iç `px-6` | kart `mx-edge`, iç `px-4` | `sm:mx-auto sm:px-6` |
| Kök-kart iç padding (settings/modules, m2, m5 Dashboard, admin plans) | `p-8` / `p-6` | `p-4` (okunur) | `sm:p-8` / `sm:p-6` |

Sınıflar kural temelli bir betikle dönüştürüldü: `p-N` → `py-N sm:px-N`, `px-N` → `sm:px-N`, ve varsa `sm:` değeri korundu. Böylece sm ve üstünde hesaplanan stil birebir aynı kalıyor.

**Kasıtlı olarak dokunulmayanlar:** Üst çubuklar (MobileAppHeader, MobileAdminHeader, PublicNavbar, admin footer, PublicFooter, `calls/page.tsx:90` başlık satırı) ve PilotBanner. Bunlar tam genişlikte zemin şeridi; içlerindeki logo, ikon ve metin 2px'e yapışmasın diye padding'leri korundu. Kartların genel iç padding'i (`p-6`) de değişmedi. Hedef dış kenardı.

**be-fb alanı:** `calls/[region]/page.tsx` ve `concept-notes/[id]/page.tsx` dosyalarında yalnız kök konteyner padding sınıfı değişti (her birinde 1–2 satır). İş mantığına ya da API'ye dokunulmadı.

**Gelecek sayfalar için bekçi:** `tests/mobile-edge-gutter.test.ts` (6 test) şunları kontrol ediyor:
- Token'ın tek ve 2px olduğunu.
- İki layout `<main>`'inin `px-edge` taşıdığını.
- Kabuk içindeki her `mx-auto max-w-*` konteynerinin sm altında yatay padding eklemediğini.
- Public sayfalarda en dış konteynerin/`<main>`'in `px-edge` kullandığını.

Kart konteynerleri (rounded + border/bg) ve listelenen çubuklar muaf. Taramanın boş kalmadığını ayrıca ölçüyor (kabuk içi >30, public >10 konteyner). Sınırı şu: yalnız statik `className="..."` okunuyor; `cn()` ya da şablon dizgesi görülmüyor. Bu, testin başındaki yorumda yazıyor.

## 2. Kanıt

Ölçüm betiği `evidence/measure.mjs`: gerçek Chrome, oturum açık (admin@yasinaslan, platform admin + fabrika-beta sahibi), izole DB. Ölçtükleri:
- `card` = `<main>` içindeki ilk görünür, çerçeveli/zeminli ve ekranın ≥%50'si genişlikteki kutunun left ve innerWidth−right değerleri
- `text` = en soldaki metnin konumu
- `sw` = `documentElement.scrollWidth`

**Patron ekranı** `opportunities/demo-opp-1/documents` (`evidence/mobil/opp-documents.jpg`):
```
ÖNCE  360 card=40/40   390 card=40/40   472 card=40/40   sw=innerWidth
SONRA 360 card=2/2     390 card=2/2     472 card=2/2     sw=innerWidth
```

**Temsilî 12 sayfa × 360/390/472** (`evidence/temsili-once.log` / `temsili-sonra.log`, kareler `evidence/mobil/*.jpg`, üst satır önce, alt satır sonra):
```
SONRA 360: opp-documents 2/2 · dashboard 2 · pipeline 2/2 · partners 2 · settings-profile 2/2 · admin(leads) 2/2
           home 2/2 · giris 2/2 · concept-notes 2/2 · privacy 2/2 · blog/pricing: konteyner pl=2 (seçilen kutu ortalanmış rozet)
ÖNCE  360: 40 · 40 · 32 · 32 · 32 · 16 · 16 · 16 · 32 · 0 (privacy kartı ekrana yapışıktı)
```
Tek sayı verilenlerde ilk kutu dar bir öğe (buton ya da rozet). Zincirde `main pl=2 pr=2` ve aradaki katmanın 0 olduğu `olcum-sonra.json`'da görülüyor.

**Tüm rotalar, 360px** (86 rota, `evidence/tum-rotalar-360-once.log` / `-sonra.log`): 200 dönen her uygulama, admin ve public sayfasında dış kenar 2. Önce 16/32/40/48'di. **Hiçbir rotada `scrollWidth > innerWidth` yok**, ne önce ne sonra. Sonrada 404/403 dönenler seed'de karşılığı olmayan id'ler (`m2`, `matching`, `partners/[pic]`, `blog/x`, `calls/eu`, `portal/x`) ve ajans rotaları (admin ajans değil).

**768/1280 regresyonu** (`evidence/genis-piksel-karsilastirma.txt`): 12 sayfa × 2 genişlik, önce ve sonra PNG'leri piksel piksel karşılaştırıldı. Uygulama ve admin sayfalarının hepsi **IDENTICAL**. Public sayfalardaki tek fark 40–120 piksellik bir bölge (x≈250/500, y≈32). Kırpıp baktım: PublicNavbar'daki "Açık Çağrılar" yanındaki ve hero rozetindeki `animate-pulse` noktası, yani yerleşim farkı değil. Örnek kareler `evidence/genis/`.

**Gerçek tıklama, 360 ve 472** (`evidence/interact.mjs`, kareler `evidence/etkilesim/`):
```
360 pilot-banner x=0 w=360            (tam şerit, izole DB'de kiracı geçici pilot yapıldı)
360 drawer open (Open Mobile Menu tık) sw=360
360 feedback sheet x=0 w=360 (FeedbackWidget tık)  sw=360
360 admin/tenants table w=640, kendi kartında kayıyor: kart left=2 right=2, sayfa sw=360
472 aynı sonuçlar (sw=472)
```

**Bekçinin gerçekten yakaladığı** (mutasyon: dosya dev hâline döndürüldü, sonra yedekten geri yüklendi, md5 aynı):
- `(app)/layout.tsx` + `documents/page.tsx` dev hâlinde → `× <main> owns the gutter`, `× inside the app/admin shell…` (`documents/page.tsx:90 "max-w-6xl mx-auto p-6 space-y-6"`)
- `src/app/[locale]/page.tsx` dev hâlinde → `× a layout-less public page…` (6 satır: 63, 251, 333, 470, 580, 639)
- Geri yüklenince 6/6 yeşil.

**Kapılar** (worktree, izole DB `fefbmob-pg` 127.0.0.1:5477; CI sırası: db push → rls-role → migrations ×2 (38 dosya) → rls → seed):
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm i18n:check` → passed. Uyarı: "baseline is looser than reality: admin/settings/page.tsx 9→7". O dosyaya dokunmadım; uyarı önceden vardı.
- `pnpm build` → exit 0, 31 statik sayfa. Build günlüğündeki tek uyarı `instrumentation.ts:18` `process.exit` edge uyarısı; o dosya da değişmedi.
- `npx vitest run` (tam süit):
  - **1. koşu:** 20 kırmızı. Sebep benim env kurulumumdu: sed, `DATABASE_URL_RLS_TEST`'in kullanıcısını süper kullanıcı `fabrika` yaptı, testler de "connected as fabrika (rolsuper=true)… Point DATABASE_URL_RLS_TEST at the NOBYPASSRLS role" diyerek düştü. URL `fabrika_app`'e düzeltildi.
  - **2. koşu:** `Tests 3 failed | 3094 passed | 73 skipped (3170)`. `billing-checkout-auth` 403 verdi, çünkü kareler için izole DB'de demo kiracıyı ultra/pilot yapmıştım. Seed hâline döndürülünce geçti. Kalan 2 kırmızı süre aşımıydı.
  - **3. koşu (DB seed hâlinde):** `Test Files 5 failed | 253 passed | 6 skipped (264)` · `Tests 5 failed | 3092 passed | 73 skipped (3170)`. Beşi de süreye bağlı: withholding-rounding 5 sn zaman aşımı, invoice-writer "reconstructs…", rag-pdf-real-parse "well under a second", rag-pdf-worker-isolation 30 sn, use-server-exports 5 sn. Makine yükü 42–56'ydı.
  - **Aynı 5 dosya tek başına:** `Test Files 5 passed (5)` · `Tests 69 passed (69)`. Yeni test dosyası da süitte yeşil.

## 3. Değişen dosyalar

- `src/app/globals.css`: token + açıklama
- `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/admin/layout.tsx`: `<main>`
- Kabuk içi sayfa kökleri (39 dosya):
  - `(app)/[workspace]/` altındaki approvals, calls, calls/[id], concept-notes, concept-notes/[id], dashboard, evidence, opportunities/[id]/{application, briefs, documents, evaluations, evaluations/panel (+error), m2, matching}, partners, partners/leaders, partners/[pic], pipeline, pipeline/[id]/{client, consortium}, relationships, relationships/[id] (+detail), reports/person-days, settings/{api-keys, calendar, gates, modules, privacy/client, profile, profile/layout}, tto
  - admin/{modules/page, modules/client, billing/plans/client, billing/plans/pilot-panel}
  - `src/lib/modules/guard.tsx`, `src/modules/m5/ui/Dashboard.tsx`
- Public (20 dosya): `[locale]/page.tsx`, (marketing)/blog, blog/[slug], pricing/PricingClient, calls, calls/turkey, calls/[region], belediye-cagrilari, turkiyeye-acik-cagrilar, fon-hazirlik, i18n-check, login, register, accept-invite/continue, no-workspace, portal/partner/[token], privacy, terms, compliance/dpa, `src/components/BlogSection.tsx`
- `tests/mobile-edge-gutter.test.ts` (yeni)
- `docs/agent-results/TASK-MUNU027UKJ2AD-fe-fb.md`, `…-evidence/`

## 4. Riskler

- Başlıklar ve düz metin (kartsız) mobilde artık ekran kenarına 2px uzaklıkta, örneğin "Panel" başlığı ve admin "İletişim talepleri". İstenen buydu, ama okunabilirlik açısından görsel olarak sert duruyor. Kareler `evidence/mobil/admin.jpg` ve `dashboard.jpg`'de.
- Bekçi yalnız statik `className` dizgelerini görüyor. `cn()` ya da şablon dizgesiyle kurulmuş bir sayfa konteyneri gelecekte katman ekleyebilir.
- Yalnız seed'de verisi olan sayfalar dolu hâliyle ölçüldü. Boş/404 dönen detay rotaları (m2, matching, partners/[pic], blog/[slug], calls/[region], portal) sınıf düzeyinde düzeltildi ama dolu hâlleri tarayıcıda görülmedi.

## 5. Açık sorular (patron/lider kararı)

1. Üst çubuklar (mobil header, PublicNavbar, footer, PilotBanner) kendi iç padding'lerini (16px) koruyor. Onlar da 2px'e insin mi? Ben logo ve ikonların kenara yapışmaması için dokunmadım.
2. Giriş/kayıt kartı `max-w-md` (448px). 472px'te kart iki yandan 12px içeride; bu padding değil, tasarım genişliği. Mobilde tam genişlik olsun mu (`sm:max-w-md`)?
3. Kartların iç padding'i (`p-6`) mobilde `p-4`'e insin mi? Şu an yalnız kök-kartlarda indirildi.

## 6. Sonraki adım

- Karar gelirse 1–3 tek satırlık değişiklikler; bekçiye BARS/kart listesi eklenir.
- İnceleme: 768/1280 piksel karşılaştırması ve `evidence/mobil/*.jpg` üzerinden.
