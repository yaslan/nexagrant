-- Rollback for add-consent-record.sql (TASK-MTSWLANXSU0IG).
--
-- Dropping this table destroys the only proof that a disclosure was ever made,
-- and that proof cannot be reconstructed from anything else in the schema.
-- Export it before running this in any database that has served a real
-- registration:
--   \copy (SELECT * FROM "Consent") TO 'consent-backup.csv' CSV HEADER

DROP POLICY IF EXISTS tenant_isolation ON "Consent";
DROP TABLE IF EXISTS "Consent";
DROP TYPE IF EXISTS "ConsentPurpose";
DROP TYPE IF EXISTS "ConsentKind";
