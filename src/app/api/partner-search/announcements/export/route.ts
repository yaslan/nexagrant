import { exportAnnouncements } from '@/modules/m1/server/partner-search/http';
import { sessionCaller } from '@/modules/m1/server/partner-search/session';

/** CSV/JSON export of Partner Search announcements, with source and CC BY 4.0 attribution (FO-61, Ultra). */
export async function GET(req: Request) {
  const session = await sessionCaller();
  if (!session.ok) return session.response;
  return exportAnnouncements(session.caller, req);
}
