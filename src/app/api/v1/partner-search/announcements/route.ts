import { authenticateApiKey } from '@/lib/api-auth';
import { apiKeyCaller, listAnnouncements } from '@/modules/m1/server/partner-search/http';

/** Partner REST API twin of GET /api/partner-search/announcements (FO-61). */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.authenticated) return auth.errorResponse;
  return listAnnouncements(apiKeyCaller(auth.data.tenantId), req);
}
