---
name: fabrika-a-second-permissive-policy-beats-rewording-tenant-isolation
description: prisma/rls.sql'de bir istisna açman gerekirse tenant_isolation'ı YENİDEN YAZMA — ayrı bir PERMISSIVE politika ekle; permissive politikalar OR'lanır ve dokuz migration'daki bayt-bayt kopya sağ kalır
metadata:
  type: project
  updatedAt: 2026-09-11
---

2026-09-11, TASK-MTVTPVTEBCF5Z (Dilim 6). 35 meşru çapraz-kiracı okumasına kapı açmak
gerekiyordu. Refleks çözüm `tenant_isolation`'ın `USING` ifadesine bir `OR` eklemekti.
Bu, dokuz migration'ı birden kırardı: `scripts/rls-migrations.ts` her migration'ın
`tenant_isolation` kopyasını `prisma/rls.sql`'deki gövdeyle **bayt bayt** karşılaştırıyor
(`pnpm rls:check` CHECK 4b). Tek bir boşluk farkı bile kırmızı.

Çalışan şekil — politikayı hiç ellememek:

```sql
CREATE POLICY system_scope ON %I
  USING      (current_setting('app.system_scope', true) = 'on')
  WITH CHECK (current_setting('app.system_scope', true) = 'on');
```

PostgreSQL'de aynı komut için birden çok **PERMISSIVE** politika `OR`'lanır. Yani
`tenant_isolation` bir harfi bile değişmeden yerinde kalır, yeni politika onun yanına
gelir, kapı yeşil kalır.

İki ayrıntı, ikisi de bedelini ödetir:

1. **Politikayı tablo listesinden değil `pg_policies`'ten türet.** Üçüncü bir elle
   tutulan tablo dizisi, ilk ikisinden kaçınılmaz olarak sapar:
   `SELECT DISTINCT tablename FROM pg_policies WHERE policyname IN ('tenant_isolation','tenant_or_shared')`.
2. **GUC'u `is_local => true` ile set et** ve kapatma fonksiyonu YAZMA. Çıkış COMMIT /
   ROLLBACK olur; çağıran kapatmayı unutamaz. `enter_system_scope(purpose)` SECURITY
   DEFINER, purpose'u kapalı listeye karşı veritabanında doğrular, EXECUTE yetkisi
   `fabrika_app`'e adıyla verilir — `REVOKE EXECUTE` kapıyı deploy'suz kapatır.

**Sınırı da bil:** uygulama rolü `set_config('app.system_scope','on',true)` çağrısını
kendi de yapabiliyor (ölçüldü). Bu yol "kapsamı UNUTMAYA" karşı korur, "ele geçirilmiş
sürece" karşı değil — tıpkı `withTenant`'ın `app.tenant_id`'yi istediği kiracıya set
edebilmesi gibi. Sert sınır ikinci bir rol/bağlantı ister.

İlgili: [[fabrika-moving-a-table-between-rls-policy-classes]] ·
[[fabrika-three-migrations-state-no-rls-policy]] · [[fabrika-withtenant-set-config]] ·
[[fabrika-cross-tenant-calls-are-a-precondition-not-an-exception]] ·
[[fabrika-a-wrapper-migration-is-red-first-in-the-positive-direction]]
