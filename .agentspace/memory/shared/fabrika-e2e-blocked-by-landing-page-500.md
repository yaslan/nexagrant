---
name: fabrika-e2e-blocked-by-landing-page-500
description: KÖK NEDEN GİDERİLDİ (2026-09-07 22:29, next.config.ts images.remotePatterns) — ama kalıp kalıcı: ana sayfa 500 verdiği sürece pnpm test:e2e HİÇBİR testi koşturamaz, e2e koşmuyorsa önce /tr'yi curl'le
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
## E2E_BASE_URL yetmediğinde: yerel config override'ı (2026-09-07, ölçüldü)

`E2E_BASE_URL`'i giriş sayfasına almak her zaman yetmiyor — `webServer.command` yine de
`pnpm dev --port <PORT>` başlatmaya çalışır ve **aynı dizinde ikinci `next dev` yasak**:
`⨯ Another next dev server is already running.` (kilit porta değil DİZİNE bağlı, port değiştirmek
kurtarmaz). Bu durumda repo config'ini değiştirmeden commit edilmeyen bir override yaz:

```ts
// .qa-scratch/playwright.local.ts — iş bitince silinir
export default defineConfig({
  testDir: '../tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    cwd: __dirname + '/..',                      // (1)
    url: `http://localhost:${PORT}/logo.png`,    // (2) 200 dönen statik varlık
    reuseExistingServer: true,
  },
});
```
`npx playwright test --config .qa-scratch/playwright.local.ts <spec>`

İki tuzak, ikisi de vakit yedi:
1. **`cwd` şart.** Playwright `command`'ı CONFIG dosyasının dizininde çalıştırır; vermezsen
   `next dev` `.qa-scratch/` içinde başlar, `next.config.ts` bulunamaz ve
   "[next-intl] Could not locate request configuration module" ile ölür.
2. **Config dosyasında `import.meta` KULLANMA** — Playwright onu CJS olarak yükler:
   `SyntaxError: Cannot use 'import.meta' outside a module`. `__dirname` kullan.

Paylaşılan dev sunucusunu keyfî öldürme (başka bir ajanın doğrulaması sürüyor olabilir); önce
`curl /logo.png` ile ayakta mı bak, ayaktaysa `E2E_PORT` ile ona bağlan. Repo config'ini
düzeltmek doğru kalıcı çözüm ama o `next.config.ts` sahibinin işi — kendi görevinin kapsamı
değilse rapora yaz, dokunma.

## KÖK NEDEN GİDERİLDİ — 2026-09-07 22:29 (blok-zincir-denet-i, TASK-MTQ63RR8Z0G8E)

Yukarıdaki geçici çözümlere **artık gerek yok**: `next.config.ts` içine `images.remotePatterns`
eklendi (`https://images.unsplash.com`, joker değil host host — admin blog formuna yapıştırılan
rastgele URL image optimizer'dan geçmesin).

Aynı komutla doğrulandı:

```
düzeltme öncesi        düzeltme sonrası
500  /tr               200  /tr
500  /en               200  /en
500  /tr/blog          200  /tr/blog
```

`npx playwright test tests/e2e/<spec>.spec.ts` artık **override'sız, `E2E_BASE_URL`'siz**
çalışıyor ve çalışan dev sunucusunu yeniden kullanıyor.

**Kalıcı olan ders (bu kısım eskimez):** e2e hiç başlamıyorsa ve hata porttan bahsediyorsa,
teşhise `curl -s -o /dev/null -w "%{http_code}" localhost:<port>/tr` ile başla. Ayrıca:
bir lint uyarısını temizleyen değişiklik (burada `no-img-element` → `next/image`) yapılandırma
gerektirebilir; "0 uyarı" tek başına kanıt değildir, sayfanın gerçekten açıldığını gör.

İlgili: [[fabrika-agents-share-one-working-tree]], [[fabrika-e2e-own-fixture-hides-route-bugs]]
