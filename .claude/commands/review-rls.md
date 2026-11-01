Depodaki tüm kiracıya özel tabloları tara ve RLS kapsamını denetle.

1. `prisma/schema.prisma`'da `tenantId` alanı olan tüm modelleri listele.
2. `prisma/rls.sql`'de her biri için ENABLE + policy var mı kontrol et; eksikleri ekle.
3. `src/` içinde `prisma.` doğrudan çağrılarını bul; `withTenant()` dışındakileri raporla ve düzelt.
4. `pnpm test tests/rls.spec.ts` çalıştır; sonucu özetle.
