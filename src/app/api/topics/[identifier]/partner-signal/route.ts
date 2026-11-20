import { topicPartnerSignal } from '@/modules/m1/server/partner-search/http';
import { sessionCaller } from '@/modules/m1/server/partner-search/session';

/** Partner demand of one topic: requests, offers, by country and organisation type (FO-61). */
export async function GET(_req: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const session = await sessionCaller();
  if (!session.ok) return session.response;
  return topicPartnerSignal(session.caller, (await params).identifier);
}
