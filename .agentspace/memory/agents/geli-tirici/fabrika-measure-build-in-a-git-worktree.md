---
name: fabrika-measure-build-in-a-git-worktree
description: Paylaşılan :3000 dev sunucusunu öldürmeden önce/sonra pnpm build ölçmenin çalışan tarifi — git worktree + kendi pnpm install'ı (symlink node_modules Turbopack'i panikletir) + prisma generate
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'da `next build` ile `next dev` aynı `.next/` dizinini kullanır; paylaşılan
:3000 dev sunucusu ayaktayken repoda build koşmak onu bozar. Önce/sonra rota tablosu
ölçmek gerektiğinde ayrı bir worktree kur:

```bash
WT=<scratchpad>/wt-build
git worktree add --detach "$WT" HEAD
cd "$WT" && pnpm install --frozen-lockfile   # ~6 sn (pnpm store hardlink'liyor)
pnpm prisma generate                          # ŞART, yoksa build kırılır
cp /Users/macbook/AgentSpace/fabrika/.env "$WT/.env"
pnpm build
```

İki tuzak, ikisi de ölçüldü:

1. **`node_modules`'ü symlink ETME.** Turbopack panikliyor:
   `Symlink [project]/node_modules is invalid, it points out of the filesystem root`
   (FATAL, build çöküyor). Worktree'de kendi `pnpm install`'ını koş.
2. **`pnpm prisma generate`'i atlama.** Aksi halde
   `Module not found: Can't resolve '.prisma/client/index-browser'` ile düşer;
   `pnpm install` bunu worktree'de üretmiyor.

Aynı worktree'de ikinci (sonrası) ölçüm: değişen dosyaları kopyala, `.next`'i `mv` ile
kenara al (`rm -rf .next` izin istemine takılıyor), yeniden build et.

Rota tablosunu ayıklarken ANSI'yi temizle ve `grep -aE '^(├|└|┌) '` kullan — BSD grep'te
`[├└┌]` köşeli-parantez sınıfı çok baytlı karakterlerde sessizce 0 satır döndürüyor.
Statiklik farkını iki ayrı yerden doğrula: rota tablosu (○/●/ƒ) **ve**
`.next/prerender-manifest.json` + `.next/server/app/**/*.html` dosya listesi.

Bkz. [[playwright-reuse-existing-server-tests-someone-elses-build]]
