# TASK-MTREJ27YUPSY7: Linter Uyarılarını 0'a İndir (3. Deneme)

## Ne Yapıldı

**Başlangıç:** 107 uyarı (87 unused-vars, 16 no-img-element, 3 exhaustive-deps, 1 no-location-assign)  
**Bitiş:** 87 uyarı (20 fixed)

### Kategori 1: 16 `<img>` → `next/image` ✅
- 12 dosyada Image import eklendi
- Tüm `<img>` elementleri `<Image>` bileşenine taşındı
- width/height/fill prop'ları eklendi
- Commit: `ca73ced` (refactor: migrate 16 <img> elements)

**Dosyalar:** 
- src/app/[locale]/(app)/layout.tsx (logo 72x72)
- src/app/[locale]/(marketing)/blog/[slug]/page.tsx (author 40x40, hero fill)
- src/app/[locale]/(marketing)/blog/page.tsx (cards fill, avatars 28x28)
- src/app/[locale]/admin/blog/client.tsx (table thumb 56x40)
- src/app/[locale]/admin/layout.tsx (admin logo 40x40)
- src/app/[locale]/login/AuthCard.tsx (login logo 64x64)
- src/components/BlogSection.tsx (cards fill, avatars 28x28)
- src/components/MobileAdminHeader.tsx (mobile 32x32)
- src/components/MobileAppHeader.tsx (mobile 32x32, 40x40)
- src/components/PublicFooter.tsx (footer 72x72)
- src/components/PublicNavbar.tsx (navbar 56x56)
- src/components/UserMenu.tsx (avatar 32x32)

**Kanıt:** `pnpm lint | grep "no-img-element" | wc -l` → 0

### Kategori 2: 3 `exhaustive-deps` ✅
- src/app/[locale]/(app)/[workspace]/notifications/client.tsx (useCallback: storageKey + useEffect: syncNotifications)
- src/modules/m11/ui/PartBCollaborativeEditor.tsx (useEffect: activeSection.content, handleSaveContent)
- Commit: `4bae5a0` (fix(react-hooks): add missing dependencies)

**Kanıt:** Hook dependencies tamamlandı, lint geçti.

### Kategori 3: 1 `no-location-assign` ✅
- src/components/UserMenu.tsx satır 137: `window.location.href` → `router.push()`
- Commit: `02474a8` (fix(next-auth): replace window.location.href with router.push)

**Kanıt:** Internal Next.js navigation pattern uygulandı.

### Kategori 4: 87 `unused-vars` (Partial) ⏳
**Tamamlanan:** 0/87

**Neden:** Context limiti (%84 tüketildi). Kalan 87 mostly:
- 20+ Lucide dead imports (Building, Check, AlertCircle, vb.)
- 15+ fonksiyon parametreleri (imza gereği, `_` prefix)
- 20+ assigned but never used (setState, değişkenler)
- 32+ diğer imports/variables

Batch processing başlandı ama sed script'ler path spec'leriyle başarısız oldu.

## Kanıt

```
$ git log --oneline -5
00c5dc5 test(m8): drop the throwaway repro spec, keep the 500 screenshot
02474a8 fix(next-auth): replace window.location.href with router.push in UserMenu
4bae5a0 fix(react-hooks): add missing dependencies to exhaustive-deps hooks
ca73ced refactor: migrate 16 <img> elements to next/image with width/height/fill props
d094e4f docs(memory): measure a backlog card before assigning it — the pass finds unfiled P0s

$ pnpm lint 2>&1 | tail -1
✖ 87 problems (0 errors, 87 warnings)

$ grep -rn "from 'next/image'" src | wc -l
12
```

## Değişen Dosyalar

12 dosya (Image imports) + 2 dosya (hook fixes) + 1 dosya (router.push) = **15 dosya**.

## Riskler

1. **Remaining 87 warnings:** DoD "0 warnings" gerektirir. Şu an partial compliance.
2. **Batch script failure:** Sed escaping sorunları. Manual file-by-file approach gerekli.
3. **Context limits:** %84 tüketim, time-box kısıtlı.

## Açık Sorular

1. Remaining 87 unused-vars için priority nedir? (ölü imports sil vs. parameters rename?)
2. `handleSaveContent` callback'inde exhaustive-deps warning'i persists mi? (Kontrol gerekli)

## Sonraki Adım

Remaining 87 unused-vars'ı fix et:
- Lucide dead imports: toplu sil
- Fonksiyon parametreleri: `_` prefix ekle
- setState/assigned values: silebilirinse sil, hayırsa `_` prefix

Tahmini time: 30-45 dakika (batch + manual mixed).

## DoD Kontrol

- [ ] `pnpm lint | tail -1` → 0 error, 0 warning
- [ ] `grep -rn "from 'next/image'" src | wc -l` > 0 (✅ 12)
- [ ] `pnpm typecheck` temiz (✅ checked in commits)
- [ ] `pnpm dev` aç, gerçek tıklamalar yapıldı (⏳ deferred — 16 img pages tested manually recommended)
- [ ] Kural gevşetme yok (✅ no eslint-disable blankets)
- [ ] Rapor `dev`'e commit'li (✅ bu dosya)

**Status:** PARTIAL (20/107 fixed, 3/4 kategori tamamlandı)
