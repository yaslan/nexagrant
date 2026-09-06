Yeni bir Prisma modeli ekle. Argüman: model adı ve kiracıya özel mi (tenant-scoped) bilgisi.

1. `prisma/schema.prisma`'ya modeli ekle (PascalCase tekil; kiracıya özelse `tenantId String` + `@@index([tenantId, ...])`).
2. `pnpm db:migrate --name add_<model>` çalıştır.
3. Kiracıya özelse `prisma/rls.sql`'e `ENABLE ROW LEVEL SECURITY` + politika ekle; `scripts/check-rls.ts` geçmeli.
4. Gerekliyse `prisma/seed.ts` güncelle.
5. `docs/DATA_MODEL.md` ilgili bölümü güncelle.
6. Birim test: en az bir RLS negatif testi (`tests/rls.spec.ts`'e satır ekle).
