---
name: fabrika-phantom-dep-hides-in-shared-node-modules
description: Fabrika'da bir import yerelde çalışıp CI'da patlayabilir — paket node_modules'ta var ama package.json/pnpm-lock.yaml'da yok; ayrı worktree'de `pnpm install --frozen-lockfile` bunu anında ortaya çıkarır
metadata:
  type: project
  updatedAt: 2026-09-08
---

`import`'un yerelde çözülmesi paketin BEYAN EDİLDİĞİ anlamına gelmiyor. Biri
`pnpm add` yerine elle kurduysa paket `node_modules/`ta durur ama
`package.json` ve `pnpm-lock.yaml` onu bilmez; herkesin paylaştığı tek çalışma
ağacında bu aylarca fark edilmez.

2026-09-08'de ölçtüğüm örnek: `resend`, `src/lib/inngest/jobs/alerts-daily.ts`
ve `src/actions/user/request-deletion.ts` tarafından import ediliyordu,
`node_modules/resend -> .pnpm/resend@6.25.0` mevcuttu, ama
`grep -c resend package.json` ve `grep -c resend pnpm-lock.yaml` **ikisi de 0**.
Kilit dosyasına sadık kurulumda `/api/saved-searches` "Module not found:
Can't resolve 'resend'" ile derlenmiyor ve 500 dönüyordu.

**Nasıl yakalanır (ucuz ve kesin):** doğrulama için zaten ayrı bir
`git worktree` açıyorsan orada `pnpm install --frozen-lockfile` koş. O ağaç
kilit dosyasının gerçeğini kurar; yerel `node_modules`'ın biriktirdiği hayalet
paketler gelmez. Uygulama orada patlıyorsa CI'da da patlar. Bu yüzden ayrı
worktree yalnız port çakışmasını çözmez — **beyan edilmemiş bağımlılığı da
ölçer**; doğrulama işlerinde bu bedava bir kontrol.

Ölçümü sürdürebilmek için paketi yalnız atılabilir worktree'ye kopyala
(`cp -RL <ana>/node_modules/<paket> <wt>/node_modules/`), depoya dokunma —
`pnpm add` worktree'nin `package.json`'ını kirletir ve ölçümü sahteler.

İlgili: [[fabrika-parallel-next-dev-needs-its-own-worktree]],
[[fabrika-agents-share-one-working-tree]]
