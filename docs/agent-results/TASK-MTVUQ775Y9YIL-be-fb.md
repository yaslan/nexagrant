# TASK-MTVUQ775Y9YIL — Marketplace: uydurma demo ilanları kaldır, boş durum ile hata durumunu ayır

**Ajan:** be-fb · **Sprint:** SPRINT-S12 · **Platform:** macOS (darwin 25.6.0) — aşağıda "Platform beyanı".

## 1. Ne yapıldı

`src/app/[locale]/(app)/[workspace]/marketplace/page.tsx` içindeki "Fallback demo listings if DB is
unseeded/offline" bloğu kaldırıldı: üç uydurma ilan (`list-demo-1..3`, €1.800 / €4.500 / €2.200) ve bir
uydurma API anahtarı (`key-demo-1`, `fp_live_9a8b`) artık hiçbir koşulda üretilmiyor.

Tehlike kartın anlattığı gibiydi: `src/modules/marketplace/server/listings.ts` yorumundaki ölçüme göre
NOBYPASSRLS rolünde kiracı kapsamı ayarlanmadan yapılan okuma **hata değil, sıfır satır** döndürür. Eski kod
tam o noktada devreye girip fiyatlı, sipariş edilebilir sahte ilanlar basıyordu — yani kiracı izolasyonu
arızası ekranda "dolu bir pazar yeri" olarak görünüyordu.

Yerine üç durum birbirinden ayrıldı:

| Durum | Ekran |
|---|---|
| (i) satır yok | boş durum kartı (`m8.state.listings.empty*`, `m8.state.apiKeys.empty*`) + liste (0 kayıt) |
| (ii) okuma hata verdi | hata kartı (`m8.state.*.error*`) + **Yeniden dene** bağlantısı; hiçbir satır uydurulmaz |
| (iii) veri var | liste; boş/hata kartı yok |

Ek olarak iki okuma tek `try/catch`'i paylaşıyordu: ilan okuması patlayınca API anahtarı listesi de
"boş" diye raporlanıyordu. Artık ayrı okunuyor ve ayrı raporlanıyor. **İki okuma da** başarısızsa sayfa
yalnız hata kartını basıyor, `MarketplaceClient` hiç render edilmiyor — o formlar da aynı şekilde hata
verirdi, kullanıcıyı boşa yazmaya davet etmenin anlamı yok.

Tüm metinler `t('...')` üzerinden; `m8.state.*` (11 anahtar) **hem tr hem en** kataloğuna eklendi.
"Yeniden dene" bağlantısı `getWorkspaceRoute('marketplace', locale, workspace)` ile üretiliyor
(tr → `/tr/<ws>/pazar-yeri`, en → `/en/<ws>/marketplace`; `next.config.ts:125` rewrite'ı ile eşleşiyor) ve
düz `<a href>` — soft navigation değil, sorgunun sunucuda yeniden koşması için tam istek.

## 2. Kanıt (kopyalanmış çıktı)

### 2.1 Gerçek uygulama e2e'si — gerçek tarayıcı, gerçek giriş, gerçek Postgres

`tests/e2e/marketplace-demo-fallback.spec.ts` (yeni). Dev sunucu Playwright tarafından ayağa kaldırıldı
(`next dev --port 3181`), gerçek `/tr/giris` formu dolduruldu, `/tr/gate-e2e-ws-a/marketplace`'e gidildi.

```
$ E2E_PORT=3181 E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/marketplace-demo-fallback.spec.ts
[e2e-gate] Dev server info: PID=60850
[seed-gate-e2e] ready — tenantA=gate-e2e-tenant-a oppA=gate-e2e-opportunity-a …
[TASK-MTVUQ775Y9YIL] fixture tenant emptied: listings=0 apiKeys=0
  ✓  1 … › an empty tenant gets the empty state, not three priced offers (2.0s)
  ✓  2 … › a real row replaces the empty state (897ms)
  2 passed (9.3s)
```

Testler `document.body.innerText` üzerinden ölçüyor (HTML üzerinden değil: next-intl tüm katalogu her
sayfaya gömdüğü için markup'ta `not.toContain` yanıltır) ve şunları doğruluyor: boş kiracıda "Henüz ilan
yok" + "Henüz API anahtarı yok" görünür, kaldırılan sekiz demo metninin (üç başlık, üç fiyat, `fp_live_9a8b`,
"ERP Enterprise Integration Key") **hiçbiri** ekranda değil; gerçek satır eklenince ilan görünür ve boş durum
kaybolur. Karşı-olgu olarak veritabanı sayımı da yapılıyor (kiracının 0 ilanı olduğu doğrulanıyor), yoksa
"yok" demek "sayfa hiç render olmadı" ile karışırdı.

Kareler: `docs/agent-results/TASK-MTVUQ775Y9YIL-screenshots/01-empty-state.png` (uygulamanın kendi stiliyle,
"0 İlan / 0 Anahtar" metrikleri dahil) ve `02-real-listing.png`.

### 2.2 Aynı e2e, eski sayfaya karşı KIRMIZI (karşı-olgu)

`HEAD~1`'deki demo-fallback'li sayfa geçici olarak yerine kondu, test tekrar koşturuldu, sonra yeni sürüm
geri alındı (`git status` temiz):

```
=== E2E counterfactual against the demo-fallback page ===
  1 failed
    [chromium] › … › an empty tenant gets the empty state, not three priced offers

Error: expect(locator).toBeVisible() failed
Locator: locator('main').getByText('Henüz ilan yok')
Expected: visible
Error: element(s) not found
```

Yani test, düzeltmeyi gerçekten ölçüyor.

### 2.3 Birim testi — hata dalları (tarayıcıda zorlanamayan yarısı)

`tests/marketplace-page-states.test.ts` (yeni). Okumaları fırlatarak üç dal da koşturuluyor: ilan okuması
patlarsa hata kartı + retry, anahtar okuması patlarsa yalnız o liste "hatalı" işaretleniyor (eskiden "boş"
diyordu), ikisi de patlarsa sayfa seviyesi hata ve client hiç yok. `t()` çağrıları **gerçek katalogdan**
cevaplanıyor, böylece katalogda olmayan bir anahtar testi düşürür.

```
$ pnpm vitest run tests/marketplace-page-states.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Karşı-olgu (aynı test, HEAD'deki eski sayfaya karşı):

```
     × no rows: empty state, and not one invented listing or key
     × listing read throws: error notice plus a retry link, never a fabricated row
     × key read throws while listings load: the failure is reported on the key list alone
     × both reads down: the page-level error, and no client to type into
     × english locale answers from the english catalogue and keeps the /en route
AssertionError: expected '<div class="max-w-6xl mx-auto p-6 spa…' to contain 'Henüz ilan yok'
      Tests  5 failed | 1 passed (6)
=== restored; re-run ===
      Tests  6 passed (6)
```

### 2.4 Hata durumu + "Yeniden dene" tıklaması, gerçek Chromium'da

Hata dalı gerçek uygulamada ancak veritabanını bozarak görülebilirdi (aynı DB'de dört ajan daha çalışıyor),
bu yüzden sunucu bileşeninin **gerçek çıktısı** dört durum için HTML'e dökülüp gerçek Chromium'da açıldı ve
retry bağlantısına gerçekten tıklandı; istek yerel bir sunucu tarafından karşılandı:

```
PASS  03-listings-error: shows "İlanlar yüklenemedi"
PASS  04-both-down: shows "Pazar yeri yüklenemedi"
PASS  04-both-down: does not show "MarketplaceClient"
PASS  retry href is the marketplace route
PASS  click navigated to http://127.0.0.1:60937/tr/ws-a/pazar-yeri
PASS  the server received a fresh request for the marketplace route
server hits: [… ,"/state/03-listings-error.html","/tr/ws-a/pazar-yeri"]
ALL BROWSER CHECKS PASSED   (38/38)
```

Kareler: `03-listings-error.png`, `04-both-down.png`, `05-retry-click.png`, ayrıca karşılaştırma için
`01-empty.png` / `02-populated.png`. **Sınırı açıkça:** bu beş kare uygulamanın Tailwind CSS'i ile değil,
harness'in küçük CSS'i ile render edildi — metin ve DOM gerçek, görsel stil değil. Uygulama stiliyle çekilmiş
kareler 2.1'dekiler (`01-empty-state.png`, `02-real-listing.png`).

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

Commit öncesi kapı (githooks): `✓ Kapı temiz (staged kapsamı).` — commit `58e8936`.
`pnpm gate`'in tamamı koşturulmadı (paylaşımlı worktree'de dört ajan daha çalışıyor); koştuğunu iddia etmiyorum.

## 3. Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/marketplace/page.tsx` — demo satırlar silindi; üç durum ayrıldı;
  iki okuma ayrı try/catch; `StateNotice` (server, JS'siz) + retry bağlantısı.
- `messages/tr.json`, `messages/en.json` — `m8.state.*` (11 anahtar, iki dilde birebir).
- `tests/e2e/marketplace-demo-fallback.spec.ts` (yeni) — gerçek tarayıcı, gerçek DB; 2 test.
- `tests/marketplace-page-states.test.ts` (yeni) — 6 dal testi, karşı-olgu ile doğrulandı.
- `docs/agent-results/TASK-MTVUQ775Y9YIL-screenshots/*.png` (yeni) — 7 kare.

`actions.ts` ve `client.tsx`'e **dokunulmadı** (de-fb'nin sipariş akışı).

## 4. Riskler

- Boş/hata kartları sayfanın en üstünde, `MarketplaceClient`'ın kendi başlık bandının **üzerinde** çıkıyor
  (bkz. `01-empty-state.png`). Kartın listenin tam içine yerleşmesi client'a dokunmayı gerektirir; bu kartın
  kapsamı dışıydı. Görsel yerleşim tercih edilirse client sahibiyle tek adımlık bir taşıma işi.
- API anahtarı boş durumu, kullanıcı "İlanlar" sekmesindeyken de görünüyor (karar sayfa seviyesinde).
  Gürültü sayılırsa aynı taşıma işine dahil edilmeli.
- e2e spec'i `beforeAll`'da fixture kiracısının (`gate-e2e-tenant-a`) ilan ve API anahtarı satırlarını siliyor.
  Bu kiracı zaten her koşuda seed edilip `rollback()` ile düşürülen tek kullanımlık fixture; başka kiracıya
  dokunulmuyor.

## 5. Açık sorular

- Pazar yeri "kendi ilanlarım" mı, kiracılar arası vitrin mi? (`listings.ts`'te duran açık ürün sorusu.)
  Vitrin cevabı kazanırsa boş durum metni de değişir ("henüz ilan yok" → "vitrin boş").

## 6. Sonraki adım

- Kart `review`'a alınabilir. Ek iş: boş/hata kartlarının client'ın liste bölümüne taşınması (client sahibiyle).

## Platform beyanı

Doğrulama **macOS 15 (darwin 25.6.0, arm64)** üzerinde yapıldı: Playwright e2e 2/2 (gerçek dev sunucu + gerçek
Postgres `localhost:5432/fabrika`), vitest 6/6 ve 13/13, Chromium DOM/tıklama kontrolü 38/38, typecheck, lint,
i18n:check. Windows ve Linux'ta **koşulmadı** (bu makinede o platformlar yok). Dokunulan kodun platforma bağlı
hiçbir yanı yok — sunucu tarafı React render'ı, Prisma okuması, JSON katalog metni ve bir `<a href>`; süreç
öldürme, dosya yolu, kabuk/ikili adı, kısayol metni, ekran/DPI veya cihaz izni geçmiyor. Bunu kodu okuyarak
söylüyorum: davranış o platformlarda da aynı olmalı.
