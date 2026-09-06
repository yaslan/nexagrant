import { Inngest } from 'inngest';
import { env } from '@/lib/env';

export const inngest = new Inngest({
  id: 'fabrika-app',
  apiKey: env.INNGEST_API_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
});
