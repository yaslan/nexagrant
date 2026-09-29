import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import type { SavedSearchRow } from '@/types/db-rows';

const UpdateSavedSearchSchema = z.object({
  notify: z.boolean(),
});

/** Toggles the `notify` flag on one of the caller's own saved searches. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireTenantApi({ write: true });
  if (!scope.ok) return scope.response;
  const { tenantId, userId } = scope.scope;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  }

  const parsed = UpdateSavedSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Geçersiz alanlar.', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await withTenant<SavedSearchRow[]>(tenantId, async (tx) => {
      const result = await tx.savedSearch.updateMany({
        where: { id, tenantId, userId },
        data: { notify: parsed.data.notify },
      });
      if (result.count === 0) return [];
      return tx.savedSearch.findMany({ where: { id, tenantId, userId } });
    });

    if (updated.length === 0) {
      return NextResponse.json({ success: false, error: 'Kayıtlı arama bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, search: updated[0] });
  } catch (error) {
    console.error('[saved-searches][PATCH]', error);
    return NextResponse.json({ success: false, error: 'İç Sunucu Hatası' }, { status: 500 });
  }
}

/** Deletes one of the caller's own saved searches. Scoped by tenantId + userId, not id alone. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireTenantApi({ write: true });
  if (!scope.ok) return scope.response;
  const { tenantId, userId } = scope.scope;
  const { id } = await params;

  try {
    const result = await withTenant<{ count: number }>(tenantId, (tx) =>
      tx.savedSearch.deleteMany({ where: { id, tenantId, userId } })
    );

    if (result.count === 0) {
      return NextResponse.json({ success: false, error: 'Kayıtlı arama bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[saved-searches][DELETE]', error);
    return NextResponse.json({ success: false, error: 'İç Sunucu Hatası' }, { status: 500 });
  }
}
