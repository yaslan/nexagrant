# Inngest Setup — Fabrika Job Orchestration

Inngest is the managed job orchestration backbone for Fabrika. It handles all recurring jobs (K1 daily calls, K2 monthly CORDIS, alerts, credit grants, M4 summaries) with built-in scheduling, retries, and observability.

## Quick Setup

### 1. Create Inngest Account
1. Go to [inngest.com](https://inngest.com) and sign up (free tier covers MVP).
2. Create a new app called **"Fabrika"**.
3. Copy your **API Key** and **Signing Key** from the dashboard.

### 2. Set Environment Variables
Copy your keys to `.env.local`:

```bash
INNGEST_API_KEY=your_inngest_api_key_here
INNGEST_SIGNING_KEY=your_inngest_signing_key_here
```

(Optional for development: both can be omitted and Inngest will run in dev mode.)

### 3. Start the App
```bash
pnpm dev
```

The Next.js handler at `/api/inngest` will auto-register with Inngest cloud on startup.

## Jobs Overview

| Job | Trigger | Purpose | Module |
|---|---|---|---|
| **k1-daily-calls** | 2:00 AM UTC daily | Fetch SEDIA, Eurostars, TÜBİTAK calls; normalize & store | K1 |
| **k2-monthly-cordis** | 1st of month, 4 AM UTC | Trigger Python worker for CORDIS dataset processing | K2 |
| **alerts-daily** | 8:00 AM UTC daily | Send saved search alerts to subscribed tenants | K1 |
| **credits-monthly-grant** | 1st of month, 6 AM UTC | Grant monthly AI credits per plan entitlements | Billing |
| **m4-weekly-summary** | Mondays, 9:00 AM UTC | Notify focal points of pending relationship actions | M4 |

## Job Schemas

Each job is defined in `src/lib/inngest/jobs/` with:
- **Input schema** (Zod) — validates parameters
- **Output schema** (Zod) — validates return value
- **Cron trigger** — UTC schedule

Schemas are in `src/lib/inngest/events.ts` for strong typing across the orchestration layer.

## Handler Registration

The POST `/api/inngest` endpoint is configured in `src/app/api/inngest/route.ts`:

```typescript
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    k1DailyCalls,
    k2MonthlyCordis,
    alertsDaily,
    creditsMonthlyGrant,
    m4WeeklySummary,
  ],
});
```

When the app starts, Inngest SDK automatically:
1. Introspects all function schemas.
2. POSTs to Inngest cloud (if API key is present).
3. Receives scheduled triggers and webhook events.

## Local Development

### Without Inngest Cloud
Omit `INNGEST_API_KEY` and `INNGEST_SIGNING_KEY` — functions will log as "would execute" but won't actually run scheduled triggers.

### With Inngest DevServer (Optional)
For full local testing with real scheduling:

```bash
npm install -g inngest-cli
inngest dev
# In another terminal:
pnpm dev
```

This runs a local Inngest server that handles scheduling and retries.

## Testing a Job

### Via Inngest Dashboard
1. Go to your [Inngest dashboard](https://app.inngest.com) → Fabrika app.
2. Navigate to **Functions** → select a job (e.g., `k1-daily-calls`).
3. Click **Run** to trigger manually.
4. Observe logs in real-time.

### Via CLI (if using inngest-cli)
```bash
inngest run k1-daily-calls
```

## Monitoring & Alerts

Jobs are visible in the Inngest dashboard:
- **Runs tab** — execution history, timing, logs.
- **Failures tab** — retries, dead-letter queue, errors.
- **Analytics tab** — throughput, latency, success rate.

For production monitoring, configure Sentry integration:
- Inngest automatically posts errors to Sentry if `SENTRY_DSN` is set.

## Adding a New Job

1. Create a new file in `src/lib/inngest/jobs/<name>.ts`:

```typescript
import { inngest } from '../client';

export const myNewJob = inngest.createFunction(
  { id: 'my-new-job', triggers: [{ cron: '0 12 * * *' }] }, // noon daily
  async ({ step }) => {
    const result = await step.run('do-work', async () => {
      // Your async work here
      return { success: true, count: 42 };
    });
    return result;
  }
);
```

2. Add input/output schemas in `src/lib/inngest/events.ts`.
3. Export from `src/lib/inngest/jobs/index.ts`.
4. Add to `serve()` in `/api/inngest/route.ts`.

## Troubleshooting

**Jobs not running?**
- Check INNGEST_API_KEY is set (cloud mode) or run `inngest dev` (local mode).
- Verify cron syntax is UTC (0–23 hour, 0–6 day of week).

**"Failed to POST to Inngest"?**
- Check network connectivity to api.inngest.com.
- Verify API key is valid in Inngest dashboard.

**See logs but job doesn't execute?**
- Job output must match the schema in `events.ts` — runtime type mismatch will fail silently.

## Production Checklist

- [ ] `INNGEST_API_KEY` and `INNGEST_SIGNING_KEY` set in `.env.production`.
- [ ] All jobs scheduled via cron (no manual triggers in prod).
- [ ] Sentry DSN set for error reporting.
- [ ] Alerting configured in Inngest dashboard for failures.
- [ ] Database connection pooling adequate for concurrent job steps.

---

**References:**
- [Inngest Docs](https://docs.inngest.com)
- [Inngest Next.js SDK](https://docs.inngest.com/sdks/typescript)
- [Cron Trigger Format](https://docs.inngest.com/features/scheduled-functions)
