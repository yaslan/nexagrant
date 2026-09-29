/**
 * FB KAMU B4 (TASK-MULRRNIHVZM1Z) — the co-brand logo, served same-origin.
 *
 * No id in the URL: the session's tenant decides which logo it may see (its
 * own, as an agency, or its agency's). The bytes were checked and rebuilt as a
 * PNG at upload (src/lib/agency/cobrand.ts); the headers make sure a browser
 * treats them as an image and nothing else, even if opened directly.
 */
import { NextResponse } from 'next/server';
import { requireTenantApi } from '@/lib/tenant';
import { logoKeyVisibleTo } from '@/lib/agency/cobrand-store';
import { getObjectBytes } from '@/lib/storage';

export async function GET() {
  const result = await requireTenantApi();
  if (!result.ok) return result.response;

  const key = await logoKeyVisibleTo(result.scope.tenantId);
  const bytes = key ? await getObjectBytes(key) : null;
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline; filename="logo.png"',
      // Per session: another tenant's response must never be served from a shared cache.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
