---
name: fabrika-dotenv-after-imports-never-reaches-env-ts
description: scripts/run-k2-monthly.ts gibi dosyalarda dotenv.config() import'lardan SONRA calisir ama ESM import'lari HOISTED — src/lib/env.ts .env'i hic gormez, env.WORKER_TOKEN bos gider
metadata:
  type: project
  updatedAt: 2026-09-08
---

`scripts/run-k2-monthly.ts` (ve aynı kalıptaki `run-k1-daily.ts`) şöyle başlıyor:

```ts
import dotenv from 'dotenv';
dotenv.config();                                    // <- 3. satırda "önce" görünüyor
import { runK2MonthlyCordis } from '../src/lib/inngest/jobs/k2-monthly-cordis';
```

ESM'de **tüm `import`lar hoist edilir ve modül gövdesinden önce çalışır.** Yani
`src/lib/env.ts` şeması `process.env`'i `dotenv.config()` daha koşmadan okur. Sonuç:
`.env`'de tanımlı olmasına rağmen `env.WORKER_TOKEN` / `env.WORKER_URL` **undefined**.

2026-09-08'de ölçüldü: worker'a bearer doğrulaması eklenince `pnpm jobs:k2` ısrarla
**401** aldı; aynı isteği `curl` ve düz `node fetch` ile atmak 200 döndü. Fark, script'in
boş token göndermesiydi. Doğrulama:

```bash
pnpm jobs:k2 -- --month 2026-11 --worker-url http://127.0.0.1:8123   # 401
WORKER_TOKEN=change-me pnpm jobs:k2 -- --month 2026-11 --worker-url http://127.0.0.1:8123   # 200
```

Auth eklenene kadar hata **görünmezdi** — bu yüzden uzun süre fark edilmedi.

**Nasıl uygula:** Bir CLI script'i `.env`'e dayanıyorsa `dotenv.config()` yetmez. Ya
`tsx --env-file=.env`, ya `import 'dotenv/config'` (kendisi de hoist edilir ve diğer
import'lardan ÖNCE yazılırsa çalışır), ya da env okuyan modülü `await import()` ile
dinamik yükle. Bir script'in `.env` okuduğunu VARSAYMA; şüphede değişkeni komut satırında
vererek karşılaştır — davranış değişiyorsa dotenv çalışmıyordur.

İlgili: [[fabrika-k2-worker-200-is-not-proof]] · [[fabrika-live-postgres-for-evidence]]
