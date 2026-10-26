import { listOrganizationAnnouncements } from '@/modules/m1/server/partner-search/http';
import { sessionCaller } from '@/modules/m1/server/partner-search/session';

/** Partner Search announcements of one organisation, by CORDIS PIC (FO-61). */
export async function GET(req: Request, { params }: { params: Promise<{ pic: string }> }) {
  const session = await sessionCaller();
  if (!session.ok) return session.response;
  return listOrganizationAnnouncements(session.caller, req, (await params).pic);
}
