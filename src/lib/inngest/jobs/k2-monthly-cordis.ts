import { inngest } from '../client';
import { env } from '@/lib/env';
import { K2MonthlyCordisOutputSchema, type K2MonthlyCordisOutput } from '../events';

/**
 * K2 Monthly CORDIS Sync — 1st of month, 4 AM UTC
 * Triggers Python worker to fetch and process CORDIS datasets
 * Worker handles DuckDB transformation and database upsert
 */
export const k2MonthlyCordis = inngest.createFunction(
  { id: 'k2-monthly-cordis', triggers: [{ cron: '0 4 1 * *' }] },
  async ({ step }): Promise<K2MonthlyCordisOutput> => {
    const result = await step.run('trigger-cordis-worker', async () => {
      const workerUrl = env.WORKER_URL || 'http://localhost:8000';
      const workerToken = env.WORKER_TOKEN || '';

      try {
        const response = await fetch(`${workerUrl}/jobs/cordis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${workerToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const output: K2MonthlyCordisOutput = {
            success: false,
            message: `Worker responded with status ${response.status}`,
            statusCode: response.status,
            error: `HTTP ${response.status}`,
          };
          return K2MonthlyCordisOutputSchema.parse(output);
        }

        const data = await response.json();
        const output: K2MonthlyCordisOutput = {
          success: true,
          message: 'CORDIS pipeline triggered successfully',
          workerResponse: data,
        };
        return K2MonthlyCordisOutputSchema.parse(output);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to trigger CORDIS worker';
        const output: K2MonthlyCordisOutput = {
          success: false,
          message: msg,
          error: msg,
        };
        return K2MonthlyCordisOutputSchema.parse(output);
      }
    });

    return result;
  }
);
