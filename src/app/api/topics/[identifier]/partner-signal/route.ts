import { topicPartnerSignal } from '@/modules/m1/server/partner-search/http';
import { sessionCaller } from '@/modules/m1/server/partner-search/session';
import { ngGateResponse } from '@/lib/billing/nexagrant/route-gate';

/** Partner demand of one topic: requests, offers, by country and organisation type (FO-61). */
export async function GET(_req: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const session = await sessionCaller();
  if (!session.ok) return session.response;
  // NG-250 (review B1): the NexaGrant plan gate (partner_search, behind M1).
  const ngRefused = await ngGateResponse(
    { tenantId: session.caller.tenantId, role: session.caller.viewer.role },
    'view_partner_search', 'partner_search'
  );
  if (ngRefused) return ngRefused;
  return topicPartnerSignal(session.caller, (await params).identifier);
}
