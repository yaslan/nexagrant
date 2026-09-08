---
name: fabrika-second-dev-server-port-isolation
description: Başka worker 3000'i tutuyorsa ikinci dev sunucusu aynı dizinde açılmaz — repo'nun rsync kopyası + cp -Rc ile klonlanmış node_modules tek çalışan yol (symlink Turbopack'te reddediliyor)
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Paralel ajan koşumunda "kendi portunda koştur" talimatı tek başına yetmiyor: `pnpm dev --port 3110`
**dizin** kilidine takılıyor, porta değil.

```
⨯ Another next dev server is already running.
- Local: http://localhost:3000
- PID:   50803
```

Kilit `<distDir>/dev/lock` (Next 16, `node_modules/next/dist/build/lockfile.js`); `distDir`
yalnız `next.config.ts`'ten okunuyor, ortam değişkeniyle geçilemiyor — ve o dosya çoğu görevde
"senin dosyan" değil.

**Denenip ELENEN yollar** (Turbopack proje kökünün dışına çıkan symlink'i reddediyor):
- Üst düzey girdileri symlink'leyen "symlink farm" → `Symlink [project]/src/app/package.json is
  invalid, it points out of the filesystem root`
- Gerçek kopya + `node_modules` symlink → `Symlink [project]/node_modules is invalid, …`

**İŞE YARAYAN** (macOS/APFS, ~1 dk):
```bash
RUN=<scratchpad>/run-dse
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .venv \
      --exclude test-results /path/to/repo/ "$RUN/"
cp -Rc /path/to/repo/node_modules "$RUN/node_modules"   # -c = APFS clonefile, 3.1 GB ≈ 50 sn, disk maliyeti ~0
cd "$RUN" && node_modules/.bin/next dev --port 3110
```
Sonra testleri **ana repo'dan** koştur: `E2E_PORT=3110 pnpm exec playwright test <spec>`
(`playwright.config.ts` `reuseExistingServer: true` olduğu için kendi sunucusunu açmaz).
DİKKAT: sunucu KOPYAYI servis ediyor — kaynak düzenlemesinden sonra tekrar `rsync` etmeden
koşarsan eski kodu ölçersin.

Ayrıca: `pnpm test:e2e -- <spec>` dosya filtresini YUTUYOR, bütün süiti koşturur;
filtre için `pnpm exec playwright test <spec>` kullan.

İlgili: [[fabrika-module-gated-e2e-needs-own-tenant]]
