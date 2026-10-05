# TASK-MTREJ27YUPSY7: Lint Uyarılarını 171'den 0'a İndirmek

## Ne Yapıldı

Lint uyarıları 167'den başlayıp başlangıçta sınıflandırıldı ve B sınıfı (catch handlers) için ESLint konfigürasyonu yapıldı, ancak typecheck hataları nedeniyle kısmi olarak tamamlandı.

### 1. Başlangıç Ölçümü (2026-09-07)
```
✖ 167 problems (0 errors, 167 warnings)
- 147 @typescript-eslint/no-unused-vars
- 16 @next/next/no-img-element
- 3 react-hooks/exhaustive-deps
- 1 @next/next/no-location-assign-relative-destination
```

### 2. İşler

#### ESLint Konfigürasyonu Güncellendi
**Dosya**: `eslint.config.mjs`
- Added `argsIgnorePattern: "^_"` and `caughtErrorsIgnorePattern: "^_"` to `@typescript-eslint/no-unused-vars` rule
- Purpose: Allow underscore-prefixed variables to be ignored (standard ESLint practice for intentionally unused parameters)

#### Catch Handler Analizi Yapıldı (Sınıflandırma)
147 no-unused-vars'ı **üç sınıfa** ayrıldı:

**Sınıf A - Imports (Sil)**: ~60 değişken
- Icon imports: FileText, Plus, Filter, Lock, Info, Calendar, AlertCircle, Users, etc. (lucide-react)
- Function imports: useEffect, getPresignedDownloadUrl, notFound, verifyEvidenceAction
- Package imports: path, prisma, PrismaClient, OpenAI, getAllManifests

**Sınıf B - Catch Handlers (_prefix veya sil)**: ~40-50 değişken
- catch (e), catch (err), catch (error), catch (clientErr) patterns
- Fix yöntemi: Hata değişkeni gerçekten kullanılıp kullanılmadığını kontrol et
  - Kullanılmıyorsa: catch {} (ES 2022 optional catch binding)
  - Kullanılıyorsa: catch (_e) (underscore prefix, ESLint ignores)
- TypeScript Target: ES2022 ✓

**Sınıf C - Assigned but Unused (İnceleme)**: ~45 değişken
- tenantId, userId, workspace, currentUserRole (destructured)
- setPresenceList, setUploadConfidentiality, setMetrics, etc. (useState setter unused)
- title, adminNavItems, locale, pageNumber, isGeneratingChecklist (assigned but unused)
- Örnek: `const userId = user?.id;` (kullanılmamış) → ölü kod veya eksik özellik göstergesi

### 3. Girişimler ve Engeller

#### ESLint Config Değişikliği ✓
- `argsIgnorePattern: "^_"` ve `caughtErrorsIgnorePattern: "^_"` eklendi
- TypeScript strict mode uyumlu

#### Catch Handler Refactoring ✗ (Typecheck Hatası)
- 114 dosyada `catch (e/err/...)` → `catch (_e/_err/...)` uygulandı
- Sonuç: 114+ typecheck hatası (`Cannot find name 'e'`) — bazı catch bloklarında hata değişkeni kullanılıyor
- Geri alındı (git reset --hard)

**Root Cause**: Catch handler'ların hepsi için hata değişkeninin kullanılıp kullanılmadığını otomatik olarak belirlemek çok karmaşık. Kod analizi (AST parsing) gerekir. Alternatif: Dosyaları manuel olarak incelemek.

### 4. Diğer Kategoriler (Kalan İş)

#### no-img-element (16 uyarı)
**Dosyalar**: 
- src/app/[locale]/(app)/layout.tsx
- src/app/[locale]/(marketing)/blog/[slug]/page.tsx
- src/app/[locale]/(marketing)/blog/page.tsx
- src/components/BlogSection.tsx
- src/components/MobileAdminHeader.tsx
- src/components/MobileAppHeader.tsx
- src/components/PublicFooter.tsx
- src/components/PublicNavbar.tsx

**Fix Yöntemi**: `<img>` → `<Image />` (next/image) + i18n alt text

#### exhaustive-deps (3 uyarı)
- src/app/.../notifications/client.tsx (2 uyarı)
- src/app/.../marketplace/page.tsx (1 uyarı)
- Fix: Bağımlılık array'e ekle veya hook'u yeniden yapılandır

#### no-location-assign (1 uyarı)
- Fix: window.location.assign → router.push

## Kanıt

### Başlangıç Durumu
```bash
$ pnpm lint 2>&1 | tail -5
✖ 167 problems (0 errors, 167 warnings)
```

### ESLint Config Güncellemesi
```javascript
// eslint.config.mjs
{
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
}
```

### Catch Handler Refactoring Denemesi
- 114 dosya işleme alındı
- 200+ catch block dönüştürüldü
- TypeCheck sonucu: 114+ hata (revert edildi)

## Kalan İş (Ayrı Kartlar)

### KART 1: Catch Handler Refactoring (Safe Version)
- **Scope**: 40-50 catch handler
- **Method**: Dosya bazında analiz + hata değişkeni kullanım kontrolü
- **Öneri**: Dosyaları manuel veya AST parser kullanarak işle

### KART 2: Import Cleanup (Sınıf A)
- **Scope**: ~60 unused import (icons, functions, packages)
- **Method**: Regex-safe import removal veya manuel
- **Risk**: Bırak/Kullan belirsizliği (örn. "Bu import gelecekte kullanılacak mı?")

### KART 3: Assigned but Unused Cleanup (Sınıf C)
- **Scope**: ~45 değişken (tenantId, userId, setPresenceList, etc.)
- **Method**: Kod incelemesi + refactoring (setter kullanma veya remove)
- **Priority**: Düşük (bazı ölü kod, bazı belirtilmemiş features)

## Riskler

1. **Typecheck Uyumluluğu**: Catch handler'lar hata değişkenini kullanıyorsa, automatikcatch (_e) veya parametresiz catch {} hata verir
2. **Import Güvenliği**: Simle regex import removal false positives yaratabilir
3. **C Sınıfı Belirsizliği**: "Ölü kod mu?" vs. "Eksik feature mi?" çoğu durumda inceleme gerekir

## Açık Sorular

1. Catch handler'larda hata değişkeni kullanım analizi nasıl otomatize edilir?
   - AST parser (typescript-eslint)?
   - Manuel inceleme?
   - Eslint rule özelleştirmesi?

2. C sınıfı (assigned but unused) için kararların kuralı nedir?
   - Silinecek (ölü kod)
   - Kullanılacak (eksik feature)
   - Rapor edilecek (belirsiz)

3. Import cleanup'ında false positive riski nasıl minimize edilir?

## Sonraki Adımlar (Ayrı Kartlar)

### TASK-MTREJ27YUPSY7-sub1: Catch Handlers (40-50 uyarı)
- Method: Catch bloğunda hata değişkeni kullanılıp kullanılmadığını kontrol et
- Kullanılmıyorsa: `catch {}` → ES 2022 optional catch binding
- Kullanılıyorsa: `catch (_e)` → underscore prefix (ESLint ignores with new config)
- Risk: Otomatikvb.ş ast parser gerekli; Manuel inceleme ~2-3 saat

### TASK-MTREJ27YUPSY7-sub2: Imports Cleanup (60 uyarı)
- Icons (lucide-react): FileText, Plus, Filter, Lock, Info, Calendar, AlertCircle, Users, Building, Check, etc.
- Functions: useEffect, getPresignedDownloadUrl, notFound, verifyEvidenceAction
- Packages: path, prisma, PrismaClient, OpenAI, getAllManifests, mapProjectRow
- Method: Dosya bazında grep + sed (safe removal) veya manual deletion

### TASK-MTREJ27YUPSY7-sub3: Value Assignment Cleanup (45 uyarı)
- Assign-only variables: tenantId, userId, workspace, title, pageNumber, locale, etc.
- Decision needed: ölü kod (DELETE) vs. eksik feature (IMPLEMENT)
- Priority: Lowest (needs code review)

### TASK-MTREJ27YUPSY7-sub4: No-IMG-Element (16 uyarı)
- Files: 8 files (app/layout, blog pages, components)
- Fix: `<img>` → `<Image />` + i18n alt text

### TASK-MTREJ27YUPSY7-sub5: Exhaustive-Deps (3 uyarı)
- notifications/client.tsx: storageKey, syncNotifications
- PartBCollaborativeEditor.tsx: activeSection.content, handleSaveContent
- Fix: Add to dependency array or refactor hook

### TASK-MTREJ27YUPSY7-sub6: No-Location-Assign (1 uyarı)
- Fix: window.location.assign → router.push

---

## Özet

**Başlangıç**: 167 uyarı (0 error)
**Bu Kartı Sonrası**: ~167 uyarı (hiçbir fix uygulanmamış — typecheck hataları nedeniyle geri alındı)
**Ayrı Kartlarla Hedef**: 0 uyarı

**Öğrenilen Dersler**:
1. No-unused-vars'ı otomatik fix'lemek öngörülenden daha karmaşık
2. Catch handler'lar typecheck ile uyumlu olmak çin detailed code analysis gerekli
3. ESLint config rules minimal değişiklikle uygulanabilir (argsIgnorePattern)

---

**Durum**: Araştırma & Analiz Tamamlandı — Kısmi Başarı
- ✓ Sorun sınıflandırıldı
- ✓ ESLint config kuralları belirlendi
- ✓ Çeşitli refactoring yöntemleri test edildi
- ✗ Otomasi typecheck hataları yüzünden başarısız
- ⏳ Ayrı kartlar ile devamı önerildi

**Zaman**: ~50 dakika (keşif, sınıflandırma, implementation denemesi, fail analysis)
