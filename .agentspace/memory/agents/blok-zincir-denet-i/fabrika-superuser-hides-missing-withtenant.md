---
name: fabrika-superuser-hides-missing-withtenant
description: Kiracı tablosunu withTenant DIŞINDA okumak yerelde DOĞRU görünür — DATABASE_URL SUPERUSER; hatayı görmek için aynı fonksiyonu fabrika_app rolüne bağlı client'la koştur
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTRJ32BZBY2AI. `plansVisibleToTenant` `PlanAssignment`'ı çıplak tekille
(`prisma.planAssignment.findMany({ where: { tenantId } })`) okuyordu. Yerelde kusursuz
çalışıyordu; üretimin rolünde özel paket **kendisine atanmış kiracıdan kayboluyordu**.

Mekanizma: `tenant_isolation` politikası `"tenantId" = current_setting('app.tenant_id', true)`
karşılaştırır. `withTenant` çağrılmazsa ayar set edilmez, karşılaştırma her satır için NULL
olur ve tablo **boş** okunur. `where: { tenantId }` daraltmayı yapıyor gibi görünür ama
**politika önce cevap verir**. Reddedilme değil, sessiz boşluk — bu yüzden log da yok.

Yerelde görünmemesinin sebebi: `DATABASE_URL` rolü `fabrika` ve o **SUPERUSER**, yani
politikalardan muaf. `DATABASE_URL_RLS_TEST` rolü `fabrika_app` (NOBYPASSRLS) gerçeği söyler.

TUZAK: "atanmamış kiracı göremiyor" ölçümü bu hatayı ÖRTER — o kiracının boş sonucu zaten
beklenendir. **İki yönü de ölç**: atanmış kiracı GÖRMELİ, atanmamış GÖRMEMELİ.

Fonksiyonu (mock'suz, gerçek DB) o role karşı koşturmanın yolu — bkz.
`tests/plan-visibility-rls.spec.ts`:

```ts
const rls = createDbClient(envValue('DATABASE_URL_RLS_TEST')!);
vi.resetModules();
vi.doMock('@/lib/db', () => ({
  prisma: rls,
  withTenant: (t, cb) => withTenantOn(rls, t, cb),
  withTenantOn, createDbClient,
}));
const { plansVisibleToTenant } = await import('@/lib/billing/plan-repository');
```

Sınıf bu dosyayla sınırlı değil: `prisma.<kiracıyaÖzelModel>` deseninin her geçtiği yer
aynı sessiz boşluğu üretebilir.

İlgili: [[fabrika-schema-done-means-information-schema]] · [[fabrika-rls-flow-complete]]
