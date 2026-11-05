-- FO-381 B5 bench seed: 200k CordisProject rows and 200k Document rows on the SCRATCH database.
-- Bench-only. Never run this against a product or Hostinger database. Re-running replaces the bench_% rows.
-- The recursive CTE below needs more than the default max_recursive_iterations (1000) for 200k rows.
SET SESSION max_recursive_iterations = 1000000;
DELETE FROM `Document` WHERE `id` LIKE 'bench_%';
DELETE FROM `CordisProject` WHERE `id` LIKE 'bench_%';

INSERT INTO `CordisProject` (`id`, `title`, `objective`, `framework`)
SELECT CONCAT('bench_p', seq), CONCAT('Project ', seq), REPEAT('objective text for the bench project ', 20),
       IF(seq % 2 = 0, 'HORIZON', 'INTERREG')
FROM (WITH RECURSIVE s(seq) AS (SELECT 1 UNION ALL SELECT seq + 1 FROM s WHERE seq < 200000) SELECT seq FROM s) t;

-- tenant A and tenant B roughly half each, 1% shared (NULL). `title` holds the project id for the join.
INSERT INTO `Document` (`id`, `tenantId`, `kind`, `title`)
SELECT CONCAT('bench_d', seq),
       CASE WHEN seq % 100 = 0 THEN NULL WHEN seq % 2 = 0 THEN 'bench_tenant_a' ELSE 'bench_tenant_b' END,
       'topic', CONCAT('bench_p', seq)
FROM (WITH RECURSIVE s(seq) AS (SELECT 1 UNION ALL SELECT seq + 1 FROM s WHERE seq < 200000) SELECT seq FROM s) t;
