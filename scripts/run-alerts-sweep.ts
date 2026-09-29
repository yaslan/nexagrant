/**
 * Manual trigger for the alert sweeper (`pnpm jobs:alerts-sweep`).
 *
 * Runs the exact code the scheduled job runs at 04:15 UTC, so the pile of
 * tenant-orphaned SystemAlert rows (TASK-MTVFJTNW6OW11) can be cleared or
 * inspected without waiting for the schedule.
 *
 *   pnpm jobs:alerts-sweep
 */
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/lib/db';
import { sweepOrphanTenantAlerts, type AlertsSweepDb } from '../src/lib/jobs/tasks/alerts-sweep';

async function main() {
  console.log(`[jobs:alerts-sweep] start ${new Date().toISOString()}`);
  const result = await sweepOrphanTenantAlerts(prisma as unknown as AlertsSweepDb);
  console.log(`[jobs:alerts-sweep] ${JSON.stringify(result, null, 2)}`);
  if (!result.success) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[jobs:alerts-sweep] FAILED', e);
    process.exit(1);
  });
