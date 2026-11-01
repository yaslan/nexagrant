---
name: rls-validation-complete
description: RLS validation CI & E2E test system complete; 33 models verified with automated PR checks and comprehensive tenant isolation tests
metadata:
  type: project
  updatedAt: 2026-09-06
---

## RLS Validation System — COMPLETE (Phase 1 ✅)

**Latest commit:** c915bc4 `feat(security): complete RLS validation CI check and E2E test framework`

### ✅ Delivered (Today)

#### 1. Enhanced CI Workflow
- `.github/workflows/check-rls.yml`: PR comment on RLS failure with actionable steps
- Exit 1 forces PR to fail if any model missing from `prisma/rls.sql`
- Triggers on schema.prisma or rls.sql changes

#### 2. Comprehensive E2E Tests
- `tests/e2e/rls.spec.ts`: Full tenant-isolation verification suite
  - Workspace/Opportunity isolation (API layer)
  - Evidence & TopicMatch isolation (DB layer)
  - Nullable tenantId (shared Document/Chunk) visibility
  - Cross-tenant psql session variable tests
  - Type-safe with proper TypeScript annotations

#### 3. Documentation
- `docs/SECURITY_COMPLIANCE.md`: Deep RLS patterns section
  - Layered architecture diagram (app → ORM → DB)
  - Policy structure: `USING ("tenantId" = current_setting('app.tenant_id', true))`
  - New model workflow (6 steps)
  - Local testing procedures (psql two-session verification)

#### 4. Package.json Scripts
- `db:migrate`, `db:rls`, `db:seed`, `test:e2e` now defined
- Fixes refs in CLAUDE.md and README.md

### 🧪 Verification
- ✅ `pnpm rls:check`: 33/33 models verified (no missing policies)
- ✅ Negative test: Added DummyTest → detected as missing → removed
- ✅ `pnpm typecheck`: All types valid
- ✅ GitHub Actions workflow structured correctly

### 📋 Models Protected
**33 tenant-scoped models:** Membership, Workspace, Subscription, ModuleState, CreditLedger, AddOn, Opportunity, GateDecision, Proposal, Effort, ConsortiumSeat, PartnerOrg, Evidence, Claim, ConceptNote, ProposalUsage, Relationship, Interaction, SeatCandidate, Evaluation, MeetingBrief, FollowupDoc, ApplicationPart, TtoPortfolioItem, MarketplaceListing, ApiKey, Invitation, ApprovalRequest, TopicMatch, SavedSearch, AiUsageLog, AuditEvent

**Nullable (shared):** Document, Chunk, ConceptTemplate

**System-wide (no RLS):** Tenant, User, Call, Topic, TopicStat, Cordis*, SystemAlert

### 🚀 Developer Workflow
Add new tenant-scoped model:
1. `schema.prisma` → add `tenantId String` field
2. `pnpm db:migrate`
3. `prisma/rls.sql` → add to FOREACH array (line ~7)
4. `pnpm db:rls` (apply policies)
5. `pnpm rls:check` (verify)
6. Commit together

**CI enforces:** PR fails if tenantId model missing from rls.sql

### 🔐 Security Model
- **App layer:** `withTenant(prisma, tenantId)` sets `app.tenant_id` session var
- **DB layer:** PostgreSQL RLS policy blocks all cross-tenant access
- **Failsafe:** Even bare `prisma.model.findMany()` outside withTenant → 0 rows (RLS, not error)
- **Lint rule:** Prevents bare Prisma calls outside withTenant wrapper

### Phase 2 (Future — Gated by MVP)
- E2E tests in CI pipeline (currently local)
- Production RLS policy audit
- Deployment smoke test for policy enforcement
