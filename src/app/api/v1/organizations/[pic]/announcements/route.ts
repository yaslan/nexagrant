import { authenticateApiKey } from '@/lib/api-auth';
import { apiKeyCaller, listOrganizationAnnouncements } from '@/modules/m1/server/partner-search/http';

/** Partner REST API twin of GET /api/organizations/:pic/announcements (FO-61). */
export async function GET(req: Request, { params }: { params: Promise<{ pic: string }> }) {
  const auth = await authenticateApiKey(req, { action: 'view_partner_search', feature: 'partner_search' });
  if (!auth.authenticated) return auth.errorResponse;
  return listOrganizationAnnouncements(apiKeyCaller(auth.data.tenantId), req, (await params).pic);
}
