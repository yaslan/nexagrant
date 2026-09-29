import { appUrlProblem, CANONICAL_APP_URL, type AppUrlProblem } from '@/lib/app-url';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * Says out loud, once at server start, that production has no usable
 * NEXT_PUBLIC_APP_URL (TASK-MUN3OAFIVW9NA): a console error plus one open
 * SystemAlert, the same channel `invitationMailBaseUrl`'s null already uses
 * (dedupe key per problem, so a restart loop folds into one row). Never
 * throws and never stops the server — the links fall back to
 * CANONICAL_APP_URL, but Google Calendar connect and invitation mails stay off
 * (`appBaseUrl()` is null for every problem named here).
 */
export async function reportAppUrlProblem(
  source?: Parameters<typeof appUrlProblem>[0],
  record: typeof recordAlert = recordAlert
): Promise<AppUrlProblem | null> {
  const problem = appUrlProblem(source);
  if (!problem) return null;
  const message = `NEXT_PUBLIC_APP_URL is ${DESCRIBE[problem]} in production: set it to ${CANONICAL_APP_URL}`;
  console.error(`[app-url] ${message}`);
  await record({ level: 'error', source: 'app-url', message, meta: { problem }, dedupeKey: `app-url:${problem}` });
  return problem;
}

const DESCRIBE: Record<AppUrlProblem, string> = {
  unset: 'unset',
  invalid: 'not a bare origin URL (no path, query or fragment)',
  loopback: 'a loopback (localhost) address',
  insecure: 'an http:// URL',
};
