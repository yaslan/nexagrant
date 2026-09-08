---
name: fabrika-i18n-gate-is-effectively-off
description: Fabrika'da `pnpm build` her koşuda "Could not run i18n check" uyarısı basıyor ve geçiyor — scripts/i18n-check.ts şablon değişkenli t() çağrılarını eksik anahtar sanıp exit 1 dönüyor, yani CLAUDE.md kural 8'i koruyan kapı fiilen KAPALI
metadata:
  type: project
  updatedAt: 2026-09-08
---

`pnpm build` çıktısındaki şu satırı **gürültü sanma** — kapının kapalı olduğunun ilanıdır:

```
🌐 Checking i18n translations...
⚠️  Could not run i18n check: Command failed: tsx scripts/i18n-check.ts
```

Betiği elle koştur, gerçek çıkış kodunu gör (2026-09-08 ölçümü):

```
$ npx tsx scripts/i18n-check.ts > /tmp/i18n.log 2>&1 ; echo $?
1
"missingInTurkish": ["Consortium.status.${seat.status}", "Pipeline.detail.tab.${tab}",
                     "Pipeline.detail.archive.error.${res.error}", ...]
```

Kök neden: betik `t()` çağrılarını statik olarak topluyor ama **şablon değişkeni içeren**
anahtarları (`t(\`Pipeline.detail.tab.${tab}\`)`) literal anahtar sanıyor; `messages/tr.json`
içinde böyle bir anahtar olamayacağı için "eksik" sayıyor ve 1 dönüyor. `next.config.ts` bu
hatayı yakalayıp uyarıya çeviriyor, build devam ediyor.

**Sonucu:** CLAUDE.md kural 8'i (kullanıcıya görünen sabit metin yok, yeni anahtar iki dile de
eklenir) koruyan otomatik denetim **hiçbir koşuda gerçekten çalışmıyor**. Bir i18n kartını
"kapı temiz" diye kapatma; anahtar farkını `messages/tr.json` ile `messages/en.json` arasında
elle ya da düzeltilmiş bir betikle ölç.

Bu, `pnpm gate`'in de kör noktasıdır: `gate` = lint + typecheck + test + rls:check + rls:verify —
i18n zaten gate'te yok, yalnız build'de var ve orada da yutuluyor.

İlgili: [[fabrika-local-app-role-bypasses-rls]]
