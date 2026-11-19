import { listAnnouncements } from '@/modules/m1/server/partner-search/http';
import { sessionCaller } from '@/modules/m1/server/partner-search/session';
import { ngGateResponse } from '@/lib/billing/nexagrant/route-gate';

/** Partner Search announcements of the signed-in tenant's plan (FO-61). Contract: src/core/contracts/partner-search.ts. */
export async function GET(req: Request) {
  const session = await sessionCaller();
  if (!session.ok) return session.response;
  // NG-250: the NexaGrant plan gate (partner_search, behind M1).
  const ngRefused = await ngGateResponse(
    { tenantId: session.caller.tenantId, role: session.caller.viewer.role },
    'view_partner_search', 'partner_search'
  );
  if (ngRefused) return ngRefused;
  return listAnnouncements(session.caller, req);
}
