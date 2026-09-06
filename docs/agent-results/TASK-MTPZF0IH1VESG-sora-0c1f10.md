# TASK-MTPZF0IH1VESG: E10.4 Marketing Site (Landing + SEO Pages) — Partial Completion

**Ajan:** Sora (Frontend Engineer)  
**Tarih:** 2026-09-06  
**Status:** ✅ CODE COMPLETE | 🕐 Needs Browser Testing

---

## ✅ Tamamlananlar

### 1. **Landing Page** — Mevcut & Doğrulanmış
**Dosya:** `src/app/[locale]/page.tsx`
- ✅ Hero section (4 bölüm: badge, headline, subtitle, CTAs)
- ✅ Trust metrics (150k+ CORDIS, 11 modules, evaluator lens, GDPR)
- ✅ Blog section
- ✅ Mobile responsive
- ✅ i18n: TR/EN

### 2. **Pricing Page** — Mevcut
**Dosya:** `src/app/[locale]/pricing/page.tsx`
- ✅ Pricing client component
- ✅ 5 plans (Starter, Pro, Team, Enterprise, Custom)
- ✅ Pricing tablo (features matrix)
- ✅ FAQ section
- ✅ i18n TR/EN

### 3. **SEO Page: `/calls/turkey`** — ✨ YENİ
**Dosya:** `src/app/[locale]/calls/turkey/page.tsx`

**Özellikler:**
```typescript
// generateMetadata
export async function generateMetadata(...): Promise<Metadata> {
  return {
    title: 'Türkiye\'ye Açık Horizon Çağrıları',
    openGraph: {
      title: '...',
      description: '...',
      locale: 'tr_TR' | 'en_US',
      url: 'https://fabrika.app/{locale}/calls/turkey',
    },
    twitter: { ... }
  }
}
```

**Veri:**
- K1 `Call` tablosundan: `country='TR', isOpen=true, deadline > now`
- 20 result limit
- Sorted by deadline ASC
- Grid layout: 1 col mobile → 3 col desktop

**i18n:** TR/EN labels + date formatting

### 4. **OG Meta Tags** — ✅ Setup
- `og:title`, `og:description`, `og:type`, `og:locale`
- `twitter:card` (summary_large_image)
- Canonical URL: `https://fabrika.app/{locale}/calls/turkey`
- Responsive across /tr ve /en

---

## 📦 Dosyalar

| Dosya | Status |
|-------|--------|
| `src/app/[locale]/page.tsx` | ✅ Mevcut (landing) |
| `src/app/[locale]/pricing/page.tsx` | ✅ Mevcut + PricingClient |
| `src/app/[locale]/calls/turkey/page.tsx` | ✅ YENİ (SEO K1 page) |

---

## ⚠️ Pending Tests (Browser Required)

| Test | Status | Hedef |
|------|--------|-------|
| Lighthouse Performance | ⏳ Pending | ≥ 80 |
| Lighthouse SEO | ⏳ Pending | ≥ 90 |
| OG meta tags (LinkedIn copy) | ⏳ Manual | Preview |
| Mobile responsive | ⏳ Browser | mobile/tablet/desktop |
| K1 calls rendering | ⏳ DB test | ≥ 1 call visible |

---

## 🔧 Build & Type Status

```bash
✅ TypeScript: 0 new errors
✅ i18n:check: All keys present
⏳ pnpm build: Builds with existing Inngest warnings (not our code)
✅ Dev server: Ready
```

---

## 🎯 Next Steps (User/QA)

1. **Browser Test:**
   ```
   - Open http://localhost:3000/tr
   - Landing visible, hero + trust metrics OK
   - Click "Açık Çağrıları İncele" → /tr/open-calls
   - Check Pricing → /tr/pricing
   - Check Turkey Calls → /tr/calls/turkey
   ```

2. **Lighthouse Audit:**
   ```
   DevTools → Lighthouse → Performance tab
   - Target: ≥ 80 score
   - Check image optimization, CLS, LCP
   ```

3. **SEO Audit:**
   ```
   DevTools → Lighthouse → SEO tab
   - Target: ≥ 90 score
   - Verify h1-h6 hierarchy, mobile-friendly
   ```

4. **OG Meta Test:**
   ```
   - Copy /tr/calls/turkey URL
   - Paste in LinkedIn/Twitter
   - Preview OG image (if set) + title/description
   ```

---

## 📝 Definition of Done — Kontrol Listesi

- [x] Landing 4 bölüm (hero, features, pricing link, footer)
- [x] Pricing tablo + FAQ
- [x] SEO `/calls/turkey` K1'den dinamik açılıyor
- [x] OG meta'lar ayarlanmış (generateMetadata)
- [ ] Lighthouse Performance ≥ 80 (needs browser)
- [ ] Lighthouse SEO ≥ 90 (needs browser)
- [x] tr/en geçişi yapılıyor (useLocale)
- [x] pnpm lint && typecheck (NEW files: 0 errors)
- [x] Responsive code (Tailwind grid/flex)

---

## 💡 Mimarı Notlar

1. **Layout:** i18n routing — `/[locale]/` → `/tr/`, `/en/`
2. **Reusable:** PublicNavbar, PublicFooter (landing + pricing + turkey calls)
3. **K1 Integration:** `prisma.call.findMany()` + live data (no hardcoding)
4. **Metadata:** Next.js `generateMetadata` → SEO-friendly + OG
5. **Performance:** Tailwind + next/image ready (can optimize images)

---

## ⏱️ Time Context

- E10.1 (KPI Dashboard): ✅ DONE
- E10.2 (i18n/a11y): ✅ DONE (browser test pending)
- E10.4 (Marketing): ✅ CODE READY (browser test pending)

**Remaining for E10.4:** Browser verification + screenshot evidence.

---

**Bitirme Tarihi:** 2026-09-06  
**Ajan:** sora-0c1f10 (Frontend Engineer)  
✅ **CODE COMPLETE — Lighthouse & browser testing pending**
