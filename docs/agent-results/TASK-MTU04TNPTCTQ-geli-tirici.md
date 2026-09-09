# TASK-MTU04TNPTCTQ — Hidrasyon uyuşmazlığını kapat (sepet + çerez onayı)

**Ajan:** geli-tirici (BE-EN) · **Sprint:** SPRINT-S12 · **Branch:** dev
**Commit:** `fix(cart): stop reading storage during render so the tree hydrates`

## 1. Ne yapıldı

Kök neden liderin ölçtüğü gibiydi ve iki yüzeyde birebir aynıydı: `localStorage` **render sırasında**,
bir `useState` başlatıcısından okunuyordu. Başlatıcı sunucuda da çalışır, orada storage yoktur, dolayısıyla
sunucu boş sepet / gizli banner üretir; istemcinin ilk render'ı ise gerçek sepeti okur ve buton ağaca girer.

- **`src/components/cart/CartContext.tsx`** — `useState<CartItem[]>(readStoredItems)` kaldırıldı.
  Depodan okuma artık `useIsHydrated()` (repodaki mevcut kanca, `useSyncExternalStore`) `true` olduktan
  sonra, `useMemo` içinde bir kez yapılıyor. Oturumda yapılan değişiklikler ayrı bir `editedItems`
  state'inde tutuluyor; `cartItems = editedItems ?? restoredItems`. Mutasyonlar (`addToCart`,
  `removeFromCart`, `clearCart`) tek bir `updateItems(update)` sarmalayıcısından geçiyor ve
  **saklanan sepeti** düzenliyor, hidrasyon-öncesi boş yer tutucuyu değil.
- **`src/components/cart/CartContext.tsx` (yazma efekti)** — yazma mantığı değiştirilmedi, ama
  `if (!isHydrated) return;` guard'ı eklendi. Bu **zorunluydu**: guard olmadan ilk commit'ten sonra
  efekt boş yer tutucuyu (`[]`) storage'a geri yazıp **her sayfa yüklemesinde sepeti siliyordu**.
  Bu, aşağıdaki gerçek-tarayıcı kalıcılık testiyle doğrulandı.
- **`src/components/CookieConsent.tsx`** — aynı desen. Görünürlük artık
  `isHydrated && !answered && !dismissed`; storage okuması `useIsHydrated` sonrası `useMemo`'da.
  `setVisible(false)` → `setDismissed(true)`; storage anahtarı `CONSENT_STORAGE_KEY` sabitine alındı.
- **`tests/e2e/hydration-clean.spec.ts` (yeni, kalıcı kapı)** — `addInitScript` ile
  `fonbridge_cart_items_v2` **dolduruluyor** ve consent anahtarı siliniyor, sonra `/tr` ve `/en`
  yükleniyor; konsol + `pageerror` toplanıp "Hydration failed" satırı sayılıyor. Ayrıca yalancı-yeşile
  karşı iki koruma: yüzen sepet butonu ve `alertdialog` gerçekten görünür olmalı — yoksa yakalanacak
  bir uyuşmazlık zaten yok demektir.
- `src/components/cart/CartDrawer.tsx` ve `src/lib/hooks/use-is-hydrated.ts` **değiştirilmedi**.

## 2. Kanıt

### 2.1 KIRMIZI — düzeltme geçici olarak geri alındı (`git checkout --` iki bileşen), spec aynı

```
$ npx playwright test tests/e2e/hydration-clean.spec.ts
Running 2 tests using 1 worker

  ✘  1 [chromium] › hydration-clean.spec.ts:35:7 › no hydration mismatch on /tr with a full cart and the cookie banner (2.6s)
  ✘  2 [chromium] › hydration-clean.spec.ts:35:7 › no hydration mismatch on /en with a full cart and the cookie banner (2.6s)

  1) … › no hydration mismatch on /tr …

    Error: [pageerror] Hydration failed because the server rendered HTML didn't match the client. …
      ...
                            <CartProvider activeTier={{code:"NONE", ...}}>
                              <OuterLayoutRouter>
                              <CartDrawer locale="tr">
    +                           <button
    +                             onClick={function toggleCart}
    +                             className="fixed bottom-6 right-6 z-40 bg-[#22d3ee] …"
    +                             aria-label="Sepeti aç"
    +                           >
    -                           <script id="_R_">
                              ...

    expect(received).toBe(expected) // Object.is equality
    Expected: 0
    Received: 1
```

React'ın verdiği ağaç farkı, kartta bildirilen hatanın **aynısı**: istemci
`<button aria-label="Sepeti aç">` render ediyor, sunucu o konumda etmiyor.

### 2.2 YEŞİL — düzeltme geri konuldu, mevcut tema kapıları da aynı koşuda

```
$ npx playwright test tests/e2e/hydration-clean.spec.ts tests/e2e/theme-no-script-warning.spec.ts tests/e2e/theme-paint-timing.spec.ts
Running 6 tests using 1 worker

  ✓  1 [chromium] › hydration-clean.spec.ts:35:7 › no hydration mismatch on /tr with a full cart and the cookie banner (2.5s)
  ✓  2 [chromium] › hydration-clean.spec.ts:35:7 › no hydration mismatch on /en with a full cart and the cookie banner (2.5s)
  ✓  3 [chromium] › theme-no-script-warning.spec.ts:17:7 › no React script-tag warning on /tr (2.4s)
  ✓  4 [chromium] › theme-no-script-warning.spec.ts:17:7 › no React script-tag warning on /en (2.4s)
  ✓  5 [chromium] › theme-paint-timing.spec.ts:26:5 › the theme is in the server HTML, before chunk JS loads (3.4s)
  ✓  6 [chromium] › theme-paint-timing.spec.ts:57:5 › theme applies immediately on both locales before chunks load (6.8s)

  6 passed (20.5s)
```

### 2.3 Gerçek tarayıcı — sepet UI'dan eklendi, sayfa yenilendi, sepet korundu

Geçici (atılan) bir spec ile `/tr/pricing` üzerinde gerçek tıklama: önce çerez banner'ı
"Tümünü Kabul Et" ile kapatıldı (banner gerçekten render oluyor — ilk denemede tıklamayı
engelleyip testi düşürdü), sonra gerçek "Sepete ekle" butonuna tıklandı.

```
$ npx playwright test tests/e2e/tmp-cart-persist.spec.ts
Running 1 test using 1 worker

AFTER ADD  storage = [{"sku":"plan-ultra","type":"plan","name":"Ultra · Yıllık","subtitle":"Tüm ekosistem ve kurumsal konsorsiyumlar","billingCycle":"yearly","quantity":1}]
AFTER RELOAD storage = [{"sku":"plan-ultra","type":"plan","name":"Ultra · Yıllık","subtitle":"Tüm ekosistem ve kurumsal konsorsiyumlar","billingCycle":"yearly","quantity":1}]
AFTER RELOAD cart button text = Sepetim
1
  ✓  1 [chromium] › tmp-cart-persist.spec.ts:3:5 › cart survives a reload, added through the real UI (3.3s)

  1 passed (3.9s)
```

Yenileme sonrası storage aynı, yüzen sepet butonu görünür, hidrasyon hatası yok.
(Bu spec kalıcı değil — yazma-guard'ını doğrulamak için yazıldı ve silindi.)

### 2.4 `use-read-notifications.ts` — DOKUNULMADI, ölçüldü (bkz. Açık sorular)

Atılan bir probe spec'i: gerçek oturum çerezi mint edildi, `fonbridge_read_notifs_<email>` ve
`fonbridge_read_notifs_guest` anahtarları **dolduruldu** (yani istemci snapshot'ı sunucununkinden
farklı), `/tr/<ws>/notifications` yüklendi. O rota hem `notifications/client.tsx`'i hem de
`(app)/layout.tsx`'teki `UserMenu`'yu render eder — kancanın iki tüketicisi de kapsandı.

```
$ npx playwright test tests/e2e/tmp-notif-probe.spec.ts
Running 1 test using 1 worker

[seed-plan-e2e] ready — ultra=plan-e2e-ultra-ws (ultra) flip=plan-e2e-flip-ws (pro)
URL: http://localhost:3000/tr/plan-e2e-ultra-ws/notifications
H1: Bildirimler
MISMATCH LINES: 0 
[seed-plan-e2e] rolled back
  ✓  1 [chromium] › tmp-notif-probe.spec.ts:13:5 › probe: notifications read-overlay hydrates clean with storage seeded (2.5s)

  1 passed (3.4s)
```

### 2.5 Tam kapı

```
$ pnpm gate
 Test Files  132 passed | 2 skipped (134)
      Tests  1559 passed | 8 skipped (1567)
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü:
   okuma ve yazma, kiracı sınırında reddedildi.
```

Lint: `✖ 2 problems (0 errors, 2 warnings)` — her ikisi de **önceden var olan**, bu görevle ilgisiz
uyarılar (`docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts`, `f4-rag-probe.mts`:
kullanılmayan değişken). Dokunduğum üç dosyada eslint temiz:

```
$ npx eslint src/components/cart/CartContext.tsx src/components/CookieConsent.tsx tests/e2e/hydration-clean.spec.ts
(çıktı yok)
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok)
```

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/components/cart/CartContext.tsx` | Depodan okuma render başlatıcısından çıktı → `useIsHydrated` + `useMemo`; `updateItems` sarmalayıcısı; yazma efektine hidrasyon guard'ı |
| `src/components/CookieConsent.tsx` | Aynı desen; `visible` türetilmiş değer oldu, `dismissed` state'i eklendi |
| `tests/e2e/hydration-clean.spec.ts` | **Yeni** kalıcı kapı: dolu sepet + görünür banner ile /tr ve /en'de sıfır hidrasyon hatası |

Değiştirilmeyenler (kapsam gereği): `CartDrawer.tsx`, `use-is-hydrated.ts`, `use-read-notifications.ts`.

## 4. Riskler

- **Kabul edilen davranış:** yüzen sepet butonu ve çerez banner'ı artık ilk boyamada değil,
  hidrasyondan bir kare sonra beliriyor. Kartta açıkça kabul edilmişti.
- **Yazma guard'ı kapsam dışı bir dokunuş sayılabilir.** Kart "yazma mantığına dokunma" diyor; mantık
  aynı kaldı, yalnızca hidrasyon-öncesi tetiklenmesi engellendi. Guard olmadan düzeltme sepeti siliyordu
  (2.3'teki kalıcılık ölçümü bunu yakalar).
- `updateItems` her render'da yeniden oluşan bir fonksiyon; context value zaten memoize edilmemişti,
  yani mevcut render davranışı değişmedi. Ayrı bir performans işi olarak durabilir.
- Sekmeler arası senkron yok: bir sekmede sepeti değiştirmek diğerini güncellemez. Bu düzeltmeden
  **önce de** böyleydi (tek okuma mount'ta yapılıyordu); regresyon değil.

## 5. Açık sorular

- **`src/lib/hooks/use-read-notifications.ts` SSR açısından güvenli mi? — Evet, ölçüldü (2.4).**
  Dosyanın kendi yorumu bunun bilinçli bir `useSyncExternalStore` tasarımı olduğunu söylüyor ve ölçüm
  bunu doğruluyor: `getServerSnapshot` sabit `'["",""]'` döndürüyor (referansen kararlı), React sunucu
  render'ında ve hidrasyon pass'inde onu okuyor, ardından istemci snapshot'ına geçiyor — yani
  `useIsHydrated` ile aynı mekanizma. Depoda dolu anahtarlarla yüklenen `/tr/<ws>/notifications`
  sayfasında sıfır uyuşmazlık.
  Tek not: `subscribe()` `window`'a guard'sız dokunuyor. React `subscribe`'ı sunucuda hiç çağırmadığı
  için pratikte sorun değil, ama dosyadaki tek tarayıcı-varsayımı orası. Bu kartta dokunulmadı.
- Aynı desenin (render sırasında `localStorage`) başka bileşenlerde kalıp kalmadığı repo genelinde
  taranmadı; bu kartın kapsamı iki yüzeydi. Ayrı bir tarama görevi değerli olabilir.

## 6. Sonraki adım

- Kalıcı kapı `tests/e2e/hydration-clean.spec.ts` CI'da koşuyor olmalı (mevcut `pnpm test:e2e` globu
  onu zaten topluyor).
- İsteğe bağlı: repo genelinde "render sırasında `localStorage`/`window` okuması" taraması ve gerekirse
  bir lint kuralı.
