---
name: fabrika-db-verification-scripts-belong-in-the-scratchpad
description: Tek seferlik DB doğrulama betiğini repoya yazma — scratchpad'e yaz ve `npx tsx --tsconfig ./tsconfig.json <mutlak yol>` ile koş; @/ alias'ları çözülür, komşunun kapısı kırılmaz
metadata:
  type: reference
updatedAt: 2026-09-10
---

Gerçek veritabanına karşı tek seferlik bir doğrulama betiği gerektiğinde onu
`scripts/` altına yazma: paylaşımlı ağaçta commit'lenmemiş `scripts/*.ts` dosyaları
komşu ajanların `lint` / `typecheck` / `build` kapılarını kırar
([[fabrika-untracked-scratch-scripts-break-gates]]).

Betiği **scratchpad'e** yaz ve repo kökünden şöyle koş:

```bash
cd /Users/macbook/AgentSpace/fabrika
npx tsx --tsconfig ./tsconfig.json /private/tmp/.../scratchpad/verify-x.ts
```

`--tsconfig` şart: betik repo ağacının dışında olduğu için `tsx` yukarı doğru arayınca
projenin `tsconfig.json`'ını bulamaz ve `@/lib/db`, `@/lib/observability/...` gibi
`@/* → ./src/*` alias'ları çözülmez. Bayrakla verildiğinde alias'lar çalışır, yani
betik **üretim kod yolunun kendisini** (sahtesini değil) çağırabilir.

Betiğin içinde `import 'dotenv/config'` gerekir — `.env` otomatik yüklenmez.

Kazanç: doğrulama gerçek Prisma istemcisi üzerinden koşar, repo ağacı hiç kirlenmez,
ve iş bitince silinecek bir şey kalmaz. `git status --porcelain | grep verify-` ile
repoya sızmadığını teyit et.
