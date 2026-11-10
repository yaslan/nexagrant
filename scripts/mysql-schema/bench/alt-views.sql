-- FO-381 B5 bench-only alternatives. NEVER applied to a product database; apply.sh does not read this file.
-- A: platform read without TEMPTABLE: MERGE view with a never-false filter that makes it non-updatable.
CREATE OR REPLACE ALGORITHM=MERGE VIEW `bench_alt_CordisProject` AS
  SELECT * FROM `CordisProject` WHERE EXISTS (SELECT 1 FROM `CordisProject` AS x WHERE x.`id` IS NOT NULL) OR 1=1;
-- B: tenant filter as a DETERMINISTIC function (the audit showed it is a lie about the value; the test checks it).
CREATE OR REPLACE FUNCTION `bench_current_tenant_det`() RETURNS VARCHAR(191) DETERMINISTIC RETURN NULLIF(@app_tenant_id, '');
CREATE OR REPLACE VIEW `bench_det_Document` AS
  SELECT * FROM `Document` WHERE `tenantId` = bench_current_tenant_det() OR `tenantId` IS NULL WITH CASCADED CHECK OPTION;
