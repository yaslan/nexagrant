import { inngest } from '../client';

/**
 * K2 Monthly CORDIS Sync — 1st of month, 4 AM UTC
 * Triggers Python worker to fetch and process CORDIS datasets
 * Worker handles DuckDB transformation and database upsert
 */
export const k2MonthlyCordis = inngest.createFunction(
  { id: 'k2-monthly-cordis', triggers: [{ cron: '0 4 1 * *' }] },
  async ({ step }: any) => {
    const result = await step.run('trigger-cordis-worker', async () => {
      const workerUrl = process.env.WORKER_URL || 'http://localhost:8000';
      const workerToken = process.env.WORKER_TOKEN || '';

      try {
        const response = await fetch(`${workerUrl}/jobs/cordis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${workerToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Worker responded with status ${response.status}`,
            statusCode: response.status,
          };
        }

        const data = await response.json();
        return {
          success: true,
          message: 'CORDIS pipeline triggered successfully',
          workerResponse: data,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to trigger CORDIS worker',
        };
      }
    });

    return result;
  }
);
