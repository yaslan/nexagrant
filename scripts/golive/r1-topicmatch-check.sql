-- Go-live ön kontrolü R-1 (TASK-MUOG51GJ3PUOG; kaynak: docs/agent-results/TASK-MUOEY2GBFHY7U-crw2-fb.md §Riskler R-1)
--
-- Soru: bu veritabanında K1 anahtarı `TopicMatch_tenantId_topicId_opportunityId_key` NULLS NOT DISTINCT mi,
-- ve aynı (tenantId, topicId) için birden fazla K1 satırı (opportunityId IS NULL) var mı?
-- `prisma db push` bu anahtarı schema.prisma'dan NULLS DISTINCT kurar. Böyle kurulmuş bir ortamda
-- mükerrer K1 satırı varsa `topicmatch-per-opportunity/migration.sql` §3'te hata verip durur (veri silmez).
--
-- Koşum (sahip rolüyle; RELEASE_CHECKLIST §3.1, "Go-live ön kontrolü R-1"):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/golive/r1-topicmatch-check.sql
--
-- YALNIZ OKUR. Her şey tek bir `BEGIN READ ONLY` işleminde koşar ve ROLLBACK ile biter; bir yazma denemesi
-- "cannot execute ... in a read-only transaction" hatası verir.
--
-- RLS: TopicMatch kiracı tablosudur ve FORCE ROW LEVEL SECURITY altındadır. Süper kullanıcı olmayan sahip
-- rolü kiracı bağlamı olmadan 0 satır okur ve yanlışlıkla "temiz" görünür (aynı tuzak §3.1 2a(c)'de ölçüldü).
-- Bu yüzden işlem içinde `SET LOCAL app.system_scope = 'on'` verilir: prisma/rls.sql'in `system_scope`
-- politikasını yalnız bu işlem için açar (apply-migrations.sh de aynı oturumu kullanır). İşlem bitince düşer.
--
-- Beklenen çıktılar (son satır `R1_SONUC`):
--   R1_SONUC | TEMIZ          → anahtar NULLS NOT DISTINCT = t, mükerrer 0. Devam.
--   R1_SONUC | DB_PUSH_ONCESI → TopicMatch tablosu yok (boş DB, §3.1 1. adımdan önce). Devam; kontrolü
--                               1. adımdan (db push) SONRA ve 3. adımdan (migrations) ÖNCE bir kez daha koşun.
--   R1_SONUC | ANAHTAR_YOK    → tablo var, anahtar yok (eski şema, migration henüz koşmadı). Mükerrer sayısı
--                               yine basılır; 0 ise devam, değilse DUR.
--   R1_SONUC | NULLS_DISTINCT → anahtar NULLS DISTINCT (db push kurmuş), mükerrer 0. Devam: migration
--                               anahtarı tek komutta NULLS NOT DISTINCT'e çevirir.
--   R1_SONUC | RLS_KOR        → rol satırları göremiyor (FORCE RLS, `system_scope` politikası yok, rol süper
--                               değil). Sayım güvenilmez: süper kullanıcıyla ya da `pnpm db:rls` sonrası koşun.
--   R1_SONUC | DUR_MUKERRER   → mükerrer K1 satırı VAR (liste yukarıda). DUR. Temizlik kararı patronun
--                               (K1 türetilmiş veri, yeniden hesaplanır). Migration bu durumda hata verip durur.
-- Çıkış kodu her durumda 0'dır (betik karar vermez, gösterir). Kararı `R1_SONUC` satırı verir.

\set QUIET on
\pset footer off
BEGIN READ ONLY;
SET LOCAL app.system_scope = 'on';
\set QUIET off

-- 0. Bağlam: kim, hangi DB, işlem gerçekten salt-okur mu, RLS kapsamı açık mı.
SELECT current_user                                          AS rol,
       current_database()                                    AS db,
       current_setting('server_version')                     AS pg,
       current_setting('transaction_read_only')              AS read_only,
       current_setting('app.system_scope', true)             AS system_scope,
       to_regclass('public."TopicMatch"') IS NOT NULL        AS tablo_var,
       to_regclass('public."TopicMatch_tenantId_topicId_opportunityId_key"') IS NOT NULL AS anahtar_var,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'TopicMatch'
                  AND column_name = 'opportunityId')         AS opportunity_kolonu_var,
       -- RLS görünürlüğü: satır güvenliği açık, rol süper/BYPASSRLS değil ve `system_scope` politikası yoksa
       -- SET LOCAL satırları açamaz; sayım 0 görünür. O durumda sonuç RLS_KOR olur (güvenilmez).
       coalesce((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public."TopicMatch"')), false)
         AND NOT (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user)
         AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
                          AND p.tablename = 'TopicMatch' AND p.policyname = 'system_scope')
                                                             AS rls_kor
\gset r1_
\echo rol=:r1_rol db=:r1_db pg=:r1_pg read_only=:r1_read_only system_scope=:r1_system_scope
\echo tablo_var=:r1_tablo_var anahtar_var=:r1_anahtar_var opportunity_kolonu_var=:r1_opportunity_kolonu_var rls_kor=:r1_rls_kor

\if :r1_tablo_var
  -- 1. Anahtar NULLS NOT DISTINCT mi? Beklenen: t. `f` = db push kurmuş, migration düzeltir. Satır yoksa anahtar yok.
  \echo '--- 1. anahtar: indnullsnotdistinct (beklenen t)'
  SELECT i.indnullsnotdistinct
    FROM pg_index i
   WHERE i.indexrelid = to_regclass('public."TopicMatch_tenantId_topicId_opportunityId_key"');

  \if :r1_opportunity_kolonu_var
    -- 2. Mükerrer K1 satırları. Beklenen: 0 satır.
    \echo '--- 2. mükerrer K1 (opportunityId IS NULL) çiftleri (beklenen 0 satır)'
    SELECT "tenantId", "topicId", count(*)
      FROM "TopicMatch"
     WHERE "opportunityId" IS NULL
     GROUP BY 1, 2
    HAVING count(*) > 1
     ORDER BY 1, 2;
    SELECT count(*) AS mukerrer_cift,
           coalesce(sum(n - 1), 0) AS fazla_satir
      FROM (SELECT count(*) AS n FROM "TopicMatch" WHERE "opportunityId" IS NULL
             GROUP BY "tenantId", "topicId" HAVING count(*) > 1) d
    \gset r1_
  \else
    -- Kolon yoksa her satır K1 satırıdır ve eski anahtar @@unique([tenantId, topicId]) çift bırakmaz.
    \echo '--- 2. opportunityId kolonu yok (migration öncesi şema): eski (tenantId, topicId) çiftleri'
    SELECT count(*) AS mukerrer_cift,
           coalesce(sum(n - 1), 0) AS fazla_satir
      FROM (SELECT count(*) AS n FROM "TopicMatch"
             GROUP BY "tenantId", "topicId" HAVING count(*) > 1) d
    \gset r1_
  \endif
  \echo mukerrer_cift=:r1_mukerrer_cift fazla_satir=:r1_fazla_satir

  SELECT 'R1_SONUC' AS kontrol,
         CASE
           WHEN :'r1_rls_kor'::boolean THEN 'RLS_KOR'
           WHEN :r1_mukerrer_cift > 0 THEN 'DUR_MUKERRER'
           WHEN NOT :'r1_anahtar_var'::boolean THEN 'ANAHTAR_YOK'
           WHEN (SELECT NOT i.indnullsnotdistinct FROM pg_index i
                  WHERE i.indexrelid = to_regclass('public."TopicMatch_tenantId_topicId_opportunityId_key"'))
             THEN 'NULLS_DISTINCT'
           ELSE 'TEMIZ'
         END AS sonuc;
\else
  \echo '--- TopicMatch tablosu yok: şema henüz kurulmamış (db push öncesi).'
  SELECT 'R1_SONUC' AS kontrol, 'DB_PUSH_ONCESI' AS sonuc;
\endif

ROLLBACK;
