import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { SavedSearchFiltersSchema } from '@/lib/inngest/jobs/alerts-daily';
import type { SavedSearchRow } from '@/types/db-rows';

/**
 * `/calls`'daki "Aramayı Kaydet" düğmesi eskiden sadece 500ms bekleyip bir
 * toast gösteriyordu — hiçbir tabloya yazmıyordu (bkz.
 * docs/agent-results/TASK-MTRNQN0NNVBYM-blog-yazar.md). `alerts-daily.ts`
 * bu tablodan `notify: true` satırlarını okuyup günlük dijest gönderiyor;
 * satır hiç oluşmadığı için o cron'un sorgusu üretimde her zaman boş
 * dönüyordu. Bu route gerçek yazıcı.
 *
 * `filters` şekli `alerts-daily.ts`'in `SavedSearchFiltersSchema`'sıyla
 * (tek kaynak, buradan import) aynı: sadece `/calls` arama state'inin
 * karşılığı olan `q`/`status`. Alan adları burada değişirse cron sessizce
 * "filtresiz" davranışa düşer — bkz. o dosyadaki uyarı.
 *
 * Liste ve silme kullanıcıya özel: `tenantId` + `userId` ile daraltılır,
 * "kayıtlı aramalarım" bir kurum içindeki başka bir üyenin aramasını
 * göstermez/silmez. `alerts-daily.ts`in günlük dijest sorgusu bundan
 * bağımsız — tüm kiracı genelinde `notify: true` olan her satırı okur.
 */

const CreateSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  filters: SavedSearchFiltersSchema,
  notify: z.boolean().optional().default(true),
});

export async function GET() {
  const scope = await requireTenantApi();
  if (!scope.ok) return scope.response;
  const { tenantId, userId } = scope.scope;

  try {
    const searches = await withTenant<SavedSearchRow[]>(tenantId, (tx) =>
      tx.savedSearch.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
      })
    );

    return NextResponse.json({ success: true, searches });
  } catch (error) {
    console.error('[saved-searches][GET]', error);
    return NextResponse.json({ success: false, error: 'İç Sunucu Hatası' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const scope = await requireTenantApi();
  if (!scope.ok) return scope.response;
  const { tenantId, userId } = scope.scope;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  }

  const parsed = CreateSavedSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Geçersiz alanlar.', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const created = await withTenant<SavedSearchRow>(tenantId, (tx) =>
      tx.savedSearch.create({
        data: {
          tenantId,
          userId,
          name: parsed.data.name,
          filters: parsed.data.filters,
          notify: parsed.data.notify,
        },
      })
    );

    return NextResponse.json({ success: true, search: created }, { status: 201 });
  } catch (error) {
    console.error('[saved-searches][POST]', error);
    return NextResponse.json({ success: false, error: 'İç Sunucu Hatası' }, { status: 500 });
  }
}
