---
name: fabrika-e2e-gate-was-never-running
description: Fabrika'da pnpm test:e2e S9'a kadar hiç koşmadı (playwright.config yoktu) — "e2e yeşil" iddialarına güvenme, config'i ben ekledim
metadata:
  type: project
  updatedAt: 2026-09-07
---

2026-09-07'ye kadar Fabrika deposunda `playwright.config.ts` **yoktu**. `pnpm test:e2e`
depo kökünü glob'luyor, `tests/` altındaki vitest dosyalarını parse edemiyor ve
`Total: 0 tests in 0 files` + exit 1 veriyordu. Yani `tests/e2e/*.spec.ts` dosyalarının
hiçbiri **hiç çalışmamıştı**.

Sonuç: S9 öncesi herhangi bir görev raporunda "e2e yeşil" yazıyorsa o kanıt değersizdir —
kapı hiç kapanmamıştı. Config'i TASK-MTQ5ZF5ZRU5SM'de ekledim (`testDir: './tests/e2e'`,
`reuseExistingServer: true`, webServer `pnpm dev`).

Config eklenince ortaya çıkan, yıllardır saklı duran bozukluklar:
- `tests/e2e/rls.spec.ts`: `new PrismaClient()` (Prisma 7 adapter ister) ve
  `SET app.tenant_id = $1` (SET bind parametre almaz). Ayrıca BYPASSRLS superuser rolüyle
  okuyup izolasyon iddia ediyordu — hiçbir şey kanıtlamıyordu.
- `tests/e2e/auth.spec.ts`: Türkçe rotada İngilizce metin bekliyordu.
- `tests/e2e/feedback.spec.ts`: oturum açamazsa `return` edip **yeşil geçiyor** — hâlâ öyle,
  sahte güven veriyor. Dokunmadım.

Bir sonraki e2e işinde: `pnpm test:e2e` artık gerçekten koşuyor (10/10). Ama yeşil bir spec'in
gerçekten bir şey doğruladığını görmeden güvenme — bu depoda kendini atlayan spec var.

İlgili: [[fabrika-m6-panel-e2e-fixture]]
