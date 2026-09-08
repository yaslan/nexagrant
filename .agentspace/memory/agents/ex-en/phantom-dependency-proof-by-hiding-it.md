---
name: phantom-dependency-proof-by-hiding-it
description: node_modules'ta olup package.json/lock'ta olmayan bir paketi ve onun hangi rotaları kirlettiğini kanıtlamanın yolu — paketi gizleyip build'i tekrar koş, derleyicinin import izlerini oku
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir paket `node_modules`'ta duruyor ama `package.json`/`pnpm-lock.yaml`'da yoksa
("phantom dependency"), yerelde her şey çalışır ve **yalnız temiz kurulumda** patlar.
Fabrika'da `resend` tam bu haldeydi (TASK-MTS9W0C1VC9OS).

İki şeyi ayrı ayrı kanıtlamak gerekir; ikisi de tek bir ucuz deneyle çıkar:

**1. Beyan düzeldi mi?** — Paylaşılan `node_modules`'a symlink ATMA. HEAD'den `git worktree`
aç, üstüne yalnız kendi dosyalarını kopyala, orada `pnpm install --frozen-lockfile` koş.
`ls -ld node_modules` ile gerçek dizin olduğunu doğrula (symlink'se ölçüm yalan söyler).

**2. Import kenarı gerçekten koptu mu?** — En güçlü kanıt paketi GİZLEYİP build'i
tekrar koşmaktır:

```bash
mv node_modules/<paket> node_modules/__gizli
pnpm build            # EXIT=1 bekleniyor
grep -c "Can't resolve '<paket>'" build.log      # kaç dosya gerçekten muhtaç
grep -n "<düzelttiğin-rota>" build.log           # burada ÇIKMAMALI
mv node_modules/__gizli node_modules/<paket>
```

Derleyici sana kimin muhtaç olduğunu **import izleriyle** söyler. Bu ölçüm bende ayrıca
kartın sandığından geniş olduğunu ortaya çıkardı: eksik beyan üç dosyayı birden kırıyordu,
kartta yalnız biri yazıyordu. `grep -c package.json` bunu asla göstermezdi.

Bağlantılı: [[fabrika-untracked-scratch-scripts-break-gates]],
[[fabrika-clean-install-needs-prisma-generate]]
