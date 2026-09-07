# Memory Index

- [fabrika-tsx-script-must-live-in-repo-root](fabrika-tsx-script-must-live-in-repo-root.md) — Fabrika'da tek seferlik DB sorgusu için tsx script'i scratchpad'e değil repo köküne yaz — Prisma client generated/prisma/client'ta ve driver adapter istiyor, dışarıdan import çözülmez

- [fabrika-dev-postgres-is-up](fabrika-dev-postgres-is-up.md) — Fabrika'da yerel Postgres AYAKTA (localhost:5432) — "DB yok" diye uçtan-uca doğrulamayı atlama, önce nc -z localhost 5432 ile bak

- [fabrika-e2e-gate-was-never-running](fabrika-e2e-gate-was-never-running.md) — Fabrika'da pnpm test:e2e S9'a kadar hiç koşmadı (playwright.config yoktu) — "e2e yeşil" iddialarına güvenme, config'i ben ekledim
- [fabrika-m6-panel-e2e-fixture](fabrika-m6-panel-e2e-fixture.md) — Fabrika'da gerçek-tarayıcı e2e için hazır reçete — seed script + credentials login + cookie banner atlatma + main scope

- [fabrika-iyzico-billing-flow](fabrika-iyzico-billing-flow.md) — Fabrika iyzico ödeme akışının kilit kararları — kiracı conversationId'den okunur, para sağlayıcıdan yeniden okunur, imza şeması sandbox'a karşı HENÜZ doğrulanmadı
- [fabrika-next16-second-dev-server-refused](fabrika-next16-second-dev-server-refused.md) — Fabrika'da ikinci bir `next dev` başlatılamaz (Next 16 "Another next dev server is already running" der) — ayrı portta gerçek HTTP e2e için `next build` + `next start -p <port>` kullan
