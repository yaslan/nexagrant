# Inngest Integration — Fabrika Job Orchestration

Inngest is the managed job orchestration backbone for Fabrika. It handles all scheduled tasks and background jobs across the MVP.

## Setup

### 1. Environment Variables

Add to `.env` (or `.env.local` for development):

```bash
INNGEST_API_KEY=           # From Inngest dashboard (https://app.inngest.com)
INNGEST_SIGNING_KEY=       # For local development and production webhook signing
RESEND_API_KEY=            # For email sending
WORKER_URL=http://localhost:8000  # Python worker for CORDIS processing
WORKER_TOKEN=              # Token for Python worker authentication
```

**Getting Inngest Credentials:**
1. Create an account at https://app.inngest.com
2. Create a new app "Fabrika" in the dashboard
3. Copy the API Key and Signing Key
4. For local development, use the signing key in `.env.local` (optional but recommended)

### 2. Installation

Inngest is already in `package.json`. Install dependencies:

```bash
pnpm install
```

### 3. Verify Setup

Start the dev server and check:

```bash
pnpm dev
# Inngest handler should respond at POST http://localhost:3000/api/inngest with 200 OK
curl -X POST http://localhost:3000/api/inngest -H "Content-Type: application/json" -d '{"test":true}'
```

Visit [Inngest Dashboard](https://app.inngest.com) → Your App → Functions to see all 5 scheduled jobs registered.

## Job Schemas

All jobs are defined in `src/lib/inngest/jobs/` directory.

### 1. K1 Daily Calls (`k1-daily-calls`)

**Schedule:** Daily at 2 AM UTC  
**Purpose:** Fetch and normalize new funding calls from SEDIA, Eurostars, and TÜBİTAK

**What it does:**
- Calls `SediaAdapter`, `EurostarsAdapter`, `TubitakAdapter` to fetch latest calls
- Normalizes topics into database
- Returns count of inserted topics

**Expected result:**
```json
{
  "success": true,
  "totalProcessed": 150,
  "inserted": 142,
  "sediaCount": 80,
  "eurostarsCount": 45,
  "tubitakCount": 25
}
```

### 2. K2 Monthly CORDIS (`k2-monthly-cordis`)

**Schedule:** 1st of each month at 4 AM UTC  
**Purpose:** Trigger Python worker to fetch and process CORDIS datasets

**What it does:**
- Makes HTTP POST to Python worker at `WORKER_URL/jobs/cordis`
- Worker downloads HE + H2020 CSV datasets
- Processes via DuckDB and Parquet transformations
- Upserts into `Organization`, `Project`, `Participation` tables
- Computes graph metrics (degree, eigenvector centrality)

**Expected result:**
```json
{
  "success": true,
  "message": "CORDIS pipeline triggered successfully",
  "workerResponse": { ... }
}
```

### 3. Alerts Daily (`alerts-daily`)

**Schedule:** Daily at 8 AM UTC  
**Purpose:** Send saved search email alerts to subscribed users

**What it does:**
- Fetches all `SavedSearch` records with `notify: true`
- For each search, finds tenant owner email
- Sends email via Resend with matching opportunities
- Updates `lastRunAt` timestamp

**Expected result:**
```json
{
  "success": true,
  "totalSearches": 25,
  "emailsSent": 20,
  "emailsFailed": 0
}
```

**Note:** User timezone handling is currently at 8 AM UTC. For true user timezone delivery, the application layer should adjust this per tenant.

### 4. Credits Monthly Grant (`credits-monthly-grant`)

**Schedule:** 1st of each month at 6 AM UTC  
**Purpose:** Grant AI credits to active tenants based on plan entitlements

**What it does:**
- Fetches all tenants
- Looks up `aiCreditsMonthly` from plan entitlements via `getEntitlements(tenantId)`
- Creates `CreditLedger` entry with reason `'monthly_grant'`
- Logs failures per tenant

**Expected result:**
```json
{
  "success": true,
  "totalTenants": 50,
  "grantedCount": 47,
  "failedCount": 3,
  "totalCreditsGranted": 2350
}
```

### 5. M4 Weekly Summary (`m4-weekly-summary`)

**Schedule:** Monday at 9 AM UTC  
**Purpose:** Send relationship management summaries and pending actions to focal points

**What it does:**
- Fetches relationships with `nextStepDue` within the next 7 days
- Groups by focal point (tenant + user)
- Counts pending actions per focal point
- (In production, would send email notification)

**Expected result:**
```json
{
  "success": true,
  "totalPendingActions": 42,
  "focalPointsNotified": 18,
  "groupedCount": 18
}
```

## Testing

### Run Unit Tests

```bash
pnpm test -- inngest
# or specifically for job schemas:
pnpm test -- inngest-jobs
```

Tests verify:
- Each job function is properly defined
- Job IDs are unique
- Cron triggers match expected schedules

### Manual Trigger (Dashboard)

1. Go to [Inngest Dashboard](https://app.inngest.com)
2. Select your app
3. Go to Functions
4. Find the job (e.g., `k1-daily-calls`)
5. Click "Run" button
6. Verify result in the function detail view

### Local Development with Inngest Dev Server

(Optional) Run Inngest dev server for local testing:

```bash
# Install Inngest CLI (one-time)
npm install -g inngest

# Run dev server in another terminal
inngest dev --api-key=<your-key>

# Then start your Next.js app
pnpm dev
```

The dev server shows real-time job executions in your terminal.

## Job Architecture

### Directory Structure

```
src/lib/inngest/
├── client.ts              # Inngest client singleton
├── jobs/
│   ├── index.ts          # Exports all jobs
│   ├── k1-daily-calls.ts
│   ├── k2-monthly-cordis.ts
│   ├── alerts-daily.ts
│   ├── credits-monthly-grant.ts
│   └── m4-weekly-summary.ts
src/app/api/inngest/
└── route.ts              # Next.js handler
```

### Inngest Handler

The `/api/inngest` route serves as the webhook endpoint:
- Receives scheduled events from Inngest cloud
- Routes to appropriate job function
- Returns structured results

```typescript
// POST /api/inngest — handles all job executions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [k1DailyCalls, k2MonthlyCordis, alertsDaily, creditsMonthlyGrant, m4WeeklySummary],
});
```

### Multi-Tenant Considerations

**Important:** All jobs run in the context of Fabrika server, not individual tenants. When accessing tenant data:
- Fetch tenants explicitly: `prisma.tenant.findMany()`
- Don't use `withTenant()` wrapper (that's for request-scoped auth)
- Always respect RLS by checking `tenantId` in your queries
- Log tenant ID for traceability

Example:
```typescript
const tenants = await prisma.tenant.findMany();
for (const tenant of tenants) {
  // Do work per tenant
  await prisma.creditLedger.create({
    data: { tenantId: tenant.id, ... }
  });
}
```

## Monitoring & Debugging

### Logs

Job execution logs appear in:
1. **Inngest Dashboard** → Functions → Job Name → Recent Runs
2. **Application Console** (dev mode)
3. **Cloudwatch/Sentry** (production)

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Error 401` from Inngest | Missing/invalid `INNGEST_API_KEY` | Check dashboard, regenerate if needed |
| Job not running | Server offline or not registered | Verify `pnpm dev` running, check dashboard registration |
| Worker call fails (K2) | Python worker unreachable | Check `WORKER_URL`, ensure worker is running |
| Resend errors (Alerts) | Missing `RESEND_API_KEY` | Get key from https://resend.com and add to `.env` |
| RLS errors in job | Using wrong query context | Ensure queries include explicit `tenantId` |

## Roadmap

- **MVP (current):** 5 scheduled jobs, no real K1/K2/email calls (schema only)
- **E4 (K1 v1):** Real SEDIA/Eurostars/TÜBİTAK calls (add API error handling, SystemAlert on failure)
- **E6 (K2 v1):** Real CORDIS zip download, DuckDB transform, Postgres upsert
- **E4 (Alerts v1):** Real saved search diff computation, email sending
- **Roadmap:** Manual trigger UI in Admin Console, job replay, execution history per tenant

## References

- Inngest Docs: https://inngest.com/docs
- Inngest Next.js Guide: https://inngest.com/docs/sdk/next
- Inngest CLI: https://inngest.com/docs/cli
- Project Architecture: `docs/ARCHITECTURE.md` (K1–K6 layers, modules)
- Billing & Entitlements: `docs/BILLING.md` (credit grants, plan tiers)
