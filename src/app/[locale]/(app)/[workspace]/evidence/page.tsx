import EvidenceClient, { type EvidenceItemData } from './evidence-client';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import { requireTenantPage } from '@/lib/tenant';
import { loadEvidenceItems } from './data';

/**
 * The Evidence Pack (M3).
 *
 * The tenant used to come in as `session?.tenantId` and go into
 * `where: tenantId ? { tenantId } : {}` — a tenantless session read the whole
 * Evidence table across tenants (TASK-MTUGJTD5HZDW0). Resolution now goes
 * through `requireTenantPage`, which never returns without a tenant, and the
 * read itself lives in `./data.ts`, where `tenantId` is a required `string`
 * re-checked before Prisma is touched.
 */
export default async function EvidencePage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { locale } = await params;
  const locked = await moduleGate('M3', locale);
  if (locked) return locked;

  // Redirects an anonymous visitor to login and a signed-in user with no
  // membership to /no-workspace. It cannot hand back a null or empty tenant.
  const { tenantId } = await requireTenantPage(locale);

  let evidence: EvidenceItemData[] = [];
  try {
    evidence = await loadEvidenceItems(tenantId);
  } catch (e) {
    // Kept so an offline or unseeded database renders an empty pack instead of
    // a crash. The failure mode is now "no rows", never "other tenants' rows".
    console.warn(`[Evidence] DB query bypassed: ${errorMessage(e)}`);
  }

  const isTr = locale === 'tr';

  return (
    <div className="max-w-5xl mx-auto py-8 sm:px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-heading text-ink">
          {isTr ? 'Kanıt & Yetkinlik Deposu (Evidence Pack)' : 'Evidence Pack'}
        </h1>
        <p className="text-muted text-xs sm:text-sm mt-2 max-w-3xl leading-relaxed">
          {isTr
            ? "Kuruluşunuzun temel yetkinliklerini, sertifikalarını, mali raporlarını ve geçmiş proje başarılarını tek bir merkezde toplayın. Doğrulanmış belgeleri yükleyerek AB teklif yazımında doğrudan kanıt belgesi olarak kullanın."
            : "Centralize your organization's core capabilities, certificates, and past results. Upload valid documents (Cloudflare R2) and use them directly when generating proposals."}
        </p>
      </div>

      <EvidenceClient initialData={evidence} locale={locale} />
    </div>
  );
}
