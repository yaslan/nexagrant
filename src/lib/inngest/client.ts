import { Inngest } from 'inngest';
import { env, INNGEST_BUILT_FOR_PRODUCTION } from '@/lib/env';

export const inngest = new Inngest({
  id: 'fabrika-app',
  apiKey: env.INNGEST_API_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  /**
   * A production build is always in cloud mode, so every request to
   * /api/inngest must carry a valid signature. The SDK reads INNGEST_DEV before
   * anything else and, in dev mode, skips signature checks entirely; an
   * INNGEST_DEV=1 left in a production `.env` would make the endpoint an open
   * "run any job" URL (TASK-MUM6CYJFKW69I B-1). `undefined` keeps the SDK's own
   * INNGEST_DEV lookup for `next dev` and tests. The server also refuses to
   * start in that state: see assertInngestDevModeAllowed in src/lib/env.ts.
   */
  isDev: INNGEST_BUILT_FOR_PRODUCTION ? false : undefined,
});
