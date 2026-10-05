import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  k1DailyCalls,
  k2MonthlyCordis,
  alertsDaily,
  creditsMonthlyGrant,
  m4WeeklySummary,
} from '@/lib/inngest/jobs';

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
