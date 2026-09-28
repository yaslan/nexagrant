-- Rollback for add-agency-funnel.sql (TASK-MULRQSJFB8RWJ). Drops the function
-- only; no rows are touched. Idempotent.

DROP FUNCTION IF EXISTS public.agency_funnel_counts(timestamp without time zone);
