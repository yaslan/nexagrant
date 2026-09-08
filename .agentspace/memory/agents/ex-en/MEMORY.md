# Memory Index

- [fabrika-hardcoded-copy-defeats-grep-audit](fabrika-hardcoded-copy-defeats-grep-audit.md) — Bir denetimin "grep ile bulunamadı → özellik yok" bulgusu, copy sabit gömülüyse yanlış teşhis verir — yüzeyi bul ve tarayıcıda aç, denetimin grep'ini tekrarlama

- [eslint-disable-must-hug-the-offending-line](eslint-disable-must-hug-the-offending-line.md) — eslint-disable-next-line direktifi ile hatalı satır arasına yorum/boş satır girerse bastırma çalışmaz — Fabrika'da 7 lint hatasının 4'ünün gerçek kök nedeni buydu
- [fabrika-lint-gate-green-narrow-exceptions](fabrika-lint-gate-green-narrow-exceptions.md) — Fabrika lint kapısı 2026-09-07'de 0 hataya indi — patron kararı derin refactor değil dar/gerekçeli satır-içi istisna; borç TASK-MTQVFP0LV3YV7'de
- [fabrika-untracked-scratch-scripts-break-gates](fabrika-untracked-scratch-scripts-break-gates.md) — Paralel ajanın commit'lenmemiş scripts/_dogfood-*.ts dosyaları typecheck ve build'i kırar — kapıyı HEAD'den açılan izole git worktree'de koş, dosyalara dokunma

- [fabrika-g0-25-opportunities-was-two-tenants](fabrika-g0-25-opportunities-was-two-tenants.md) — "25 fırsat 18 alıyor" kartı yanıltıcıydı — sadece demo-tenant'ın 5'i öyleydi; esr-calibration'ın 20'si ayrı bir fixture mekanizmasından zaten farklılaşmıştı. Ayrıca G0 demo-tenant tavanı yapısal olarak 75/100'de kilitli.

- [fabrika-entitlement-is-getentitlements-not-planentitlement](fabrika-entitlement-is-getentitlements-not-planentitlement.md) — CLAUDE.md §4'ün andığı PlanEntitlement tablosu ve src/lib/authz depoda YOK — hak edişin tek gerçeği src/lib/billing.ts::getEntitlements(); plan kapısı 2026-09-07'de checkModuleAccess içine bağlandı

- [fabrika-dashboard-threshold-rate-learned](fabrika-dashboard-threshold-rate-learned.md) — KPI panoda "Eşik Üstü Oranı" kartı ekledi (2026-09-07) — MetricValue tasarımı, i18n kaynakları, pano grid düzeni kalıcı bilgi

- [fabrika-ghost-tables-are-mostly-dead-code](fabrika-ghost-tables-are-mostly-dead-code.md) — Dört "hayalet tablo"dan üçü (Participation/Collab/OrgTopicStat) canlı çağrısı olmayan ölü koddu; sınıfın gerçek kalıntısı hayalet ALAN/İLİŞKİ — sso.ts, calls/turkey, api/v1/calls, m2 actions, alerts-daily

- [fabrika-playwright-webserver-probe-blocks-e2e](fabrika-playwright-webserver-probe-blocks-e2e.md) — Fabrika'da pnpm test:e2e hiç koşmuyor — playwright.config hazırlık probu / (=> /tr, 500) üzerinden gidiyor, sunucuyu kapalı sanıp ikincisini açıyor ve EADDRINUSE ile ölüyor; çözüm scratch config

- [prove-a-gate-catches-the-bug-without-a-worktree](prove-a-gate-catches-the-bug-without-a-worktree.md) — Bir kapının gerçekten yakaladığını kanıtlamak için hatayı geri koy-koş-geri al'ı TEK bash komutunda yap; git worktree izni reddedilirse tercih edilen yol budur

- [feature-can-be-complete-and-unreachable](feature-can-be-complete-and-unreachable.md) — Bir özelliğin sayfası + API'si + i18n'i + testi yeşil olabilir ve özellik yine de ÖLÜ olabilir — hiçbir yer ona link vermiyorsa; denetimde "var mı" değil "ulaşılabilir mi" diye sor

- [fabrika-jsdom-has-no-localstorage](fabrika-jsdom-has-no-localstorage.md) — Fabrika'nın vitest/jsdom ortamında localStorage HİÇ YOK (typeof undefined, window'da da globalThis'te de) — tarayıcı-depolaması kullanan bileşen testi kendi Storage'ını kurmalı

- [measure-a-static-gate-by-lifting-its-scanner](measure-a-static-gate-by-lifting-its-scanner.md) — Bir statik kapıyı genişletmeden önce tarayıcısını scratchpad'e kaldırıp tsx ile koş — bulgu sayısını repoya dokunmadan ölçersin ve naif genişletmenin yanlış pozitiflerini önce görürsün
