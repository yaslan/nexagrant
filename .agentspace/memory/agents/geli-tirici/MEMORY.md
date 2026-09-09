# Memory Index

- [fabrika-beforeinteractive-queued-not-parse-time](fabrika-beforeinteractive-queued-not-parse-time.md) — Next.js Script strategy="beforeInteractive" __next_s kuyruğuna gidiyor; paint-öncesi için klasik blocking `<script src>` tag kullan
- [m6-scoring-complete](m6-scoring-complete.md) — M6.3 Scoring Logic tamamlandı — puanlama motor, ESR comparison, validation + tests all passing, gate clean

- [fabrika-tsx-script-must-live-in-repo-root](fabrika-tsx-script-must-live-in-repo-root.md) — Fabrika'da tek seferlik DB sorgusu için tsx script'i scratchpad'e değil repo köküne yaz — Prisma client generated/prisma/client'ta ve driver adapter istiyor, dışarıdan import çözülmez

- [fabrika-dev-postgres-is-up](fabrika-dev-postgres-is-up.md) — Fabrika'da yerel Postgres AYAKTA (localhost:5432) — "DB yok" diye uçtan-uca doğrulamayı atlama, önce nc -z localhost 5432 ile bak

- [fabrika-e2e-gate-was-never-running](fabrika-e2e-gate-was-never-running.md) — Fabrika'da pnpm test:e2e S9'a kadar hiç koşmadı (playwright.config yoktu) — "e2e yeşil" iddialarına güvenme, config'i ben ekledim
- [fabrika-m6-panel-e2e-fixture](fabrika-m6-panel-e2e-fixture.md) — Fabrika'da gerçek-tarayıcı e2e için hazır reçete — seed script + credentials login + cookie banner atlatma + main scope

- [fabrika-iyzico-billing-flow](fabrika-iyzico-billing-flow.md) — Fabrika iyzico ödeme akışının kilit kararları — kiracı conversationId'den okunur, para sağlayıcıdan yeniden okunur, imza şeması sandbox'a karşı HENÜZ doğrulanmadı
- [fabrika-next16-second-dev-server-refused](fabrika-next16-second-dev-server-refused.md) — Fabrika'da ikinci bir `next dev` başlatılamaz (Next 16 "Another next dev server is already running" der) — ayrı portta gerçek HTTP e2e için `next build` + `next start -p <port>` kullan

- [fabrika-git-stash-is-unsafe-in-shared-tree](fabrika-git-stash-is-unsafe-in-shared-tree.md) — Fabrika'da lint/test baseline'ı ölçmek için git stash KULLANMA — paralel ajanların commit edilmemiş işini de alır; baseline'ı hata-dosya eşlemesiyle ölç

- [fabrika-soft-delete-column-without-filters](fabrika-soft-delete-column-without-filters.md) — Fabrika'da bir soft-delete sütununa yazma yolu açmadan önce o sütunu KAÇ sorgunun filtrelediğini say — Opportunity.deletedAt için 24 okumadan yalnız 4'ü filtreliyordu

- [fabrika-side-by-side-evidence-shot](fabrika-side-by-side-evidence-shot.md) — "İki ekranı YAN YANA kanıtla" istendiğinde — Playwright ile her ekranın ELEMENT görüntüsünü al, data URI olarak tek bir setContent sayfasına koy, onu screenshot'la

- [fabrika-photograph-degraded-state-by-renaming-function](fabrika-photograph-degraded-state-by-renaming-function.md) — Bir bağımlılık okunamadığında UI'ın ne gösterdiğini tarayıcıda kanıtlamak için DB fonksiyonunu DROP etme — ALTER FUNCTION ... RENAME ile kenara al, finally'de geri adlandır

- [fabrika-fabrication-audit-must-cover-defaults](fabrika-fabrication-audit-must-cover-defaults.md) — Uydurma veri avında yalnız uydurulmuş DEĞERLERİ arama — bir şey İDDİA EDEN varsayılanlar (`@default("VALID")`, `status || 'VALID'`, hardcoded `status: 'VALID'`) de uydurmadır; ayrıca doğrulama kolonu çoğu zaman ZATEN vardır, kimse okumuyordur

- [e11-3-calibration-status](e11-3-calibration-status.md) — E11.3 ESR Calibration — Fixture tamamlandı, Rule A 80% (kriter karşılanmıyor), anket 2026-09-21 bekleniyor

- [fabrika-baseline-snapshot-goes-stale](fabrika-baseline-snapshot-goes-stale.md) — Paylaşılan ağaçta lint/typecheck baseline'ını kendi dosyalarını scratchpad'e kopyalayıp HEAD'e döndürerek ölç — ama snapshot'tan SONRA yaptığın düzeltmeler snapshot'ta yok, geri kopyalarsan onları ezersin

- [fabrika-e2e-gate-blocked-by-landing-page-500](fabrika-e2e-gate-blocked-by-landing-page-500.md) — Playwright webServer sağlık kontrolü / (ana sayfa) üzerinden yapılır — ana sayfa 500 dönerse reuseExistingServer çalışmaz ve tüm e2e EADDRINUSE ile ölür; E2E_BASE_URL'i sağlıklı bir yola çevir
- [fabrika-module-gate-is-two-locks](fabrika-module-gate-is-two-locks.md) — Fabrika modül kapısı iki kilit — ModuleState=ON VE planın modülü vermesi; e2e seed'i yalnız birincisini kurarsa sayfa "aboneliğinizin kapsamı dışında" der

- [fabrika-no-psql-use-prisma-queryraw](fabrika-no-psql-use-prisma-queryraw.md) — Fabrika kutusunda psql YOK — gerçek SQL kanıtı için tek satırlık bir tsx script'ten prisma.$queryRawUnsafe kullan; ölçüm fixture'ını kendi kiracısında kur ve mutlaka geri al
- [fabrika-topicmatch-is-keyed-per-topic-not-per-opportunity](fabrika-topicmatch-is-keyed-per-topic-not-per-opportunity.md) — Fabrika'da G0 kanıt kaydı TopicMatch konu başına anahtarlı ama puan fırsat başına değişir — aynı konuda iki fırsat panoda birbirinin puanını gösterir; "kanıta bağla" düzeltmelerinde anahtarın granülerliğini kontrol et

- [fabrika-recard-verify-then-file-the-followups](fabrika-recard-verify-then-file-the-followups.md) — Bir kart ikinci kez düştüğünde işi tekrarlama — HEAD'de hâlâ çalıştığını ölç ve ilk raporun "ayrı kart şart" dediklerini board'da gerçekten açık mı diye KONTROL ET

- [fabrika-retire-a-setting-loudly-not-silently](fabrika-retire-a-setting-loudly-not-silently.md) — Bir ortam değişkeni işlevsiz kaldığında şemadan silme — "set edilmiş ve YOK SAYILIYOR" diye raporla; sessizce silmek, hâlâ set eden kurulumun o sayının çalıştığını sanmasına yol açar
- [fabrika-shared-tree-red-clears-when-its-owner-commits](fabrika-shared-tree-red-clears-when-its-owner-commits.md) — Paylaşılan ağaçta kırmızıyı `git status`'taki SAHİPLİK + import grafiğiyle atfet, sonra sahibi commit ettikten sonra tekrar koş — kırmızının kendiliğinden kapanması atfın kanıtıdır
- [fabrika-verify-a-memory-notes-data-before-shipping-it](fabrika-verify-a-memory-notes-data-before-shipping-it.md) — Başka bir ajanın hafıza notu "27 AB oranını iki kaynakta doğruladım" dese bile oranları KENDİN çek — not kararı taşır, veriyi taşımaz; kaynağı ve veri tarihini koda yaz

- [fabrika-a-refactor-docstring-claims-work-that-may-not-exist](fabrika-a-refactor-docstring-claims-work-that-may-not-exist.md) — "Bu kural artık tek yerde / N kopya birleştirildi" diyen docstring bir İDDİADIR — kaldırdığını söylediği kalıbı grep'le doğrula; ayrıca sayısal olarak ÖZDEŞ bir kopyayı hiçbir değer testi yakalayamaz

- [fabrika-measure-build-in-a-git-worktree](fabrika-measure-build-in-a-git-worktree.md) — Paylaşılan :3000 dev sunucusunu öldürmeden önce/sonra pnpm build ölçmenin çalışan tarifi — git worktree + kendi pnpm install'ı (symlink node_modules Turbopack'i panikletir) + prisma generate
- [fabrika-script-in-jsx-hydration](fabrika-script-in-jsx-hydration.md) — React warns when script tags are inside JSX component tree, not about head/body placement
- [fabrika-test-timing-e2e-parse-time-measurement](fabrika-test-timing-e2e-parse-time-measurement.md) — E2E test'te parse-time initialization ölçmek için chunk delay stratejisi, bidirectional kanıt
- [fabrika-theme-is-a-server-resolved-cookie](fabrika-theme-is-a-server-resolved-cookie.md) — Fabrika'da tema artık fabrika-theme çerezinden SUNUCUDA çözülüyor ve html etiketine basılıyor; theme-init.js yok, localStorage yok — Next kendi Vary'sini yazdığı için config'teki Vary satırı boşa gidiyor
- [next-script-beforeinteractive](next-script-beforeinteractive.md) — next/script ile beforeInteractive stratejisi, head'te dangerouslySetInnerHTML script'ini React uyarısı olmadan inject eder
