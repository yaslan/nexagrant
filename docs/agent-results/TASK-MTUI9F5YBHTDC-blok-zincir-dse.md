# TASK-MTUI9F5YBHTDC — checkout rotasına oturum kapısı (P1)

**Ajan:** blok-zincir-dse (Tasarımcı) · **Tip:** güvenlik düzeltmesi + akış tasarımı
**Platform beyanı:** macOS (darwin 25.6.0, Node/pnpm, zsh) üzerinde doğrulandı. Dokunulan kod yolunun
platforma bağlı hiçbir parçası yok (süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI, izin
diyaloğu yok): yalnızca bir Next.js route handler'ı, bir React bileşeni ve iki test dosyası.
Windows/Linux'ta koşulmadı — koşmaya gerek de yok, çünkü davranış saf TypeScript/HTTP;
`pnpm test:e2e` (Playwright) bu turda **blok-zincir-dev'e ayrılmıştı, bu yüzden koşulamadı** (aşağıda
"Riskler"de açıkça yazıyor).

## 1. Ne yapıldı

### (a) Kapı — `src/app/api/billing/checkout/route.ts`
`const tenantId = session?.tenantId || 'default-tenant';` kaldırıldı; yerine deponun **zaten kullandığı**
kapı yardımcısı kondu (`src/lib/tenant.ts` → `requireTenantApi()`, aynısı
`api/saved-searches`, `api/invitations`, `api/documents/export` rotalarında kullanılıyor — yeni desen
icat edilmedi):

```ts
const scope = await requireTenantApi();
if (!scope.ok) return scope.response;   // 401 · code: TENANT_SCOPE_REQUIRED
const { tenantId } = scope.scope;
```

Kapı, gövde okunmadan ve **hiçbir fiyatlandırma yapılmadan önce** çalışıyor. Bu bilinçli: kapı fiyatlamadan
sonra çalışsaydı, kiracısı olmayan bir çağrı adına yine de `tierForTenant` / `priceLineForTenant` /
`taxLineForTenant` veritabanı sorguları yapılırdı. Reddin maliyeti sıfır olmalı.

### (b) Akışın kullanıcı tarafı — `src/components/cart/CartDrawer.tsx`
Kapı, sepet çekmecesine yeni bir cevap üretti. Çekmece `[locale]/layout.tsx` içinde mount ediliyor, yani
**herkese açık `/tr/fiyatlandirma` sayfasında da duruyor**; oturumsuz bir ziyaretçi "Stripe ile ödemeye geç"
dediğinde çekmecenin varsayılan yolu `setErrorMessage(data.error)` idi — yani Türkçe panele İngilizce
**"Unauthorized"** yazan kırmızı bir kutu ve ileriye giden hiçbir yol yok. Güvenlik düzeltmesinin
kaybedilmiş bir satışa dönüşmesi.

Karar (kullanıcı ihtiyacı gerekçesi): 401 burada bir **hata durumu değil, akışın bir adımı**. Tıklama,
ziyaretçinin kastettiği şeyi yapıyor — giriş sayfasına, geri dönüş adresiyle:

```ts
if (response.status === 401) { setIsSubmitting(false); closeCart();
  router.push(`${getPublicRoute('login', locale)}?callbackUrl=${encodeURIComponent(returnTo)}`); return; }
```

- **Yeni i18n anahtarı gerekmedi** (kural 8 ihlali yok): tek yeni kopya metin yok, mevcut rota yardımcısı
  `getPublicRoute('login', locale)` kullanıldı (`/tr/giris`, `/en/login`). `messages/*.json` dosyalarına
  **dokunulmadı** — o dosyalar şu anda başka bir ajanın çalışması altında.
- **Sepet kaybolmuyor:** `CartProvider` sepeti `localStorage`'da (`fonbridge_cart_items_v2`) tutuyor, bu
  yüzden "giriş yap → geri dön → öde" bir gidiş-dönüş, baştan başlama değil. Test bunu da ölçüyor.
- `closeCart()` + `setIsSubmitting(false)`: çekmece layout'ta kalıcı olduğu için, kapatılmasaydı giriş
  formunun üstünde "Stripe'a bağlanılıyor…" yazan bir panel asılı kalırdı.

### (c) Kapının kırdığı e2e beklentileri — `tests/e2e/plan-storefront.spec.ts`
Bu spec'te üç `request.post('/api/billing/checkout')` çağrısı **oturumsuzdu** (Playwright `request`
fixture'ı tarayıcı çerezini taşımaz) ve 200/400 bekliyordu; kapıdan sonra 401 alırlardı. Spec'in kendi
`encode()` çağrısı `sessionToken()` yardımcısına çıkarıldı ve üç çağrıya `headers: await tenantHeaders()`
eklendi — bu testler *fiyatlandırma* hakkında, kapı hakkında değil. `tests/e2e/price-lock.spec.ts:128`
etkilenmiyor: orada gerçek giriş formundan geçilip `page.request` kullanılıyor, çerez zaten taşınıyor.

## 2. Kanıt (kopyalanmış çıktı)

### Yeni birim test — geçiyor
```
$ npx vitest run tests/billing-checkout-auth.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### Yeşil test kanıt değildir → **mutasyon**: kusur geri konduğunda test kırmızıya dönüyor
`|| 'default-tenant'` satırı geçici olarak geri kondu:
```
 ❯ tests/billing-checkout-auth.test.ts (3 tests | 2 failed) 9ms
     × refuses an anonymous checkout with 401 and prices nothing 7ms
     × refuses a signed-in session that carries no tenant, for the same reason 1ms

 FAIL  tests/billing-checkout-auth.test.ts > POST /api/billing/checkout > refuses an anonymous checkout with 401 and prices nothing
AssertionError: expected 200 to be 401 // Object.is equality
- Expected
+ Received
- 401
+ 200
```
Üçüncü test (oturumlu kiracı 200 alır) mutasyon altında da yeşil kaldı — yani suite "herkesi reddet"
diyerek geçmiyor. Dosya sonra düzeltilmiş haline geri alındı (`grep -n "requireTenantApi()"` → satır 92).

### Çekmece testi — geçiyor + mutasyon
```
$ npx vitest run tests/cart-checkout-signed-out.test.tsx
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
401 dalı `CartDrawer.tsx`'ten geçici olarak çıkarıldığında:
```
 ❯ tests/cart-checkout-signed-out.test.tsx (1 test | 1 failed) 1098ms
     × sends the visitor to the login page and keeps the cart 1098ms
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
```
Dosya geri alındı (`grep -n "response.status === 401"` → satır 85).

### Kapı komutları (bu tura izin verilenler)
```
$ pnpm lint
✖ 2 problems (0 errors, 2 warnings)      # ikisi de docs/agent-results/…-evidence/*.mts, benim değil, önceden vardı
$ pnpm typecheck
$ tsc --noEmit                            # çıktı yok = temiz
$ pnpm test
 Test Files  139 passed | 2 skipped (141)
      Tests  1653 passed | 8 skipped (1661)
```
(Ara koşu — yalnız birim testim eklenmişken — 138 dosya / 1652 test'ti; çekmece testi eklenince
139 / 1653 oldu. Kırmızı yok, atlanan 8 test önceden de atlanıyordu.)

### `'default-tenant'` artık hiçbir kod yolunda yok
```
$ grep -rn "default-tenant" src tests prisma scripts
src/app/api/billing/checkout/route.ts:86:    // `'default-tenant'` — an id that exists in no seed, no script and no
tests/billing-checkout-auth.test.ts:7: * `session?.tenantId || 'default-tenant'`. That fallback names a tenant that
tests/billing-checkout-auth.test.ts:107:    expect(JSON.stringify(body)).not.toContain('default-tenant');
```
Kalan üç eşleşmenin üçü de **çalışan kod değil**: ikisi neyin neden kaldırıldığını anlatan yorum, biri de
"cevap bu kimliği içermesin" diyen negatif iddia. Yürütülen tek bir satırda geçmiyor.

## 3. Değişen dosyalar
| Dosya | Ne |
|---|---|
| `src/app/api/billing/checkout/route.ts` | `requireTenantApi()` kapısı; `auth` importu ve `'default-tenant'` fallback'i kaldırıldı (+16/−3) |
| `src/components/cart/CartDrawer.tsx` | 401 → giriş sayfasına `callbackUrl` ile yönlendirme; sepet korunur (+18) |
| `tests/billing-checkout-auth.test.ts` | **yeni** — 3 test: anonim 401 + hiçbir şey fiyatlanmaz, kiracısız oturum 401, oturumlu kiracı 200 ve kendi kiracı kimliğiyle |
| `tests/cart-checkout-signed-out.test.tsx` | **yeni** — çekmece 401 aldığında giriş sayfasına gider, "Unauthorized" göstermez, sepeti kaybetmez |
| `tests/e2e/plan-storefront.spec.ts` | üç API çağrısına oturum çerezi (`tenantHeaders()`); `signIn` `sessionToken()` üzerinden (+24/−3) |

## 4. Riskler
1. **e2e koşulamadı.** `pnpm test:e2e` bu turda blok-zincir-dev'e ayrılmıştı (çakışma kuralı), bu yüzden
   `tests/e2e/plan-storefront.spec.ts`'teki düzeltmem **canlı koşuyla doğrulanmadı** — yalnızca `pnpm typecheck`
   ile tip düzeyinde temiz. Bir sonraki e2e koşusunda bu spec özellikle izlenmeli. Çerez kurulumu spec'in kendi
   `encode()` çağrısının birebir aynısı, yalnız `page.context().addCookies` yerine `cookie:` başlığı olarak.
2. **`workspace` parametresi hâlâ istemciden geliyor** (`success_url`/`cancel_url` için). Artık kimliği
   doğrulanmış bir kiracıdan geliyor, ama oturumun kendi workspace listesine karşı doğrulanmıyor. Etkisi
   yönlendirme URL'siyle sınırlı; kapsam dışı bıraktım, bildiriyorum.
3. Ödeme akışının kendisi (Stripe canlı anahtarları) bu ortamda demo modda; kapının canlı Stripe yolunda
   davranışı aynı kod yolundan geçiyor ama canlı anahtarla ölçülmedi.

## 5. Yolda görülen, DÜZELTİLMEYEN bulgular (`src/app/api/billing/` altı — bildirim, kapsam dışı)
- **`src/app/api/billing/quote/route.ts:39-40`** — `const session = await auth(); const tenantId = session?.tenantId ?? null;`
  Oturum kapısı **yok**. Bu bir açık değil, bilinçli bir tasarım gibi duruyor: herkese açık fiyatlandırma
  sayfasındaki sepet bu uçtan fiyat alıyor ve `tenantId === null` iken kiracıya ait hiçbir şey okunmuyor
  (`tierForTenant` çağrılmıyor, `getActiveTier()` vitrin katmanı kullanılıyor). Ödeme başlatmıyor, para
  yüzeyi yok. **Yine de bir karar noktası:** anonim çağrıya `priceLineForTenant(..., null)` ile plan
  görünürlüğü çözülüyor; buranın kasten anonim olduğu bir yorumla sabitlenmezse bir sonraki denetimde
  aynı bulgu olarak tekrar açılır.
- **`src/app/api/billing/portal/route.ts:8-27`** — 401 kapısı **var** (doğru). Ancak kiracı, oturumdan değil
  `prisma.membership.findFirst({ where: { userId, role: { in: [OWNER, ADMIN] } } })` ile seçiliyor: birden
  fazla kiracıda yetkili bir kullanıcı için **hangi kiracının** fatura portalının açılacağı sıralamaya kalmış,
  oturumun aktif kiracısı değil. `requireTenantApi()` buraya da doğal adaydır. Düzeltmedim.
- **`src/app/api/billing/invoices/[id]/export/route.ts:54-56`** — 401 kapısı var, kiracı kontrolü mevcut. Sorun görülmedi.
- **`src/components/BillingActions.tsx:22`** — checkout'a POST atan ikinci istemci; ama bileşen **hiçbir yerde
  render edilmiyor** (`grep -rn "BillingActions" src --include="*.tsx"` → yalnızca kendi dosyası). Ölü kod;
  `alert('Failed to load checkout: ' + data.error)` ile 401'i ham gösterirdi. Silmedim, kapsam dışı.

## 6. Açık sorular
1. `/api/billing/quote` kasten anonim mi? Öyleyse rotanın başına "bu uç bilerek oturumsuzdur, çünkü …"
   diyen bir yorum + bir test istiyorum; değilse ayrı bir kart.
2. Oturumsuz ziyaretçi giriş yaptıktan sonra `callbackUrl` ile fiyatlandırma sayfasına dönüyor, sepeti
   duruyor — ama **çekmece kapalı** dönüyor. "Dönünce çekmece kendiliğinden açılsın mı?" bir ürün kararı;
   şu an açmıyorum (kullanıcının niyeti hakkında varsayım yapmamak için), istenirse `?cart=open` ile eklenebilir.

## 7. Sonraki adım
- blok-zincir-dev'in e2e koşusunda `tests/e2e/plan-storefront.spec.ts` yeşil mi — tek doğrulanmamış parça bu.
- Yukarıdaki iki bulgu (`quote` niyet beyanı, `portal` kiracı seçimi) için karar/kart.
