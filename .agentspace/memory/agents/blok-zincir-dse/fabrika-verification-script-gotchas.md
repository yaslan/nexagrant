---
name: fabrika-verification-script-gotchas
description: Fabrika'da elle doğrulama betiği yazarken dört tuzak — betiği worktree köküne koy, `@playwright/test`ten import et, dev sunucusunda networkidle bekleme, Prisma 7 için çıplak PrismaClient yerine pg ya da tsx
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Kartın iddiasını ölçmek için tek seferlik betik yazarken tekrar tekrar çarptığım
şeyler (hepsi 2026-09-08'de ölçüldü):

1. **Betiğin yeri paket çözümlemesini belirler.** Node, `import`u betiğin
   bulunduğu dizinden çözer. Scratchpad'e yazdığın `.mjs`
   `ERR_MODULE_NOT_FOUND` verir. Betiği **worktree/repo köküne** koy
   (`node --env-file=.env verify.mjs`).
2. **Çıplak `playwright` paketi yok.** Depoda yalnız `@playwright/test` doğrudan
   bağımlılık: `import { chromium } from '@playwright/test'`.
3. **`waitForLoadState('networkidle')` dev sunucusunda asla yerleşmez** (HMR
   websocket'i açık kalır) — 30 sn sonra timeout. Sabit `waitForTimeout(4000)`
   kullan. Giriş için `waitForURL('**'+target)` güvenilir.
4. **Prisma 7 sürücü adaptörü istiyor.** `new PrismaClient()` "adapter" hatasıyla
   patlar. Saf DB ölçümü için doğrudan `pg.Client` aç
   (`new pg.Client({connectionString: process.env.DATABASE_URL})`); uygulamanın
   KENDİ sorgusunu ölçeceksen `npx tsx` ile gerçek export'ları import et —
   bir cron'un `SAVED_SEARCH_ALERT_QUERY`/`matchCountQuery`'sini böyle gerçek
   Postgres'e karşı koşturdum, taklit istemci bu sınıf hatayı yakalayamaz.

Giriş: `/tr/giris?callbackUrl=<hedef>` + e-posta alanı + submit; öncesinde
`fabrika_cookie_consent` localStorage'a yazılmalı, yoksa `inset-0` çerez
diyaloğu tıklamaları yutar.

İlgili: [[fabrika-second-dev-server-port-isolation]], [[fabrika-e2e-fixture-pattern]]
