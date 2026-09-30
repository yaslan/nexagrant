/**
 * B-2 (TASK-MUNODY0DVDWC5) — the one way an evidence file is read.
 *
 * Evidence used to be linked from a public host (`R2_PUBLIC_HOST`), so anyone
 * holding the URL read the file, CONFIDENTIAL ones included, and the URL went
 * into the CSV export. Now only a signed-in member of the tenant that owns the
 * row gets it: the tenant is the session's, the row is read by (id, tenantId)
 * under `withTenant` (RLS), and the key must lie under that tenant's prefix.
 * Another tenant's id is a 404, not a 403, so ids cannot be probed.
 *
 * With an object store the answer is a redirect to a presigned GET that lives
 * five minutes and always downloads (`Content-Disposition: attachment`), so no
 * stored file is ever rendered as a page. Without one (development) the dev
 * store's bytes are served here, with the same attachment rule.
 */
import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { getObjectBytes, getPresignedDownloadUrl, hasObjectStore, tenantObjectKeyOf } from '@/lib/storage';
import { isPresentId } from '@/lib/required-id';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantApi();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.scope;

  const { id } = await params;
  if (!isPresentId(id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

  const row = await withTenant(tenantId, (tx) =>
    tx.evidence.findFirst({ where: { id, tenantId }, select: { r2ObjectKey: true, fileName: true } })
  );
  const key = row?.r2ObjectKey ? tenantObjectKeyOf(tenantId, row.r2ObjectKey) : null;
  if (!row || !key) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

  const fileName = row.fileName || key.split('/').pop() || 'evidence';

  if (hasObjectStore) {
    const url = await getPresignedDownloadUrl(key, fileName);
    if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  }

  const bytes = await getObjectBytes(key);
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'evidence';
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
