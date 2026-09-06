---
name: e10-marketing-learnings
description: E10 Marketing Site görevinden elde edilen Fabrika altyapısı ve i18n patterns
metadata:
  type: project
  updatedAt: 2026-09-06
---

## Topic Model & Seed Data

**Bulgu:** Call model'inde destination/country alanı yok; Topic model'inde `destination` alanı bulunuyor (seed-calls.ts'de `topic.destination = 'TR'`).

**Uygulama:** Çağrıları ülkeye göre filtrelemek için Topic.destination alan'ını kullan; Call tablo'suna direkt link yok.

**Kaynaklar:**
- `prisma/schema.prisma` — Topic model, destination alanı
- `prisma/seed-calls.ts` — seedCalls function, upsert pattern

---

## (marketing) Group Routing + i18n Middleware

**Bulgu:** (marketing) grubu /[locale]/ dışındadır ama i18n middleware `/` → `/tr` redirect eder. Yani:
- `GET /` → 307 Redirect to `/tr`
- `GET /tr` → Landing page (rendering)
- `GET /tr/pricing` → Pricing page

**Kaynaklar:**
- Next.js i18n routing: middleware [locale] dışındaki paths'ı intercepte eder
- (marketing) grup adlandırması: routing segment'i değil, layout grouping'i (sorumluluğu kapsülle)

---

## i18n Key Structure Pattern

**Pattern:**
```json
{
  "nav": { "pricing": "...", "calls": "..." },
  "landing": {
    "hero": { "title": "...", "cta": "..." },
    "features": { "title": "...", "discovery": "..." },
    "pricing": { ... },
    "footer": { ... }
  },
  "pricing": {
    "title": "...",
    "starter": "...",
    "faq_1_q": "...",
    "faq_1_a": "..."
  }
}
```

**Uygulaması:**
- Page-level keys: `landing.*`, `pricing.*`
- Nested sections: `landing.hero`, `landing.features`
- FAQ patterns: `faq_N_q` / `faq_N_a` (sayısal indexing)
- Tüm key'ler 2 dile de eklenmiş (tr.json + en.json paralel)

---

## Lighthouse & Performance Targets

**Sonuçlar (MVP):**
- Perf: 75–85/100 (hedef 80+, Pricing geçiyor)
- A11y: 87–89/100 (WCAG AA seviyesi)
- SEO: 80–82/100 (meta tags mevcut)

**Iyileştirme noktaları:**
- Image lazy-loading (`next/image` + priority flags)
- CSS critical-path extraction
- Route-level code splitting (dynamic imports)

**Başlangıç** için kabul edilebilir; production'a geçmeden optimize etmek önerilir.

---

## TypeScript Type Patterns

**Pattern: Generic type inference from array**
```ts
// ✗ Implicit any
topics.forEach((topic) => { ... })

// ✓ Explicit type
topics.forEach((topic: typeof topics[0]) => { ... })
```

**Uygulanacak:** Prisma query results'ları loop'larken tip belirtme.

---

## Seed Data Verification

**Pattern:** Seed data kontrolü:
```bash
grep -c "destination: 'TR'" prisma/seed-calls.ts  # 15 çağrı
pnpm db:seed  # Çalıştır
curl http://localhost:3000/en/calls  # Sayı doğru mu?
```

**Bulgu:** TUBITAK (5) + Eurostars (5) + Horizon (5) = 15 TR çağrısı, seed'de sabit.

---

## Sonraki Görevler İçin

- Performance tuning (Lighthouse 80+) → code-splitting, image opt
- Email signup form (landing + pricing CTA'lar)
- Calls gallery advanced filtering (date range, fund type, budget)
- Custom 404/error pages (marketing sektion)
