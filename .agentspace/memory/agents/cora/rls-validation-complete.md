---
name: rls-validation-complete
description: RLS validation CI system complete — 33 models verified, check script deployed
metadata:
  type: project
  updatedAt: 2026-09-06
---

## RLS Validation System Live

**Commit:** 03eed04 `feat(security): RLS validation CI check and policy enforcement`

### What's in place
- `pnpm rls:check` script validates that all tenant-scoped models (tenantId field) have RLS policies
- 33 models pass; Claim + ProposalUsage policies added to prisma/rls.sql
- GitHub Actions workflow (.github/workflows/check-rls.yml) blocks PR merge if policy missing
- Placeholder e2e tests (tests/e2e/rls.spec.ts) for Phase 2 tenant-isolation verification

### Model classification (system-wide vs tenant-scoped)
**System-wide (no RLS policy needed):** Tenant, User, Call, Topic, TopicStat, RawFetch, CordisProject, CordisOrganization, CordisParticipation, CordisProjectTopic, CordisProjectSciVoc, CordisImportRun, CordisPartnerProfile, CordisCoParticipation, SystemAlert, ClaimEvidenceLink, EvidenceReminder

**Tenant-scoped (tenantId String, RLS required):** 33 models including new Claim, ProposalUsage

**Nullable-tenant (shared + tenant-scoped):** Document, Chunk, ConceptTemplate

### Next developer task
When adding new tenant-scoped model with tenantId field:
1. Add to schema.prisma normally
2. Run `pnpm db:migrate`
3. Add model name to FOREACH array in prisma/rls.sql (line ~7)
4. Run `pnpm db:rls` to apply policies
5. Run `pnpm rls:check` to verify
6. Commit schema + rls.sql changes together

CI will catch if you forget step 3-4.

### Key insight
RLS enforcement is DB-level, not app-level. withTenant(prisma, tenantId) sets app.tenant_id session variable, but the policy blocks at the postgres layer. A developer mistake (yalın Prisma call outside withTenant) would return 0 rows due to RLS, not 500 error — still safe, but unclear. Lint rule prevents this.
