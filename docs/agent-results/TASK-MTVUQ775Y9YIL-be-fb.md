# TASK-MTVUQ775Y9YIL — Marketplace: uydurma demo ilanları kaldır, boş durum ile hata durumunu ayır

**Ajan:** be-fb · **Sprint:** SPRINT-S12 · **Platform:** macOS (darwin 25.6.0) — aşağıda "Platform beyanı".

## 1. Ne yapıldı

`src/app/[locale]/(app)/[workspace]/marketplace/page.tsx` içindeki "Fallback demo listings if DB is
unseeded/offline" bloğu kaldırıldı: üç uydurma ilan (`list-demo-1..3`, €1.800 / €4.500 / €2.200) ve bir
uydurma API anahtarı (`key-demo-1`, `fp_live_9a8b`) artık hiçbir koşulda üretilmiyor.

Tehlike kaydın anlattığı gibiydi: `src/modules/marketplace/server/listings.ts` yorumuna göre NOBYPASSRLS
rolünde kiracı kapsamı ayarlanmadan yapılan okuma **hata değil, sıfır satır** döndürür. Eski kod tam o
noktada devreye girip fiyatlı, sipariş edilebilir sahte ilanlar basıyordu — yani kiracı izolasyonu
arızası "dolu bir pazar yeri" olarak görünüyordu.

Yerine üç durum birbirinden ayrıldı:

| Durum | Ekran |
|---|---|
| (i) satır yok | boş durum kartı (`m8.state.listings.empty*`, `m8.state.apiKeys.empty*`) + liste (0 kayıt) |
| (ii) okuma hata verdi | hata kartı (`m8.state.*.error*`) + **Yeniden dene** bağlantısı; hiçbir satır uydurulmaz |
| (iii) veri var | liste; boş/hata kartı yok |

Ek olarak iki okuma tek `try/catch`'i paylaşıyordu: ilan okuması patlayınca API anahtarı listesi de
"boş" diye raporlanıyordu. Artık ayrı okunuyor ve ayrı raporlanıyor. **İki okuma da** başarısızsa
sayfa yalnız hata kartını basıyor, `MarketplaceClient` hiç render edilmiyor — çünkü o formlar da aynı
şekilde hata verirdi ve kullanıcıyı boşa yazmaya davet etmenin anlamı yok.

Tüm metinler `t('...')` üzerinden; `m8.state.*` anahtarları **hem tr hem en** kataloğuna eklendi.
"Yeniden dene" bağlantısı `getWorkspaceRoute('marketplace', locale, workspace)` ile üretiliyor
(tr → `/tr/<ws>/pazar-yeri`, en → `/en/<ws>/marketplace`; `next.config.ts:125` rewrite'ı ile eşleşiyor)
ve düz `<a href>`; soft navigation değil, sunucuda sorgunun yeniden koşması için tam istek.

## 2. Kanıt (kopyalanmış çıktı)

### 2.1 Birim testi — üç dal da koşturuldu (yeni: `tests/marketplace-page-states.test.ts`)

```
$ pnpm vitest run tests/marketplace-page-states.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 2.2 Karşı-olgu: aynı test HEAD'deki (demo fallback'li) sayfaya karşı KIRMIZI

Eski dosya geçici olarak yerine kondu, test koşturuldu, sonra yeni sürüm geri alındı:

```
=== counterfactual: HEAD (demo fallback) version in place ===
     × no rows: empty state, and not one invented listing or key 7ms
     × listing read throws: error notice plus a retry link, never a fabricated row 1ms
     × key read throws while listings load: the failure is reported on the key list alone 1ms
     × both reads down: the page-level error, and no client to type into 0ms
     × english locale answers from the english catalogue and keeps the /en route 0ms
AssertionError: expected '<div class="max-w-6xl mx-auto p-6 spa…' to contain 'Henüz ilan yok'
      Tests  5 failed | 1 passed (6)
=== restored; re-run ===
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 2.3 Gerçek Chromium — dört durumun DOM'u + "Yeniden dene" tıklaması

Gerçek sunucu bileşeninin ürettiği HTML, gerçek Chromium'da (Playwright) açıldı; `document.body.innerText`
üzerinden ölçüldü (HTML üzerinden değil: next-intl tüm katalogu sayfaya gömüyor). 38 kontrolün tamamı geçti;
son satırlar:

```
PASS  01-empty: shows "Henüz ilan yok"
PASS  01-empty: shows "Henüz API anahtarı yok"
PASS  01-empty: no fabricated copy "Horizon Europe Proposal Coaching"
PASS  01-empty: no fabricated copy "fp_live_9a8b"
PASS  02-populated: shows "• Gercek ilan"
PASS  02-populated: does not show "Henüz ilan yok"
PASS  03-listings-error: shows "İlanlar yüklenemedi"
PASS  04-both-down: shows "Pazar yeri yüklenemedi"
PASS  04-both-down: does not show "MarketplaceClient"
PASS  retry link is visible
PASS  retry href is the marketplace route
PASS  click navigated to http://127.0.0.1:60937/tr/ws-a/pazar-yeri
PASS  the server received a fresh request for the marketplace route
server hits: ["/state/01-empty.html","/state/02-populated.html","/state/03-listings-error.html","/state/04-both-down.html","/state/03-listings-error.html","/tr/ws-a/pazar-yeri"]
ALL BROWSER CHECKS PASSED
```

Kareler: `docs/agent-results/TASK-MTVUQ775Y9YIL-screenshots/01-empty.png`, `02-populated.png`,
`03-listings-error.png`, `04-both-down.png`, `05-retry-click.png`.

**Bu kanıtın sınırı, açıkça:** kareler uygulamanın kendi Tailwind CSS'i ile değil, karşılaştırma için
eklenen küçük bir CSS ile render edildi — metin ve DOM gerçek, görsel stil değil. Nedeni 2.4'te.

### 2.4 Tam uygulama e2e'si KOŞULAMADI — sebebi ölçüldü

```
$ lsof -ti:5432 ...            → no 5432
$ brew services list           → mysql started / php none   (postgres yok)
$ docker ps                    → failed to connect to the docker API … daemon çalışmıyor
$ which psql postgres pg_ctl   → psql not found / postgres not found / pg_ctl not found
DB FAIL: Invalid `prisma.$queryRawUnsafe()` invocation  (DATABASE_URL → postgresql://localhost:5432/fabrika)
```

Bu makinede Postgres yok; giriş (`requireTenantPage` → `auth()`) de veritabanına bağlı olduğu için
tarayıcıda tam akış (login → /pazar-yeri) koşturulamadı. Spec yine de yazıldı ve repoda duruyor —
veritabanı olan ortamda çalışacak; burada yalnız derlenip listelendiği doğrulandı:

```
$ E2E_PORT=3181 npx playwright test --list tests/e2e/marketplace-demo-fallback.spec.ts
  [chromium] › marketplace-demo-fallback.spec.ts:67:7 › … › an empty tenant gets the empty state, not three priced offers
  [chromium] › marketplace-demo-fallback.spec.ts:98:7 › … › a real row replaces the empty state
Total: 2 tests in 1 file
```

`pnpm test:e2e` bu ortamda koşulmadı (DB yok) — "geçti" demiyorum.

### 2.5 Kapılar

```
$ pnpm typecheck   → tsc --noEmit   (çıktı yok = hata yok)
$ pnpm lint        → eslint         (çıktı yok = hata/uyarı yok)
$ pnpm vitest run tests/marketplace-page-states.test.ts tests/modules/marketplace.test.ts
 Test Files  2 passed (2)
      Tests  13 passed (13)
$ pnpm i18n:check
  Keys in messages/tr.json: 1520
  Keys in messages/en.json: 1520
  Baseline allows:  325 in 37 file(s)   (yeni gömülü metin yok)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

## 3. Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/marketplace/page.tsx` — demo satırlar silindi; üç durum ayrıldı;
  iki okuma ayrı try/catch; `StateNotice` (server, JS'siz) + retry bağlantısı.
- `messages/tr.json`, `messages/en.json` — `m8.state.*` (11 anahtar, iki dilde birebir).
- `tests/marketplace-page-states.test.ts` (yeni) — altı dal testi, karşı-olgu ile doğrulandı.
- `tests/e2e/marketplace-demo-fallback.spec.ts` (yeni) — gerçek tarayıcı spec'i (DB'li ortam için).
- `docs/agent-results/TASK-MTVUQ775Y9YIL-screenshots/*.png` (yeni) — 5 kare.

`actions.ts` ve `client.tsx`'e **dokunulmadı** (de-fb'nin sipariş akışı).

## 4. Riskler

- Boş durum kartları sayfanın en üstünde, `MarketplaceClient`'ın kendi başlığının üzerinde çıkıyor;
  client'a dokunma izni olmadığı için kartın listenin tam içine yerleştirilmesi yapılmadı. Görsel yerleşim
  tercihi değişirse tek satırlık bir taşıma işi (client sahibi ile).
- API anahtarı boş durumu, kullanıcı "İlanlar" sekmesindeyken de görünüyor (sayfa seviyesinde). Gürültü
  sayılırsa client içine taşınmalı.
- `tests/e2e/marketplace-demo-fallback.spec.ts` bu makinede koşturulamadı; DB'li ilk koşuda sürprizi
  olabilir (fixture kiracısının ilan/anahtar satırlarını `beforeAll`'da siliyor — yalnız `gate-e2e-tenant-a`).

## 5. Açık sorular

- Pazar yeri "kendi ilanlarım" mı yoksa kiracılar arası vitrin mi? (listings.ts'teki açık ürün sorusu.)
  Vitrin cevabı kazanırsa boş durum metni de değişir ("henüz ilan yok" → "vitrin boş").

## 6. Sonraki adım

- DB'li bir ortamda `npx playwright test tests/e2e/marketplace-demo-fallback.spec.ts` koşturulup kareler
  gerçek uygulama stiliyle yenilensin.

## Platform beyanı

Doğrulama **macOS 15 (darwin 25.6.0, arm64)** üzerinde yapıldı: vitest 6/6 + 13/13, Chromium 38/38, typecheck,
lint, i18n:check. Dokunulan kodun platforma bağlı hiçbir yanı yok — sunucu tarafı React render'ı, Prisma
okuması ve JSON katalog metni; süreç öldürme, dosya yolu, kabuk/ikili adı, kısayol metni, ekran/DPI veya
cihaz izni içermiyor, dolayısıyla Windows ve Linux'ta aynı çalışır (kod okumasıyla söylüyorum, o platformlarda
koşmadım). Tam uygulama e2e'si hiçbir platformda koşturulmadı; sebebi §2.4'te ölçülü olarak yazıldı (Postgres yok).
