# TASK-MVC4JL6550ZLE (FO-40) — PR #139 kod incelemesi

**Hüküm: DÜZELTME GEREKLİ.** Blokaj değil, ama DoD tamamlanmadı ve bir invariant (Yakında açılamaz) admin yazım yolunda delinebiliyor. Birinci bulgu düzeltilmeden merge önerilmez.

- PR: yaslan/fonbridge#139 · `be-fb/fo40-modules-f2` → `dev` · head `b96b9de2`
- İnceleyen: crw-bulsam · Kod değiştirilmedi, merge yapılmadı.
- Platform beyanı: koşu **mac (darwin)** üzerinde. Değişen kod (manifest, state-machine, catalog, UI karar mantığı) platforma bağlı değil; süreç/dosya yolu/kabuk bağımlılığı yok.

## Kart sorularına yanıt

| Soru | Yanıt |
|---|---|
| Manifest alanları tam mı? | Evet. Altı yeni manifest `ModuleManifest` alanlarının tamamını taşıyor; tsc yeni manifestlerde hata vermedi. `routes`, `nav`, `permissions` boş (kartla uyumlu). |
| Durum ve bağımlılık mantığı yalnız `state-machine.ts`'te mi? | Enable/cascade için evet: `src/lib/modules/state-machine.ts` (`canEnable`, `canEnableEntitled`, `getDisableCascade`). **İstisna:** `navFeatureLock` (`src/lib/modules/catalog.ts`) "soon modül kilitlemez" kararını UI tarafında veriyor → bulgu 4. |
| "Yakında" modül rota korumasıyla gerçekten kapalı mı? | Kapalı, ama **rota korumasıyla değil**: altı modülün de `routes: []` ve hiçbir placeholder sayfası yok. Kapanma, `checkModuleAccess`/`decideModuleAccess` (`src/lib/modules/access.ts`) üzerinden entitlement ile oluyor (bkz. bulgu 1 ve 2). |
| Modüller arası doğrudan import var mı? | Yok. Yeni manifestler yalnız `@/lib/billing/catalog` ve `@/lib/modules/types` import ediyor. |
| i18n iki dilde var mı? | Evet. `messages/en.json` ve `messages/tr.json` altında 6 modül için `name` + `tagline` anahtarları var; `every module names … in both locales` testi geçti. |
| Çağrılar → M0 eşlemesi | Doğru. `NAV_FEATURE_MODULE.calls = "M0"`, `SidebarNav` anahtarı `calls` mevcut (`src/components/SidebarNav.tsx:49`), `navFeatureLock` M0 soon iken `null` dönüyor. Test var. |

## Koşulan doğrulama

Geçici detached worktree (`b96b9de2`), `node_modules` ana repodan symlink; iş bitince kaldırıldı.

- `pnpm exec vitest run tests/modules tests/settings-modules-status.test.tsx`
  - **23 dosya geçti, 231 test geçti, 5 atlandı.**
  - **1 dosya düştü:** `tests/modules/settings-modules-plan.test.ts` — `connect ECONNREFUSED 127.0.0.1:5432`. Yerelde Postgres yok; bu suite **koşulamadı**, sonucu bilinmiyor. Ortam eksiği, PR mantığıyla ilgisi yok.
- `pnpm exec tsc --noEmit -p .` — 2 hata, ikisi de `src/lib/blog.ts(49,5)` ve `(72,5)`. PR bu dosyaya dokunmuyor. Base'de de olup olmadığı **koşulmadı**.
- Gerçek tarayıcı / ekran görüntüsü: **koşulmadı** (kapsam dışı bırakıldı, bkz. bulgu 2).

## Bulgular (önem sırasıyla)

### 1. [orta] Admin yazım yolu "Yakında açılamaz" kuralını atlıyor
- **Yer:** `src/app/[locale]/admin/modules/actions.ts` — `updateTenantModuleStatus`. Yalnız `manifest.requires` kontrol ediyor; `canEnable`/`canEnableEntitled` çağırmıyor, `statusBadge === 'soon'` kontrolü yok.
- **Senaryo:** Platform admin, bir tenant için `M0` (veya M12–M16) satırını `ON`/`PILOT`/`DEV` yazabiliyor. Bugün satır yazılsa da `decideModuleAccess` entitlement'ta olmadığı için (`PLAN_GRANTS.moduleIds` soon modülleri içermiyor) kapı kapalı kalıyor. Ama satır kalıcı: M0 GA'ya çevrildiğinde (`statusBadge: 'ga'` + plan grant) satır zaten `ON` olduğu için tenant hiçbir yeni karar almadan modülü açmış olur.
- **Neden orta, kritik değil:** Sunucu kapısı şu an korunuyor; açık olan, invariantın tek noktada (`canEnable*`) tutulması.
- **Düzeltme önerisi:** `updateTenantModuleStatus` içinde `ON`/`PILOT`/`DEV` için `manifest.statusBadge === 'soon'` ise reddet (`canEnable` ile aynı mesaj). Ya da yazımı `canEnableEntitled`'a bağla. Bir birim testi ekle (saf yardımcı fonksiyona çıkarılabilir).
- **Not:** PR açıklaması ve testler "canEnable/canEnableEntitled refuse" diyor; doğru, ama admin yolu bu iki fonksiyona bağlı değil. Test kapsamı bu yolu görmüyor.

### 2. [orta] DoD ve kart kapsamı tamamlanmadı
Kart DoD'undaki maddeler karşılanmadı:
- `[ ] Kart + placeholder ekran görüntüsü` — yok.
- `[ ] Platform beyanı` — bu rapor dışında PR'da yok.
- Kart madde 5 (fe-fb): "placeholder route'lar `requireModule` arkasında 'Yakında' sayfası" — hiç rota eklenmemiş (`routes: []`). "Yakında" kartlarının rozet/placeholder tarafı bu PR'da yok; yalnız yükseltme butonu gizleniyor (`settings/modules/client.tsx`).
- `Gerçek tarayıcı` doğrulaması — yok.

Düzeltme: fe kısmı ayrı PR'a bırakılacaksa kart bunu açıkça söylemeli; bu PR'da kart DoD'undaki ekran görüntüsü ve platform beyanı eklenmeli.

### 3. [düşük] Kopyala-yapıştır yorum gürültüsü
- `src/modules/m0/manifest.ts` ve `m12`–`m16`: ilk iki satır "`Role` is imported as a value … prisma-override.d.ts" — bu dosyalar `Role` kullanmıyor, yorum yanıltıcı. Kaldırılmalı.
- `m0/manifest.ts:336`: FO-40 yorumu tek satırda iki farklı cümleyi birleştiriyor (Discover/Basic/Pro/Ultra açıklaması ile "Çağrılar/Fırsatlar menüsü" notu). Ayırın.

### 4. [düşük / öneri] "Soon modül kilitlenmez" kararı state-machine dışında
- `src/lib/modules/catalog.ts:navFeatureLock` — "soon ise kilitleme" kararı burada. CLAUDE.md §3 durum mantığının tek yer olmasını istiyor. Bu bir bağımlılık/kapanış kuralı değil; yine de `state-machine.ts`'e taşınması (ör. `isSoon`/`featureLocked` yardımcısı) ileride aynı kararın iki yerde kopmasını önler.

### 5. [düşük / öneri] Manifest adları İngilizce sabit
- `name`/`description` manifestlerde İngilizce literal (m11 ile aynı desen, mevcut davranış). `requireModule` `manifest.name` ile kilit bildirimi gösterdiğinden TR arayüzde İngilizce ad çıkabilir. Yeni modüller için `tModules(`${key}.name`)` kullanımı tercih edilebilir.

### 6. [bilgi] CLAUDE.md yolu eski
- CLAUDE.md §3 `src/core/modules/state-machine.ts` diyor; repoda `src/core` yok, dosya `src/lib/modules/state-machine.ts`. PR doğru yolu kullanıyor; CLAUDE.md düzeltilmeli. Bu PR'ın hatası değil.

## Kararın özeti
- Doğruluk: tenant yolu doğru; admin yolunda invariant delinebiliyor (bulgu 1).
- Test: 231 geçti; `settings-modules-plan.test.ts` DB yokluğu nedeniyle koşulamadı.
- Kapsam: fe kısmı, ekran görüntüsü, tarayıcı doğrulaması ve platform beyanı DoD'da işaretli ama yok (bulgu 2).
- Bloke eden bulgu: **yok** (sunucu kapısı çalışıyor); düzeltme gereken: bulgu 1 ve 2.

## Açık sorular
- Settings modül testi (`settings-modules-plan.test.ts`) yerel DB ile koşulabilir mi? Koşulursa sonucu eklenmeli.
- `src/lib/blog.ts` tip hataları base'de de var mı? PR dışı, ama `tsc` yeşil değil.
