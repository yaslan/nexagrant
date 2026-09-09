# TASK-MTTZ1AYG8RA55 — Temayı sunucuda çerezden çöz, tema init script'ini kaldır

**Ajan:** geli-tirici (BE-EN) · **Sprint:** SPRINT-S12 · **Proje:** cekirdek
**Branch:** dev · **Commit:** `feat(app): resolve the theme on the server from a cookie`

---

## 1. Ne yapıldı

Tema tercihi `localStorage`'dan **`fabrika-theme` çerezine** taşındı ve tema artık kök
layout'ta **sunucuda** çözülüp doğrudan `<html>` etiketine yazılıyor. React ağacında
hiçbir `<script>` düğümü kalmadığı için `"Encountered a script tag"` uyarısının kaynağı
ortadan kalktı — uyarı bastırılmadı, **mekanizması silindi**.

1. **`src/lib/theme.ts` (YENİ)** — sunucu ile tarayıcının paylaştığı sözleşme: `Theme` /
   `ResolvedTheme` tipleri, `THEME_COOKIE_NAME`, `THEME_COOKIE_MAX_AGE`, `parseTheme()`.
   *Bu, karttaki dosya listesinin dışına çıkan tek dosya; gerekçesi §5'te ve ölçülmüş
   hatasıyla birlikte aşağıda.*
2. **`src/app/layout.tsx`** — `cookies()` ile çerez okunuyor; çerez yoksa ya da `system`
   ise `headers()` üzerinden `Sec-CH-Prefers-Color-Scheme` istemci ipucuna bakılıyor.
   Sonuç `<html className="dark" data-theme="dark">` olarak render ediliyor.
   `<head>` bloğu ve `<script src="/theme-init.js">` **kaldırıldı**.
3. **`src/components/ThemeProvider.tsx`** — `initialTheme` / `initialResolvedTheme`
   prop'larını alıyor, başlangıç durumunu sunucudan kuruyor. **Render sırasında
   `localStorage` okuması bitti**; `setTheme` artık çerez yazıyor (`path=/`,
   `max-age=1y`, `SameSite=Lax`, `secure` yalnız https'te). `resolvedTheme` artık
   "her zaman light" ile başlamıyor — sunucunun kararıyla başlıyor.
4. **`next.config.ts`** — yeni `headers()`: her yola `Accept-CH` ve `Critical-CH` =
   `Sec-CH-Prefers-Color-Scheme`.
5. **`public/theme-init.js` SİLİNDİ.**
6. **`tests/e2e/theme-no-script-warning.spec.ts` (YENİ)** — bu kartın asıl amacı olan
   kalıcı makine iddiası: `/tr` ve `/en` yüklenip
   `expect(offenders.length).toBe(0)` ile konsolda tek bir "Encountered a script tag"
   satırı bile olmadığı doğrulanıyor.
7. **`tests/e2e/theme-paint-timing.spec.ts`** — GEVŞETİLMEDİ. Ölçüm birebir aynı
   (chunk'lar 3 sn bloklu, `domcontentloaded`'da okuma); yalnız tercihin nereye
   konduğu `localStorage` yerine **çerez** oldu, çünkü ölçtüğü mekanizma değişti.

**Bilinçli kabuller (kartta yazılı olan):** Chrome/Edge `Sec-CH-Prefers-Color-Scheme`
gönderir; Safari/Firefox istemci ipuçlarını uygulamaz ve göndermez. Orada çerezi olmayan
sistem-karanlık kullanıcı **ilk ziyarette bir kez** açık tema görür, ThemeProvider
hidrasyondan sonra düzeltir, sonraki ziyaretlerde çerez devrededir.

---

## 2. Kanıt

### 2.1 Sunucu render'ı — `curl` çıktıları (çerez var / yok / ipucu var)

```
$ curl -s -H 'Cookie: fabrika-theme=dark' http://localhost:3000/tr | head -c 200
<!DOCTYPE html><html lang="tr" class="dark" data-theme="dark"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/stat

$ curl -s http://localhost:3000/tr | head -c 200
<!DOCTYPE html><html lang="tr" data-theme="light"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/chunks/sr

$ curl -s -H 'Cookie: fabrika-theme=light' http://localhost:3000/tr | head -c 200
<!DOCTYPE html><html lang="tr" data-theme="light"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/chunks/sr

$ curl -s -H 'Sec-CH-Prefers-Color-Scheme: dark' http://localhost:3000/en | head -c 200
<!DOCTYPE html><html lang="en" class="dark" data-theme="dark"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/stat
```

`class="dark"` yalnız çerez `dark` iken **ya da** çerez yokken ipucu `dark` iken var;
çerezsiz/ipuçsuz çağrıda yok. Dördünde de `theme-init.js` script'i yok.

### 2.2 İstemci-ipucu başlıkları gerçekten gidiyor

```
$ curl -s -D - -o /dev/null http://localhost:3000/tr | grep -i "^vary\|^accept-ch\|^critical-ch"
Accept-CH: Sec-CH-Prefers-Color-Scheme
Critical-CH: Sec-CH-Prefers-Color-Scheme
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
```

`Vary` satırı hakkında dürüst not: config'e `Vary: Sec-CH-Prefers-Color-Scheme` **yazıldı
ve ölçülerek geri alındı** — yukarıdaki çıktıda görüldüğü gibi Next her app-router yanıtına
kendi `Vary`'sini yazıp yapılandırılanı eziyor. Koruma sağlamayan bir satırı koruma gibi
bırakmak yerine çıkarıldı ve `next.config.ts`'e neden çıkarıldığı yazıldı. Bugün etkisi yok
(her rota `ƒ`, `Cache-Control: no-cache, must-revalidate`), ama önüne CDN konursa vary
CDN'de ayarlanmalı — riskler bölümünde.

### 2.3 Kartın asıl amacı: konsol uyarısı yok (yeşil)

```
$ pnpm exec playwright test tests/e2e/theme-no-script-warning.spec.ts tests/e2e/theme-paint-timing.spec.ts

Running 4 tests using 1 worker

  ✓  1 [chromium] › tests/e2e/theme-no-script-warning.spec.ts:17:7 › no React script-tag warning on /tr (2.5s)
  ✓  2 [chromium] › tests/e2e/theme-no-script-warning.spec.ts:17:7 › no React script-tag warning on /en (2.5s)
  ✓  3 [chromium] › tests/e2e/theme-paint-timing.spec.ts:26:5 › the theme is in the server HTML, before chunk JS loads (3.5s)
  ✓  4 [chromium] › tests/e2e/theme-paint-timing.spec.ts:57:5 › theme applies immediately on both locales before chunks load (6.9s)

  4 passed (15.9s)
```

### 2.4 İki yönlü kanıt — bozunca KIRMIZI

**(a) Konsol testi.** Kök layout'a geçici olarak `<head><script
dangerouslySetInnerHTML={{__html:'void 0;'}} /></head>` eklendi:

```
Error: [error] Encountered a script tag while rendering React component. Scripts inside
React components are never executed when rendering on the client. Consider using template
tag instead (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template).
    Expected: 0
    Received: 1
      27 |     const offenders = logs.filter((line) => line.includes('Encountered a script tag'));
  2 failed
    [chromium] › tests/e2e/theme-no-script-warning.spec.ts:17:7 › no React script-tag warning on /tr
    [chromium] › tests/e2e/theme-no-script-warning.spec.ts:17:7 › no React script-tag warning on /en
```

**(b) FOUC testi.** `<html>`'den `className`/`data-theme` geçici olarak çıkarıldı
(`data-red-proof` ile değiştirildi):

```
  ✘  1 [chromium] › tests/e2e/theme-paint-timing.spec.ts:26:5 › the theme is in the server HTML, before chunk JS loads (3.5s)
  ✘  2 [chromium] › tests/e2e/theme-paint-timing.spec.ts:57:5 › theme applies immediately on both locales before chunks load (3.6s)
    Expected: true
    Received: false
  2 failed
```

Her iki geçici bozma da geri alındı; §2.3 bu geri almadan sonraki koşudur.

### 2.5 BİLİNEN BEDEL — statiklik: ÖLÇÜLDÜ, **0 rota** statiklikten çıktı

`cookies()` kök layout'u dinamikleştirir; kart bunu önce/sonra ölçmemi istedi. Ölçüm
paylaşılan :3000 dev sunucusuna dokunmamak için ayrı bir `git worktree`'de yapıldı (aynı
HEAD, aynı `.env`, kendi `pnpm install` + `prisma generate`), önce HEAD'de, sonra bu
kartın dosyaları kopyalanarak.

| | **ÖNCE (HEAD 2864499)** | **SONRA (bu kart)** |
|---|---|---|
| Toplam rota | 117 | 117 |
| `●` (SSG, prerender) | **1** | **1** |
| `ƒ` (Dynamic) | **116** | **116** |
| Statiklikten çıkan rota | — | **0** |

Tek `●` rota her iki build'de de aynı ve hâlâ `●`:

```
ÖNCE : ├ ● /[locale]/calls/[region]
SONRA: ├ ● /[locale]/calls/[region]
```

Rota tablosu satır satır karşılaştırıldı:

```
$ diff rt-before.txt rt-after.txt && echo "SAME — 0 routes changed static/dynamic classification"
SAME — 0 routes changed static/dynamic classification
```

Tablo etiketine güvenmeyip ikinci bir yerden de doğrulandı — prerender manifest ve
gerçekten üretilen HTML dosyaları:

```
=== BEFORE prerendered html ===        === AFTER prerendered html ===
.next/server/app/_global-error.html    .next/server/app/_global-error.html

=== BEFORE prerender-manifest routes ===   === AFTER prerender-manifest routes ===
["/_global-error","/favicon.ico"]          ["/_global-error","/favicon.ico"]

$ diff prerendered-before.txt prerendered-after.txt && diff prerender-manifest-before.txt prerender-manifest-after.txt && echo IDENTICAL
IDENTICAL
```

Ölçüm aracının kendisi de sağlamalandı: HEAD iki kez bağımsız build edildi, 117 satırlık
tablo birebir aynı çıktı (`HEAD build reproducible`).

**Yorum, "fark yok" demek yerine rakam:** bedel **0 rota**. Sebebi de rakamla belli —
uygulama zaten neredeyse tamamen dinamik: 117 rotanın 116'sı bu kart öncesinde de `ƒ`
işaretliydi. Prerender edilen tek HTML `_global-error.html` idi ve öyle kaldı.

### 2.6 `pnpm gate` — temiz

```
$ pnpm gate ; echo "EXIT=$?"
EXIT=0
...
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 19 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

### 2.7 Regresyon — tüm e2e paketi

```
$ pnpm exec playwright test
Running 144 tests using 1 worker
...
  5 skipped
  139 passed (3.2m)
```

0 başarısız. Atlanan 5 test bu kartla ilgisiz ve önceden de atlanıyordu
(`invoice-foreign-currency-export` ×4, `price-lock-deeper-campaign` ×1).

### 2.8 Yol boyunca ölçülen gerçek hata (§5'in gerekçesi)

İlk uygulamada `parseTheme` ve `THEME_COOKIE_NAME` doğrudan `ThemeProvider.tsx`'ten
(`'use client'`) import edilmişti. `/tr` ve `/en` **500** döndü. Dev sunucusunun kendi
hata gövdesinden alınan metin:

```
$ curl -s http://localhost:3000/tr | grep -o "Attempted[^\\\"]*"
Attempted to call parseTheme() from the server but parseTheme is on the client. It's not
possible to invoke a client function from the server, it can only be rendered as a
Component or passed to props of a Client Component.
```

Bir `'use client'` modülünün her export'u sunucu tarafında client reference'a dönüşüyor.
Düzeltmeden sonra `/tr` → **200**.

---

## 3. Değişen dosyalar

```
 next.config.ts                          | 32 ++++++++++++++      (headers(): Accept-CH + Critical-CH)
 public/theme-init.js                    | 13 ------            (SİLİNDİ)
 src/app/layout.tsx                      | 40 +++++++++++++---   (cookies()+headers() ile sunucuda çözüm)
 src/components/ThemeProvider.tsx        | 81 ++++++++++--------  (çerez, sunucudan gelen başlangıç)
 tests/e2e/theme-paint-timing.spec.ts    | 49 +++++++++-------    (aynı ölçüm, çerezle)
 src/lib/theme.ts                        | YENİ                  (sunucu/istemci ortak sözleşme)
 tests/e2e/theme-no-script-warning.spec.ts | YENİ                (kartın kalıcı kapısı)
```

Kapsam dışı hiçbir dosyaya dokunulmadı. `any` yok, `@ts-ignore` yok, doğrudan
`process.env` okuması yok. İkinci bir `pnpm dev` başlatılmadı; ölçüm build'leri ayrı bir
worktree'de koştu.

---

## 4. Riskler

1. **Safari / Firefox'ta ilk ziyaret flaşı.** Kartta bilinçli kabul edilen bedel.
   Sistem-karanlık kullanıcı çerezi yokken bir kez açık tema görür; ThemeProvider
   hidrasyondan sonra düzeltir, ilk `setTheme`/toggle'dan sonra çerez kalıcı olur.
   Çerezi olmayan **her** ziyaretçi (ilk kez gelen, çerezi silmiş olan) bu tarayıcılarda
   bu flaşı görmeye devam eder — tek seferlik değil, "çerezsiz her seferinde".
2. **Eski `localStorage` tercihi taşınmıyor.** Bu değişiklikten önce açıkça light/dark
   seçmiş bir kullanıcının tercihi çerezde yok; bir kez daha seçmesi gerekiyor.
   Taşıma effect'i **yazıldı ve geri alındı**: effect içinde `setState` çağırmak zorunda
   ve `react-hooks/set-state-in-effect` bunu reddediyor — `pnpm gate` kırmızıya döndü.
   Kuralı susturmak yerine taşıma çıkarıldı; gerekçe kodda yazılı. Eski
   `fabrika-theme` localStorage anahtarı tarayıcılarda okunmadan duruyor (zararsız).
3. **`Vary` CDN'de ayarlanmalı.** §2.2. Bugün her rota `ƒ` ve `no-cache`, ama önüne bir
   CDN konursa aynı URL'in iki gövdesi olduğu için `Sec-CH-Prefers-Color-Scheme`
   üzerinden vary etmesi söylenmeli, yoksa karanlık belge açık temalı ziyaretçiye gider.
4. **Çerez yazımı `document.cookie` ile, istemcide.** Tema tercihi hassas veri değil,
   `HttpOnly` olamaz (istemcinin yazması gerekiyor). `SameSite=Lax`, `secure` yalnız
   https'te. Kişisel veri içermiyor, loglanmıyor.
5. **`Accept-CH`/`Critical-CH` her yola ekleniyor** (`/:path*`), statik varlık yanıtları
   dahil. Yanıt başına birkaç bayt; doküman isteğine daraltmak `has` koşuluyla mümkün ama
   sessiz başarısızlık riski taşıdığı için tercih edilmedi.

---

## 5. Açık sorular

1. **Kapsam dışına çıkan tek dosya: `src/lib/theme.ts`.** Kart dosya listesini
   `layout.tsx`, `ThemeProvider.tsx`, `next.config.ts`, `tests/e2e`, `theme-init.js`
   silme olarak veriyordu. Tasarımın kendisi (sunucu okur, istemci yazar) sınır tanımayan
   ortak bir modül gerektiriyor: `'use client'` dosyasından sunucuya değer import etmek
   §2.8'deki 500'ü veriyor, çerez adını iki dosyaya kopyalamak ise CLAUDE.md'nin
   "tek kopya" kuralına aykırı. En küçük doğru çözüm 24 satırlık bu modül oldu. Onay
   gerekiyorsa geri alınabilir tek yol, çerez adını iki yere kopyalamaktır — tavsiye
   etmiyorum.
2. **`src/components/ThemeToggle.tsx`** kapsam dışı olduğu için ellenmedi ama artık iki
   yerde eskimiş: yorumu hâlâ "tema `localStorage`'dan gelir" diyor ve `useIsHydrated()`
   ile kendini hidrasyona kadar gizliyor — sunucu artık temayı bildiği için bu gizleme
   gereksiz. Ayrı bir kart açılmalı mı?
3. **`system` seçimi Chrome dışında sunucuda `light`'a düşüyor.** Kabul edildi. İleride
   istenirse çereze `system` yerine çözülmüş değeri de yazan ikinci bir alan
   (`fabrika-theme-resolved`) bu flaşı Safari/Firefox'ta da bitirir.

---

## 6. Sonraki adım

- `dev` branch'ine commit: `feat(app): resolve the theme on the server from a cookie`.
- Patron'un dört kez bildirdiği konsol hatası artık makineyle kapalı: yeni spec bir
  daha ortaya çıkarsa CI'ı kırar (§2.4a bunun kırmızı olduğunu gösteriyor).
- İsteğe bağlı takip: §5.2 (ThemeToggle'ın eskiyen hidrasyon gizlemesi ve yorumu).
- `npm run results:index` bu repoda yok — indeks adımı atlandı.
