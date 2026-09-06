# Memory Index

- [fabrika-local-dev-db](fabrika-local-dev-db.md) — Fabrika yerel dev Postgres'i sıfırdan nasıl kurulur ve neden yerelde RLS gerçekten test edilemez
- [fabrika-prisma7-driver-adapter](fabrika-prisma7-driver-adapter.md) — Fabrika'da Prisma 7 driver adapter zorunlu — çıplak new PrismaClient() ve tsx script'lerinde .env yüklenmemesi tuzağı
- [fabrika-rls-bypass-local-dev](fabrika-rls-bypass-local-dev.md) — Local fabrika DB role is SUPERUSER+BYPASSRLS so RLS is never enforced — prove isolation with a temporary NOBYPASSRLS probe role
- [fabrika-runtime-verification-recipe](fabrika-runtime-verification-recipe.md) — Fabrika'da bir değişikliği gerçekten doğrulama reçetesi — dev sunucu tekliği, curl ile NextAuth oturumu, seed kullanıcıları, DB durumu kontrolü
- [fabrika-withtenant-set-config](fabrika-withtenant-set-config.md) — withTenant() must use set_config() not SET LOCAL — Postgres SET rejects bind parameters, so $executeRaw template literals always fail with 42601
