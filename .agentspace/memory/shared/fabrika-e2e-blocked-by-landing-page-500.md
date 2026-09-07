---
name: fabrika-e2e-blocked-by-landing-page-500
description: Ana sayfa (/tr) 500 verdiği sürece pnpm test:e2e HİÇBİR testi koşturamaz — Playwright webServer yoklaması / adresine gider; çözüm E2E_BASE_URL'i giriş sayfasına almak
metadata:
  type: project
updatedAt: 2026-09-07
---

`playwright.config.ts:27-33` `webServer.url`'ü `BASE_URL` (yani `/`) yapıyor ve
`reuseExistingServer: true` bu yoklamaya bakıyor. `/` → `/tr`'ye yönleniyor. **`/tr` 500
verdiğinde Playwright çalışan dev sunucusunu "hazır değil" sayar**, aynı porta ikinci bir
`next dev` açar ve `EADDRINUSE: address already in use` ile ölür. Tek bir e2e bile koşmaz —
ve hata mesajı porttan bahsettiği için insan "başka ajan portu tutmuş" diye yanlış teşhis koyar.

Çalışan geçici çözüm (dosyaya dokunmadan):

```bash
E2E_BASE_URL=http://localhost:3400/tr/giris npx playwright test tests/e2e/<spec>.spec.ts
```

Yoklama 200 dönen bir sayfaya gider; `page.goto('/tr/...')` mutlak yol olduğu için baseURL'in
yol kısmı zaten ezilir, testler normal çalışır.

2026-09-07'deki 500'ün kaynağı: `ca73ced refactor: migrate 16 <img> elements to next/image`
→ `src/components/BlogSection.tsx:2,55` `next/image` ile `https://images.unsplash.com/...`
basıyor (`src/lib/blog.ts:29,31,60`) ama `next.config.ts`'de `images.remotePatterns` **yok**:
`Invalid src prop … hostname "images.unsplash.com" is not configured`.

Ders: **e2e koşmuyorsa önce `curl -s -o /dev/null -w "%{http_code}" localhost:<port>/tr` çek.**
Halka açık ana sayfayı bozan herhangi bir değişiklik, ilgisiz görünse de tüm e2e kapısını kapatır.
İlgili: [[fabrika-agents-share-one-working-tree]], [[fabrika-e2e-own-fixture-hides-route-bugs]]
