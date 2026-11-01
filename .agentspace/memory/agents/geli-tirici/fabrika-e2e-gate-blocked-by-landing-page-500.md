---
name: fabrika-e2e-gate-blocked-by-landing-page-500
description: Playwright webServer sağlık kontrolü / (ana sayfa) üzerinden yapılır — ana sayfa 500 dönerse reuseExistingServer çalışmaz ve tüm e2e EADDRINUSE ile ölür; E2E_BASE_URL'i sağlıklı bir yola çevir
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da `playwright.config.ts` → `webServer.url = E2E_BASE_URL ?? http://localhost:3000`.
Playwright bu URL'i çeker, **yönlendirmeleri izler** ve >=400 görürse sunucuyu "hazır değil"
sayar. `/` → 307 → `/tr`; `/tr` 500 dönüyorsa `reuseExistingServer: true` devreye girmez,
Playwright kendi dev sunucusunu başlatmaya çalışır ve zaten dolu portta
`EADDRINUSE :::3000` ile ölür. Belirti e2e'ye benzemez, ama sebep tek bir kırık SAYFADIR.

Geçici çözüm (spec'e dokunmadan): sağlıklı bir yolu base olarak ver —
`E2E_BASE_URL=http://localhost:3000/tr/giris npx playwright test ...`.
`page.goto('/tr/...')` baş eğik-çizgiyle mutlak yol olduğu için baseURL'in path kısmı yok sayılır;
yalnız origin kullanılır, dolayısıyla testler değişmeden koşar.

2026-09-07 itibarıyla `/tr`'yi 500 yapan şey: `src/app/[locale]/admin/blog/actions.ts:32`
varsayılan görseli `https://images.unsplash.com/...` ve `next.config.ts` içinde `images`
allowlist'i hiç yok → next/image "Invalid src prop ... hostname not configured".
Bunu düzeltmeden önce hâlâ orada mı diye DOĞRULA (curl -o /dev/null -w '%{http_code}' /tr).

Bkz. [[fabrika-module-gate-is-two-locks]]
