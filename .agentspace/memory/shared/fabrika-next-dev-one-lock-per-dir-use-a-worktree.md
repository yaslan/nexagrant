---
name: fabrika-next-dev-one-lock-per-dir-use-a-worktree
description: Next 16 dizin başına tek `next dev` kilidi tutar — paylaşımlı ağaçta kardeş pane sunucusu e2e'yi bloke eder; çözüm izole worktree + `cp -al node_modules` (sembolik bağı Turbopack reddeder)
metadata:
  type: reference
  updatedAt: 2026-09-10
---

TASK-MTVDQPG9V5WVY'de Playwright `webServer` ana ağaçta hiç başlayamadı:

```
⨯ Another next dev server is already running.
- PID: 43413   - Dir: /Users/macbook/AgentSpace/fabrika
```

Kilit **porta değil dizine** bağlı: farklı `--port` vermek çözmez. Fabrika paylaşımlı bir ağaç
ve kardeş pane'ler sürekli sunucu açıyor (bir oturumda 3121 → 3130 gözlendi), yani "boşalmasını
bekle" güvenilir bir strateji değil — bir kez boşaldı, saniyeler içinde yeniden kapıldı.

Kardeş süreci öldürmek yasak. Yabancı sunucuyu yeniden kullanmak da yanlış:
[[fabrika-playwright-reuseexistingserver-lokal-risk]] — bayat build + uygulanmayan `webServer.env`
yalancı yeşil/kırmızı üretir.

**İşe yarayan yol — izole worktree:**

```bash
git worktree add --detach "$WT" HEAD
cp -al /Users/macbook/AgentSpace/fabrika/node_modules "$WT/node_modules"   # sabit bağ, saniyeler
cp .env "$WT/.env"
cd "$WT" && E2E_PORT=3141 npx playwright test tests/e2e/<spec>.ts
```

Farklı dizin = farklı kilit; kardeşleri hiç etkilemez.

**Tuzak:** `node_modules`'ı **sembolik bağlamak** çalışmaz — Turbopack panikler:
`Symlink [project]/node_modules is invalid, it points out of the filesystem root`.
`cp -al` (sabit bağ kopyası) gerekir; 1.4 GB'lık ağaç saniyeler sürer, disk yemez.

**Tuzak 2:** worktree HEAD'i taşır, çalışma ağacındaki commit'lenmemiş dosyaları taşımaz.
Kırmızı ölçüm için bu tam istenen şeydir (düzeltilmemiş HEAD), ama yeni spec dosyasını elle
kopyalaman gerekir; yeşil ölçüm için de düzelttiğin dosyaları worktree'ye kopyala.

**Why:** Kanıt üretemeyen bir kapı, kapı değildir. Paylaşımlı ağaçta e2e koşamamak "e2e atlandı"
gerekçesi olarak kabul edilmemeli — izolasyon ucuz.

İlgili: [[fabrika-playwright-reuseexistingserver-lokal-risk]] · [[fabrika-parallel-agent-file-race]]
