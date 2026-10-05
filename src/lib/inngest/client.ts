import { Inngest } from 'inngest';

/**
 * Inngest client singleton for Fabrika
 * Manages job orchestration and scheduling
 *
 * Environment variables:
 * - INNGEST_API_KEY: API key for Inngest cloud (optional in development)
 * - INNGEST_SIGNING_KEY: Signing key for webhook validation (optional in development)
 */
export const inngest = new Inngest({
  id: 'fabrika-app',
  apiKey: process.env.INNGEST_API_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
