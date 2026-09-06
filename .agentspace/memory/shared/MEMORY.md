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
