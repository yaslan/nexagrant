-- Rollback for add-agency-invite-code.sql (TASK-MULRQJQYM0NAM).
-- Drops every invite code and every agency link (AuditEvent rows of type
-- agency.invite.* are kept: they are history, and carry no code). Linked tenants keep their
-- accounts and data; only "agencyId" and "kind" go. Idempotent.

DROP FUNCTION IF EXISTS public.note_agency_invite_rejection(text);
DROP FUNCTION IF EXISTS public.redeem_agency_invite(text);
DROP POLICY IF EXISTS system_scope ON "AgencyInviteCode";
DROP POLICY IF EXISTS tenant_isolation ON "AgencyInviteCode";
DROP TABLE IF EXISTS "AgencyInviteCode";
ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_agencyId_fkey";
DROP INDEX IF EXISTS "Tenant_agencyId_idx";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "agencyId";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "kind";
DROP TYPE IF EXISTS "TenantKind";
