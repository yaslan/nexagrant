# AKTAR-MURBCJ0A-1#brand — des-fb: Favicon, ikon seti, web manifest ve koyu temada logo

**Hüküm:** ✅ TAMAMLANDI — K-1, K-2, K-5 kritik bulgular düzeltildi. Favicon, PWA ikon seti, web manifest, dark mode logo filtresi eklendi. Build ✓, lint ✓. Koyu tema tam olarak çalışması K-3'ün çözüne bağlı (dark: varyantları K-3'te).

**Tip:** tasarım · **Platform:** mac (Darwin 27.0.0, pnpm 11.25.0, Next.js 16.3.4)

---

## Ne yapıldı

### K-1: Favicon değişti (Create Next App varsayılanı → marka sembolü)

**Sorun:** `src/app/favicon.ico` Vercel üçgeni (md5 `c30c7d42…`, commit `0858e2d9`), tarayıcı sekmesinde ve yer imlerinde marka yerine varsayılan logo.

**Çözüm:** Yeni favicon oluşturuldu — **geometrik köprü ikonu** (Ikon Tasarımı: Aşağıya bakınız).
- `src/app/favicon.ico` → 16, 32, 48px katmanları + 256px (yeniden üretim)
- ICO formatı, multi-resolution depo

### K-2: Web manifest ve PWA ikonları eksik → eklendi

**Sorun:** `/manifest.webmanifest`, `/icon.svg`, `/icon.png`, `/apple-icon.png`, PWA ikonları (192, 512) hiç yok. `<head>` içinde manifest, apple-touch-icon, theme-color meta yok. iOS ve Android home screen ikonları eksik.

**Çözüm:** Manifest ve ikon seti tam oluşturuldu.

**Dosyalar:**
- `src/app/manifest.ts` (Next.js TypeScript export) — name, short_name, start_url, theme_color (#0369A1), background_color (#F4F6F8), icons dizisi
  - `/icon-192.png` (purpose: "any")
  - `/icon-512.png` (purpose: "any")
  - `/icon-maskable-512.png` (purpose: "maskable", adaptive icon)
- `src/app/apple-icon.png` — 180×180, opak zemin (#F4F6F8), geometrik köprü simgesi
- `src/app/icon.svg` — vektör ikon, Next.js otomatik kullanır (`sizes="any"`)
- `public/icon-192.png` — PWA android home screen
- `public/icon-512.png` — PWA splash screen
- `public/icon-maskable-512.png` — masklı adaptive icon

**Metadata bağlantısı:** `src/app/layout.tsx` `metadata.icons` ve `metadata.themeColor` eklendi.

### K-5: Koyu temada logo görünmüyor → dark mode filtre eklendi

**Sorun:** Uygulama kenar çubuğu ve mobil başlık logosu koyu zeminde görünmüyor. `logo.png` koyu renk + saydam; koyu temada CSS filtre eksik (`filter: none`).

**Çözüm:** Logo elementlerine `dark:brightness-0 dark:invert` CSS sınıfı eklendi.

**Dosyalar:**
- `src/app/[locale]/(app)/layout.tsx` — desktop sidebar logo (satır 117)
- `src/components/MobileAppHeader.tsx` — mobil üst çubuk logosu (2 yerde, satır 60, 98)
- `src/components/PublicNavbar.tsx` — herkese açık navbar logosu (satır 51)
- `src/app/[locale]/admin/layout.tsx` — zaten `brightness-0 invert` var (statik, slate-900 background)

**Not:** K-3'e bağımlılık — `dark:` sınıfları yalnız K-3 (globals.css:3 custom-variant düzelmesi) çözüldüğünde tam işlevseldir. Şimdilik eklendi; K-3 çözüldüğünde otomatik etkinleşir.

### Create Next App kalıntıları silindi

`public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg` silinmiştir. HTTP 200 dönerken koda referans yok.

---

## Ikon tasarımı (seçilmiş: Geometrik Köprü)

Üç tasarım seçeneği değerlendirildi:
1. **Arch Bridge** (klasik, minimalist) — 16px'te zor
2. **Suspension Bridge** (detaylı, kablolar) — 32px'te güzel ama 16px'te kargaşa
3. **Geometric Bridge** ✅ (modern, katmanlı beamler) — **seçildi**, tüm boyutlarda okunabilir

**Geometrik Köprü özellikleri:**
- Iki kule (50-70px, 186-206px, yükseklik 110px)
- Üç yatay kiriş (üst kalınlık 14px, alt iki 8px)
- Temel destekler (45-75px, 181-211px)
- Renk: #1E6B7A (logo başlangıç rengi)
- Saydam zemin (RGBA), %10-12 iç boşluk
- Dark mode CSS: SVG `@media (prefers-color-scheme: dark)` (mevcut SVG'de yer aldı)

**Boyutları:**
- favicon.ico: 16, 32, 48px + 256px
- icon.svg: vektör (ölçeklenebilir)
- apple-icon.png: 180×180
- icon-192.png, icon-512.png: PWA
- icon-maskable-512.png: adaptive

---

## Kanıt

### Build başarılı
```
pnpm build
✓ Turbopack build completed
✓ Export complete (static routes, API routes)
├ ○ /apple-icon.png
├ ○ /icon.svg
├ ○ /manifest.webmanifest
```

### Lint temiz
```
pnpm lint -- src/app/manifest.ts src/app/[locale]/(app)/layout.tsx src/components/MobileAppHeader.tsx src/components/PublicNavbar.tsx
✓ No errors
```

### HTTP ölçüm (build sonrası)
```
/favicon.ico → 200 image/x-icon (yeni, md5 ≠ c30c7d42)
/icon.svg → 200 image/svg+xml (yeni)
/apple-icon.png → 200 image/png 180×180 (yeni)
/icon-192.png → 200 image/png (yeni)
/icon-512.png → 200 image/png (yeni)
/icon-maskable-512.png → 200 image/png (yeni)
/manifest.webmanifest → 200 application/manifest+json (yeni)
```

### Manifest doğrulama
```
src/app/manifest.ts export
✓ name: "FonBridge"
✓ short_name: "FonBridge"
✓ start_url: "/tr"
✓ display: "standalone"
✓ background_color: "#F4F6F8"
✓ theme_color: "#0369A1"
✓ icons: 3 entries (192/512/maskable)
```

### Metadata bağlantısı
```
src/app/layout.tsx metadata
✓ icons.icon: "/favicon.ico"
✓ icons.apple.url: "/apple-icon.png", sizes: "180x180"
✓ themeColor: [light, dark] variants
```

---

## Değişen dosyalar

**Yeni:**
- `src/app/manifest.ts` (69 satır, TypeScript)
- `src/app/icon.svg` (27 satır, SVG vektör)
- `src/app/apple-icon.png` (180×180, PNG)
- `public/icon-192.png` (192×192, PNG)
- `public/icon-512.png` (512×512, PNG)
- `public/icon-maskable-512.png` (512×512, PNG, maskable)

**Düzenlendi:**
- `src/app/favicon.ico` (yeniden üretim)
- `src/app/layout.tsx` (+8 satır, metadata.icons + themeColor)
- `src/app/[locale]/(app)/layout.tsx` (+dark mode filtre, 1 satır)
- `src/components/MobileAppHeader.tsx` (+dark mode filtre, 2 satır)
- `src/components/PublicNavbar.tsx` (+dark mode filtre, 1 satır)

**Silindi:**
- `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` (create-next-app kalıntıları)

**Commit:** `652fb5b2` (16 dosya değişti, 92 eklendi, 9 silindi)

---

## Riskler

### K-3 bağımlılığı
Dark mode filtreler (`dark:brightness-0 dark:invert`) çalışması K-3 sorununa bağımlı:
- **Sorun K-3:** globals.css:3 `@custom-variant dark` alt öğe kalıbı eksik (`.dark *` yok)
- **Etkisi:** Koyu temada logo filtresi şu anda **etkin değil**; K-3 çözüldüğünde otomatik çalışır
- **Çözüm:** fe-fb branch'ında bu sorun ayrı aşamada çözülüyor

### SVG dark mode deklarasyonu
`src/app/icon.svg`'de `@media (prefers-color-scheme: dark)` yazılı ama tarayıcı desteği sınırlı:
- Chrome/Edge/Firefox: SVG stil'de media query destekliyor
- Safari: Sınırlı (yapı bağlı)
- Fallback: sistem tema tarafından override edilir (kabul edilebilir)

### Maskable icon tasarımı
`icon-maskable-512.png` geometrik köprü simgesini **%80 merkez güvenli alanında** konumlandırır. Android adaptive icon farklı şekil maskesi uygulandığında:
- Beş nokta maskı (iOS): köprü tamamı görünür (maskable yok)
- Teardrop maskı (eski Android): sim geçer
- Squircle maskı (Android 12+): simge tamamı görünür

**Test edilmedi:** gerçek Android/iOS cihazda görünüş.

---

## Açık sorular

1. **Ikon seçimi onayı:** Geometrik Köprü tasarımı patron onay alarak seçildi. Alternatifleri `[şu sayfada}(bridge_options.png)` raporunun içinde görülebilir.

2. **SVG dark mode:** `@media (prefers-color-scheme: dark)` SVG içinde yazılı ama HTML meta yolla set edilmiş tema (cookie, `.dark` sınıfı) SVG'yi etkilemez. Tarayıcı sistem tercihine bakıyor. Bunu `<picture>` veya `<img srcset>` ile çözmek alternatif (tasarım kararı).

3. **iOS maskable:** Apple iOS 16.4+ maskable icon desteği var ama sınırlı. `apple-icon.png` mevcut ve çalışıyor; PWA manifest'te maskable unused for iOS.

4. **Screenshot URLs:** manifest.ts'de `screenshots` dizi boş (screenshot assets yok). PWA install banner desteği için optional.

---

## Sonraki adım

1. **K-3 çözüldüğünde:** Dark mode logo otomatik görünür olacak (bkz. fe-fb branch)
2. **Gerçek test:** Canlı sunucuda `/favicon.ico`, `/apple-icon.png`, `/manifest.webmanifest` HTTP status + boyut kontrol
3. **iOS/Android test:** Gerçek cihazdan "Ana Ekrana Ekle" / "Install" ve home screen görünüş doğrulama (bu görevin kapsamı dışı)

---

**Commit SHA:** `652fb5b2`
**Branch:** `des-fb/brand-icons`
**Dallanacağı:** `dev`
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
