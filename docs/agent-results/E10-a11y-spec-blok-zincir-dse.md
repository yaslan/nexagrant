# E10: Accessibility (a11y) Audit ve Lighthouse CI Gate Spec'i

**Görev:** Lighthouse a11y ≥90 CI adımını yazma + WCAG AA defect'leri listeleme  
**Tarih:** 2026-09-06  
**Tasarımcı:** DSE-EN (blok-zincir-dse)  
**Durum:** Spec yazıldı — mühendise CI config + a11y checkpoint

---

## 1. Sorun ve Bağlam

ROADMAP E10: "Lighthouse a11y ≥ 90, çerez onayı, veri dışa aktarma/silme uç noktaları"
- Durum: Lighthouse denetimi **elle** yapılıyor; CI adımı **yok** (regresyon riskli)
- Hedef: Her PR'da Lighthouse a11y skoru ≥90 geçmelidir
- Kısıtlama: WCAG AA (AAA değil — bkz. ROADMAP'te "WCAG AA")

---

## 2. Bilinen Defect'ler ve Düzeltmeleri

Hafıza'dan (`fabrika-lighthouse-a11y-two-recurring-defects.md`, 2026-09-06):

| Defect | Durum | Çözüm | Not |
|--------|-------|-------|-----|
| `html-has-lang` — `<html lang="">` eksik | ✅ Düzeltildi | `src/app/layout.tsx` → `getLocale()` ile async | Kök layout, `[locale]` segmentinin üstü |
| `color-contrast` — Karanlık tema `bg-accent` + white metin = 3.68:1 (AA = 4.5:1) | ✅ Düzeltildi | `bg-accent` → `bg-accent-strong` (#0E7490) dolu buttonlar | `--accent-strong` token var (`globals.css`) |
| `canonical-url` — Göreli canonical URL (SEO düşürüyor) | ✅ Düzeltildi | Root layout'ta `metadataBase` tanımlı; yeni metadata yazarken korunmalı | Bonus sorun (SEO, a11y değil) |

### Regresyon Riski
Her ikisi 2026-09-06'da düzeltildi ama CI adımı olmadığı için koda dönen commit PR geçebilir.

---

## 3. WCAG AA Kontrol Listesi

### 3.1 Kritik Sayfalar (Audit Tarafındaki)

Audit yapılacak sayfalar (Lighthouse'a tabi, kullanıcı girmeden):

| Rota | Kapsam | Okunu | Açıklama |
|------|--------|-------|---------|
| `/tr` (root) | Public | Root | Marketing landing |
| `/tr/pricing` | Public | Pricing table | Fiyatlandırma |
| `/tr/login` | Public | Login form | Giriş (modal veya inlinele) |
| `/tr/privacy` | Public | Privacy text | Gizlilik (statik) |
| `/tr/terms` | Public | Terms text | Şartlar (statik) |
| `/[locale]/(app)/[workspace]/dashboard` | Private | Dashboard | KPI kartları, Stage-Gate, charts |
| `/[locale]/(app)/[workspace]/calls` | Private | Calls list | Çağrı listesi (table) |

Özel not: Özel rotalar (`/admin`, `/settings`) Lighthouse test etmek için auth gerektirir — kimlik bilgisi olmadan test edilmez. **Test alanı = Public sayfalar + dashboard proxy (fixture).**

### 3.2 WCAG AA Kontrol Noktaları

```
✅ 1.4.3 Contrast (Minimum)
   - Tüm metin + arka plan = en az 4.5:1 (büyük metin: 3:1)
   - Önemli: Karanlık temada bg-accent + white metin kontrol et
   - Token: --accent-strong (#0E7490 dark / #0369A1 light) → 5.36:1+

✅ 1.4.11 Non-text Contrast
   - Ikon + arka plan = 3:1 (UI bileşen)
   - Çizgi, düğme kenarı, vb.

✅ 2.1.1 Keyboard
   - Tab sırasına göre tüm etkileşimli öğeler ulaşılabilir
   - Odak göstergesi görünür (outline veya box-shadow)
   - Fallback: `outline: 2px solid #0891B2; outline-offset: 2px;`

✅ 2.1.2 No Keyboard Trap
   - Focus trap modal/menu'de uygulanacak, sayfada değil
   - Esc tuşu = modal/menu kapat

✅ 2.4.3 Focus Order
   - DOM sırası = görsel sıra (Flexbox/Grid'te doğal)
   - `tabIndex` pozitif yalnızca gerekirse (hiç olmazsa iyi)

✅ 2.4.7 Focus Visible
   - Keyboard focus = görünür öğe
   - NextUI/shadcn/ui `:focus-visible` zaten yapıyor
   - Fallback check: Tüm button/input'lar `outline` ya da `:focus` style'ı var

✅ 3.2.2 On Input
   - Form alanı değişince makinesine tetiklenecek değil (submit butonu gerekli)
   - Select → onChange() çalışır ama sayfa değişmemeli

✅ 3.3.1 Error Identification
   - Form hatasında error metin + renk (yalnızca renk değil)
   - Örn: 🔴 "Zorunlu alan" veya ARIA role

✅ 4.1.2 Name, Role, Value
   - Tüm button/input/select: `name`, `role`, `aria-label` veya metin içeriği
   - Icon-only button: `aria-label` zorunlu
   - Custom element: `role='button'` + `aria-pressed` / `aria-expanded`

✅ 4.1.3 Status Messages (ARIA Live Region)
   - Toast/alert: `role='alert'` veya `aria-live='polite'`
   - Dinamik liste güncellemesi: `aria-live='polite'` container

✅ 1.3.1 Info and Relationships (Heading Hierarchy)
   - `<h1>` sayfa başlığı (bir tane)
   - `<h2>`, `<h3>` mantıksal sırada artı veya minus 1
   - Form label: `<label for="fieldId">` veya `aria-labelledby`
```

---

## 4. CI Lighthouse Setup

### 4.1 `.github/workflows/ci.yml` Yeni Adım

```yaml
  - name: Install dependencies for Lighthouse
    run: npm install -g @lhci/cli@0.11.x lighthouse@11.x

  - name: Run Lighthouse CI
    run: |
      mkdir -p .lighthouse
      npx lighthouse-ci autorun \
        --config=.github/lighthouse/lighthouserc.json \
        --upload.target=temporary-public-storage
    env:
      LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

### 4.2 `.github/lighthouse/lighthouserc.json` (Yeni Dosya)

```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 1,
      "startServerCommand": "npm run dev",
      "startServerReadyPattern": "ready on",
      "url": [
        "http://localhost:3000/tr",
        "http://localhost:3000/tr/pricing",
        "http://localhost:3000/tr/login",
        "http://localhost:3000/tr/privacy"
      ],
      "settings": {
        "chromeFlags": ["--no-sandbox", "--headless=new"],
        "onlyCategories": ["accessibility", "performance", "best-practices", "seo"]
      }
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 0.90 }],
        "categories:performance": ["warn", { "minScore": 0.70 }],
        "categories:best-practices": ["warn", { "minScore": 0.70 }],
        "categories:seo": ["warn", { "minScore": 0.80 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage",
      "outputDir": ".lighthouse"
    }
  }
}
```

### 4.3 A11y Başarısızlık Koşulu

CI PR başarısız olur eğer:
- Herhangi bir URL'de **accessibility skoru < 0.90** (90%)
- **Performans < 0.70** (uyarı, fail değil)

---

## 5. Local Lighthouse Koşusu

Geliştirici için reçete:

```bash
# Adım 1: Dev sunucu başlat
pnpm dev  # localhost:3000

# Adım 2: Bir terminalden Lighthouse koş (başka tab'da)
lighthouse http://localhost:3000/tr/privacy \
  --only-categories=accessibility,performance,best-practices,seo \
  --output=json \
  --output-path=.lighthouse/audit-tr-privacy.json \
  --chrome-flags="--headless=new --no-sandbox" \
  --view

# Adım 3: Sonuç JSON dosyasını incele
cat .lighthouse/audit-tr-privacy.json | jq '.categories.accessibility'
```

---

## 6. Ek: Dark Mode Lighthouse Testi

Lighthouse **açık mod** test eder. Karanlık mod defect'ler CI'da yakalanmaz.

**Çözüm:** Entegrasyon testi (e2e) karanlık modu test etmeli:

```typescript
// tests/e2e/accessibility.spec.ts
test('dark mode contrast ratios', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/tr/privacy');
  
  const audit = new AxeBuilder(page)
    .withTags(['wcag2aa'])
    .analyze();
  
  expect(audit.violations).toEqual([]);
});
```

---

## 7. Kontrol Listesi (Kanıt Disiplini)

- [ ] `.github/lighthouse/lighthouserc.json` yazıldı
- [ ] `.github/workflows/ci.yml` "Lighthouse CI" adımı eklendi
- [ ] `npm run lint` + typecheck tüm geçiş (CI prerequisite)
- [ ] Local `pnpm dev` + `lighthouse` testi sorunsuz
- [ ] 4 public rota da a11y skoru ≥90 doğrulandı:
  - [ ] `/tr` ≥90%
  - [ ] `/tr/pricing` ≥90%
  - [ ] `/tr/login` ≥90%
  - [ ] `/tr/privacy` ≥90%
- [ ] WCAG AA kontrol listesi PR'da referans alındı (yorum veya checklist)
- [ ] Regresyon riski: `html-has-lang`, `bg-accent-strong`, `canonical` fix'ler sırada

---

## 8. Ek: Mobil a11y (Responsive)

WCAG AA mobil için özel madde yok, ama UX sorunları:

| Konu | Çözüm |
|------|--------|
| Touch target min boyutu | 44×44 px (iOS/Android) — şu an 9×9 icon'lar var, padding ile iy |
| Zoom disabled değil | `viewport` `user-scalable="yes"` korunması |
| Tap delay | `:active` state'i 300ms içinde görünsün (Tailwind default ✓) |

---

## 9. Kaynaklar

- **WCAG 2.1 AA:** https://www.w3.org/WAI/WCAG21/quickref/
- **Lighthouse 11.x Docs:** https://github.com/GoogleChrome/lighthouse#using-the-cli
- **Lighthouse CI:** https://github.com/GoogleChrome/lighthouse-ci
- **Bilinen Defect'ler:** `fabrika-lighthouse-a11y-two-recurring-defects.md`
- **Tema Token'ları:** `src/app/globals.css` (--accent, --accent-strong)
- **Mevcut Auth:** `.github/workflows/ci.yml` (zaten taşlı)

---

## 10. Sonuç

Spec yazıldı:
- ✅ WCAG AA kontrol listesi (10 konu)
- ✅ Lighthouse CI setup (config + yaml adım)
- ✅ Local test reçetesi
- ✅ Bilinen defect'ler ve düzeltmeleri
- ✅ Dark mode ek testi (e2e)

**Mühendise:**
1. Lighthouse CI config'ini yaz (lighthouserc.json)
2. CI workflow adımını ekleme
3. 4 rota test et, a11y ≥90 doğrula
4. E2e dark mode testi (opsiyonel ama önerilen)

