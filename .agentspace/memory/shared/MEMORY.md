# Memory Index

- [fabrika-local-dev-db](fabrika-local-dev-db.md) — Fabrika yerel dev Postgres'i sıfırdan nasıl kurulur ve neden yerelde RLS gerçekten test edilemez
- [fabrika-prisma7-driver-adapter](fabrika-prisma7-driver-adapter.md) — Fabrika'da Prisma 7 driver adapter zorunlu — çıplak new PrismaClient() ve tsx script'lerinde .env yüklenmemesi tuzağı
- [fabrika-rls-bypass-local-dev](fabrika-rls-bypass-local-dev.md) — Local fabrika DB role is SUPERUSER+BYPASSRLS so RLS is never enforced — prove isolation with a temporary NOBYPASSRLS probe role
- [fabrika-runtime-verification-recipe](fabrika-runtime-verification-recipe.md) — Fabrika'da bir değişikliği gerçekten doğrulama reçetesi — dev sunucu tekliği, curl ile NextAuth oturumu, seed kullanıcıları, DB durumu kontrolü
- [fabrika-withtenant-set-config](fabrika-withtenant-set-config.md) — withTenant() must use set_config() not SET LOCAL — Postgres SET rejects bind parameters, so $executeRaw template literals always fail with 42601

- [agent-exit-129-sighup](agent-exit-129-sighup.md) — Ajan görevi "exit 129" ile düşerse bu SIGHUP'tır (dosya/encoding hatası değil) — kök neden genelde ön planda çalıştırılan pnpm dev
- [fabrika-known-failing-tests](fabrika-known-failing-tests.md) — pnpm test'te taban çizgisi 4 kırmızı — 3 SEDIA ağ testi + 1 RLS testi; bunlar senin değişikliğinden değil, kovalama
- [fabrika-parallel-agent-file-race](fabrika-parallel-agent-file-race.md) — Paralel ajanlar aynı dosyayı yazıyor — yazdığın içerik git add'e kadar hayatta kalmayabilir; commit'ten önce git diff --cached ile staged içeriği doğrula
- [fabrika-prisma-client-type-override](fabrika-prisma-client-type-override.md) — src/types/prisma-override.d.ts @prisma/client'ı gölgeliyor — PrismaClient repoda any, Role gerçek enum olduğu için string literal atanamıyor
- [pnpm-double-dash-passthrough](pnpm-double-dash-passthrough.md) — pnpm run'da "-- --flag" yazma — pnpm ayıracı script'e aynen geçirir ve CLI "Unknown flag --" der; doğrusu pnpm tsx scripts/x.ts --flag
- [fabrika-g0-conversion-rate-formula](fabrika-g0-conversion-rate-formula.md) — Proposal.submitted/Opportunity.g0 oranı stage=G0 ile bölünürse >100% verir; doğrusu toplam opportunity/G0 gate-decision sayısı
- [fabrika-m5-kpi-duplicate-implementations](fabrika-m5-kpi-duplicate-implementations.md) — M5 KPI için iki ayrı success-rate implementasyonu var (queries.ts canlı, fetch-metrics.ts atıl) farklı tanımlarla

- [fabrika-session-tenant-mismatch](fabrika-session-tenant-mismatch.md) — Kiracı-kapsamlı her sayfa 0 gösteriyorsa sorgu değil oturum bozuktur — üyeliği olmayan kullanıcıya auth.ts var olmayan "demo-tenant-hq" kiracısını veriyor

- [fabrika-lighthouse-a11y-two-recurring-defects](fabrika-lighthouse-a11y-two-recurring-defects.md) — Fabrika'da Lighthouse a11y'yi 95 altında tutan iki yapısal kusur — html lang eksikliği ve karanlık temada bg-accent üstü beyaz metin

- [fabrika-g0-scoring-three-implementations](fabrika-g0-scoring-three-implementations.md) — G0 skoru için üç ayrı ve çelişkili gerçeklik var (rastgele sayı, 0-10 model, PROJECT.md'nin 0-100 ağırlıkları) ve 70 eşiğinin hangisine uygulandığı karara bağlı

- [fabrika-sentry-envelope-without-sdk](fabrika-sentry-envelope-without-sdk.md) — Fabrika'da Sentry'ye SDK'sız gönderim — envelope HTTP sözleşmesi, DSN yokken no-op deseni ve fetch BodyInit tuzağı

- [agentspace-delegate-splits-numbered-lists](agentspace-delegate-splits-numbered-lists.md) — agentspace_delegate objective'indeki numaralı/madde listesini alt-görevlere böler — tek ajana verilecek çok adımlı iş listesiz yazılmalı

- [fabrika-docker-broken-symlink](fabrika-docker-broken-symlink.md) — Bu makinede docker "yok" DEĞİL — /usr/local/bin/docker kırık symlink; çalışan CLI /Applications/Docker.app/Contents/Resources/bin/docker ve postgres-vector ayakta
- [fabrika-migrations-are-not-prisma-migrate](fabrika-migrations-are-not-prisma-migrate.md) — Fabrika'da prisma/migrations elle yazılmış düz SQL — Prisma Migrate DEĞİL; pnpm db:migrate koşmak veritabanını sıfırlatabilir, doğru yol prisma db execute --file

- [fabrika-team-handover-cekirdek](fabrika-team-handover-cekirdek.md) — Fabrika iki ajan takımı arasında devredildi — eski *-0c1f10 takımı ile yeni Çekirdek takımını raporlarda ayırt etme kuralı

- [fabrika-dashboard-hardcoded-kpi-fallback](fabrika-dashboard-hardcoded-kpi-fallback.md) — KPI panosu (dashboard/client.tsx) gerçek metrik 0 geldiğinde sabit demo rakamlarına düşüyor — CLAUDE.md §7 kanıt disiplinini ihlal ediyor

- [fabrika-board-cards-go-stale](fabrika-board-cards-go-stale.md) — Fabrika görev panosundaki in_progress kartlar bitmiş işi gösteriyor olabilir — kartı koda karşı doğrulamadan iş dağıtma
- [fabrika-k1-upstream-sources](fabrika-k1-upstream-sources.md) — K1'in üç dış kaynağının 2026-09-06'da ölçülmüş gerçek durumu — SEDIA arama yanıtı açıklamayı zaten taşır (topicDetails çağrısı gereksiz), Eurostars portalı 403, TÜBİTAK /en/funding 404

- [fabrika-worker-panes-die-uncommitted](fabrika-worker-panes-die-uncommitted.md) — Fabrika'da worker pane'ler ~30 dakikada code 129 ile ölüyor ve commit edilmemiş işi ağaçta bırakıyor — lider kurtarmak zorunda

- [fabrika-fabricated-fallback-antipattern](fabrika-fabricated-fallback-antipattern.md) — Fabrika kod tabanında yaygın anti-desen — DB/LLM hatasında uydurma rakam render edip DB'ye yazan "demo fallback"lar; CLAUDE.md kural 7 ihlali, gördüğün yerde temizle
- [fabrika-g0-score-never-computed](fabrika-g0-score-never-computed.md) — Fabrika'da G0 kapı puanı hiç hesaplanmıyor — g0Score seed'den statik ya da Math.random() ile geliyor, kanonik scoreG0() üretimde hiç çağrılmıyor (ölçüldü 2026-09-07)

- [fabrika-stripe-idempotency-guard-dead](fabrika-stripe-idempotency-guard-dead.md) — Fabrika'da Stripe webhook'unun idempotency kapısı fiilen kapalı — `data: { equals: { stripeEventId } }` tam-belge eşitliği arıyor, asla eşleşmiyor; webhook kopyalarken bunu kopyalama

- [fabrika-dashboard-outcome-case-mismatch](fabrika-dashboard-outcome-case-mismatch.md) — Fabrika dashboard başarı oranını %0 gösteriyor — kod ABOVE_THRESHOLD arıyor, DB above_threshold tutuyor (ölçüldü 2026-09-07)
- [fabrika-i18n-dead-catalog-trap](fabrika-i18n-dead-catalog-trap.md) — Bir modül JSON i18n katalog dosyası src/locales/<lang>/<mod>.json altına yazılırsa next-intl onu hiç okumaz — DoD "i18n tamam" iddiası doğru olsa bile UI hard-coded kalır
- [fabrika-m6-disclaimer-surfaces](fabrika-m6-disclaimer-surfaces.md) — Evaluator Lens (M6) skoru gösteren beş yüzey ve her birinin "iç ön değerlendirme" etiketini nereden aldığı — yeni copy icat etme, m6.internalPreAssessment anahtarlarını kullan
