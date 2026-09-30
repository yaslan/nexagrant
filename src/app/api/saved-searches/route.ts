import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { SavedSearchFiltersSchema } from '@/lib/saved-search-filters';
import type { SavedSearchRow } from '@/types/db-rows';

/**
 * `/calls`'daki "Aramayı Kaydet" düğmesi eskiden sadece 500ms bekleyip bir
 * toast gösteriyordu — hiçbir tabloya yazmıyordu (bkz.
 * docs/agent-results/TASK-MTRNQN0NNVBYM-blog-yazar.md). `alerts-daily.ts`
 * bu tablodan `notify: true` satırlarını okuyup günlük dijest gönderiyor;
 * satır hiç oluşmadığı için o cron'un sorgusu üretimde her zaman boş
 * dönüyordu. Bu route gerçek yazıcı.
 *
 * `filters` şeması `@/lib/saved-search-filters`'ta — bu rota ile cron'un
 * PAYLAŞTIĞI tek kaynak: sadece `/calls` arama state'inin karşılığı olan
 * `q`/`status`. Alan adları orada değişirse cron sessizce "filtresiz"
 * davranışa düşer. Şema kasıtlı olarak cron iş dosyasında DEĞİL: rota o
 * dosyayı import ettiğinde `resend` gibi yalnız cron'un gereksindiği
 * paketler bu rotanın derleme grafiğine giriyordu (TASK-MTS9W0C1VC9OS).
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
    return internalError({ success: false, error: 'İç Sunucu Hatası' });
  }
}

export async function POST(req: Request) {
  const scope = await requireTenantApi({ write: true });
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
    return internalError({ success: false, error: 'İç Sunucu Hatası' });
  }
}
