---
name: fabrika-api-v1-needs-a-handmade-apikey
description: /api/v1/* rotalarını curl ile doğrulamak için ApiKey satırını elle açman gerekir — seed böyle bir satır üretmiyor, api-auth.ts yorumu üretiyormuş gibi yazıyor
metadata:
  type: reference
  updatedAt: 2026-09-07
---

`src/lib/api-auth.ts` içindeki yorum "Integration testing uses a real ApiKey row created by the
seed" diyor. **Yanlış:** `prisma/seed.ts` hiçbir `ApiKey` satırı yazmıyor (`grep -n "apiKey"
prisma/seed.ts` → boş). Demo prefix bypass'ı da kaldırıldığı için anahtarsız hiçbir `/api/v1/*`
çağrısı 401'den öteye gitmez. Yani gerçek `curl` kanıtı isteyen her görev satırı kendi açar.

Anahtar sadece SHA-256 hash'iyle saklanıyor; düz metin hiçbir yerde durmuyor:

```js
// repo KÖKÜNDE bir .mjs olarak koştur (tsx modül çözümlemesi buna bağlı —
// bkz. [[fabrika-tsx-script-must-live-in-repo-root]])
import 'dotenv/config';
import crypto from 'node:crypto';
import { prisma } from './src/lib/db.ts';
const KEY = 'fp_live_qa_<GOREV-ID>_local';
const keyHash = crypto.createHash('sha256').update(KEY).digest('hex');
const tenant = await prisma.tenant.findFirst({ select: { id: true } });
await prisma.apiKey.upsert({
  where: { keyHash },
  update: {},
  create: { tenantId: tenant.id, name: '<GOREV-ID> local verification', keyHash, prefix: KEY.slice(0, 12) },
});
```

Sonra `curl -H "x-api-key: $KEY" http://localhost:3000/api/v1/...`. **İş bitince
`deleteMany({ where: { keyHash } })` ile sil** — paylaşılan yerel DB'de başıboş kimlik bırakma
(bkz. [[fabrika-agents-share-one-working-tree]]).

Not: `Call`, `Topic`, `Programme` ve CORDIS tabloları `tenantId` taşımıyor
(`scripts/rls-models.ts` `SYSTEM_WIDE`), bu yüzden bu rotalarda `withTenant` yok — anahtar
"kim sorabilir"i belirler, "ne dönecek"i değil.
