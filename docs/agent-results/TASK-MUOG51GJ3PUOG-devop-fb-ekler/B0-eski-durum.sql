-- Senaryo (b) kurulumu: db push'un bıraktığı eski durum. YALNIZ izole test DB'si (devopfb-r1-pg) içindir.
\set ON_ERROR_STOP on
BEGIN;
DROP INDEX "TopicMatch_tenantId_topicId_opportunityId_key";
CREATE UNIQUE INDEX "TopicMatch_tenantId_topicId_opportunityId_key"
  ON "TopicMatch" ("tenantId", "topicId", "opportunityId");            -- NULLS DISTINCT (varsayılan)
-- K1 satırı olmayan bir konu seç, aynı (tenant, topic) için iki K1 satırı ekle.
WITH t AS (
  SELECT tp.id FROM "Topic" tp
   WHERE NOT EXISTS (SELECT 1 FROM "TopicMatch" m WHERE m."topicId" = tp.id AND m."tenantId" = 'demo-tenant')
   ORDER BY tp.id LIMIT 1)
INSERT INTO "TopicMatch" (id, "tenantId", "topicId", "opportunityId", "fitScore", breakdown)
SELECT 'r1-dup-' || g, 'demo-tenant', t.id, NULL, 0.5 + g / 10.0, '{"r1":"dup"}'::jsonb FROM t, generate_series(1, 2) g;
COMMIT;
SELECT i.indnullsnotdistinct FROM pg_index i WHERE i.indexrelid = to_regclass('"TopicMatch_tenantId_topicId_opportunityId_key"');
