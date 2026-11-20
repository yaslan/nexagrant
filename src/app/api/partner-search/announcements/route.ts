import { listAnnouncements } from '@/modules/m1/server/partner-search/http';
import { sessionCaller } from '@/modules/m1/server/partner-search/session';

/** Partner Search announcements of the signed-in tenant's plan (FO-61). Contract: src/core/contracts/partner-search.ts. */
export async function GET(req: Request) {
  const session = await sessionCaller();
  if (!session.ok) return session.response;
  return listAnnouncements(session.caller, req);
}
