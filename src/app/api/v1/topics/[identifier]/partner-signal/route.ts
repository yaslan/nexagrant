import { authenticateApiKey } from '@/lib/api-auth';
import { apiKeyCaller, topicPartnerSignal } from '@/modules/m1/server/partner-search/http';

/** Partner REST API twin of GET /api/topics/:identifier/partner-signal (FO-61). */
export async function GET(req: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.authenticated) return auth.errorResponse;
  return topicPartnerSignal(apiKeyCaller(auth.data.tenantId), (await params).identifier);
}
