# Memory Index

- [fabrika-g0-evidence-placeholder-laundering](fabrika-g0-evidence-placeholder-laundering.md) — Kanıt kaydını non-null bir sütuna yazarken koyduğun dolgu değeri, bir sonraki koşuda "ölçülmüş veri" diye geri okunur — bayrakla işaretle, hem create hem update dalında koru

- [ui-guard-behind-hidden-control-is-dead-code](ui-guard-behind-hidden-control-is-dead-code.md) — Koşullu render edilen bir kontrolün kendi hata guard'ı ölü koddur — hata mesajının biçimini düzeltmek yetmez, kontrolü görünür kılıp sebebi söyletmeden düzeltme DOĞRULANAMAZ

- [focus-restore-must-wait-for-enabled](focus-restore-must-wait-for-enabled.md) — Kapanan bir hata bandının odağını geri verirken tıklama anında focus() çağırmak işe yaramaz — hedef düğme o anda disabled olur; odak, düğme yeniden etkinleştikten sonra bir efektle verilmeli

- [fabrika-default-0-columns-hide-absence](fabrika-default-0-columns-hide-absence.md) — Fabrika'da `Float @default(0)` sütunlar yokluğu ölçülmüş sıfır gibi gösteriyor — ayrımı okuma katmanında `MetricValue`/`null` ile taşı, UI'da değil
- [fabrika-e2e-fixture-pattern](fabrika-e2e-fixture-pattern.md) — Fabrika'da gerçek-tıklama kanıtı üretmenin çalışan yolu — scripts/seed-m6-e2e.ts kalıbıyla kendi idempotent fixture'ını yaz, ortak seed'i onarmaya çalışma

- [fabrika-dashboard-outcome-has-no-live-ui-surface](fabrika-dashboard-outcome-has-no-live-ui-surface.md) — Pano kartlarının hiçbiri Proposal.outcome okumuyor — "Eşik Üstü Oranı" anahtarı var ama render edilmiyor; iki CSV uç noktasından biri yetim (ölçüldü 2026-09-07)

- [e11-3-calibration-status](e11-3-calibration-status.md) — E11.3 ESR Calibration mevcut durumu (fixture yeniden üretildi, doğruluk ölçümleri tamamlandı, ortak anketi yanıtları bekleniyor)

- [fabrika-i18n-locales-dead-pattern](fabrika-i18n-locales-dead-pattern.md) — src/locales/{locale}/{namespace}.json pattern is dead code — next-intl reads only messages/{locale}.json; spot & delete these files if you see them

- [fabrika-module-gated-e2e-needs-own-tenant](fabrika-module-gated-e2e-needs-own-tenant.md) — Modül kapılı ekranın e2e'si demo-tenant'ı ödünç alamaz — M9 gibi modüller hem plana hem ModuleState'e bağlı ve demo-tenant'ın planı koşum sırasında değişiyor; kendi kiracını kur

- [fabrika-e2e-red-check-module-lock-first](fabrika-e2e-red-check-module-lock-first.md) — "element not found" ile düşen Fabrika e2e'sinde ÖNCE error-context.md'deki main bloğuna bak — modül kilidi ekranıysa kusur test edilen özellikte değil, fikstürün planı/ModuleState'i eksik
- [fabrika-second-dev-server-port-isolation](fabrika-second-dev-server-port-isolation.md) — Başka worker 3000'i tutuyorsa ikinci dev sunucusu aynı dizinde açılmaz — repo'nun rsync kopyası + cp -Rc ile klonlanmış node_modules tek çalışan yol (symlink Turbopack'te reddediliyor)

- [fabrika-grep-hits-can-be-all-comments](fabrika-grep-hits-can-be-all-comments.md) — Fabrika'da "uydurma isim" kartlarında grep sıfır dönmez — kaldırılan isimler açıklama yorumlarında yaşamaya devam eder; her isabeti kod/yorum diye sınıflandır ve hükmü ekrandan + gerçek dışa aktarım dosyasından ver
- [fabrika-phantom-dep-hides-in-shared-node-modules](fabrika-phantom-dep-hides-in-shared-node-modules.md) — Fabrika'da bir import yerelde çalışıp CI'da patlayabilir — paket node_modules'ta var ama package.json/pnpm-lock.yaml'da yok; ayrı worktree'de `pnpm install --frozen-lockfile` bunu anında ortaya çıkarır
- [fabrika-verification-script-gotchas](fabrika-verification-script-gotchas.md) — Fabrika'da elle doğrulama betiği yazarken dört tuzak — betiği worktree köküne koy, `@playwright/test`ten import et, dev sunucusunda networkidle bekleme, Prisma 7 için çıplak PrismaClient yerine pg ya da tsx
