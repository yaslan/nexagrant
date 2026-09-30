import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@/lib/brand';
import { withSystemScope } from '@/lib/system-scope';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { addBudgetLineByToken } from '@/modules/m11/server/actions';
import { getTranslations } from 'next-intl/server';
import { errorMessage } from '@/lib/errors';
import { hashSecretToken, secretTokenMatches } from '@/lib/secret-token';
import { getPilotState } from '@/lib/billing/pilot';
import type { PartContent } from '@/modules/m11/types';

interface PageProps {
  params: Promise<{
    token: string;
    locale: string;
  }>;
}

/**
 * The ApplicationPart the magic-token portal resolves. The token in the URL is
 * the only credential here, so this is the one place a part is read without a
 * session — see the comment in src/modules/m11/server/actions.ts.
 *
 * Only SHA-256(token) is stored (TASK-MULQLL2T8ZJX4, src/lib/secret-token.ts):
 * the row is found by the hash of the URL's token and then re-checked in
 * constant time. A link from before the hash migration still resolves, because
 * the migration hashed the stored token in place.
 */
interface PartnerPortalPart {
  id: string;
  tenantId: string;
  part: string;
  content: PartContent | null;
  opportunity: { title: string } | null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'partner_portal' });

  let part: PartnerPortalPart | null = null;
  try {
    const rawPart = await withSystemScope('tenant-discovery', 'partner-portal.partByToken', (tx) =>
      tx.applicationPart.findUnique({
        where: { magicTokenHash: hashSecretToken(token) },
        // The hash is compared here and never rendered; nothing on this page
        // is a client component (TASK-MUMT3KVHJTYX0).
        select: {
          id: true,
          tenantId: true,
          part: true,
          content: true,
          magicTokenHash: true,
          opportunity: { select: { title: true } },
        },
      })
    );
    part = secretTokenMatches(token, rawPart?.magicTokenHash)
      ? (rawPart as unknown as PartnerPortalPart)
      : null;
  } catch {
    return {
      title: t('title'),
      description: t('intro'),
    };
  }

  const opp = part?.opportunity;
  const projectTitle = opp?.title || 'Partner Portal';

  return {
    title: `${t('title')} — ${projectTitle}`,
    description: t('intro'),
    alternates: { canonical: `/${locale}/portal/partner/${token}` },
    openGraph: {
      title: `${t('title')} — ${projectTitle}`,
      description: t('intro'),
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/portal/partner/${token}`,
    },
  };
}

export default async function PartnerPortalPage({ params }: PageProps) {
  const { token, locale } = await params;
  const t = await getTranslations('partner_portal');

  if (!token) return notFound();

  let part: PartnerPortalPart | null = null;
  try {
    const rawPart = await withSystemScope('tenant-discovery', 'partner-portal.partByToken', (tx) =>
      tx.applicationPart.findUnique({
        where: { magicTokenHash: hashSecretToken(token) },
        // The hash is compared here and never rendered; nothing on this page
        // is a client component (TASK-MUMT3KVHJTYX0).
        select: {
          id: true,
          tenantId: true,
          part: true,
          content: true,
          magicTokenHash: true,
          opportunity: { select: { title: true } },
        },
      })
    );
    part = secretTokenMatches(token, rawPart?.magicTokenHash)
      ? (rawPart as unknown as PartnerPortalPart)
      : null;
  } catch (e) {
    console.warn(`[PartnerPortalPage] DB query failed: ${errorMessage(e)}`);
    return notFound();
  }

  if (!part || part.part !== 'PART_A') return notFound();

  const opp = part.opportunity;

  // `addBudgetLineByToken` refuses a write once the token's tenant's free pilot
  // has ended, and this form used to drop that refusal: the partner saw nothing
  // and kept resubmitting (İNCELEME-24 B-3). The page says so up front and
  // closes the form; the action stays the gate.
  let pilotExpired = false;
  try {
    pilotExpired = (await getPilotState(part.tenantId)).kind === 'expired';
  } catch (e) {
    console.warn(`[PartnerPortalPage] pilot state read failed: ${errorMessage(e)}`);
  }
  const tCommon = await getTranslations('Common');

  return (
    <div className="min-h-screen bg-ground flex flex-col items-center pt-16 pb-20 px-edge sm:px-4 font-sans">
      <div className="w-full max-w-2xl bg-surface shadow-md rounded-2xl p-8 border border-border">
        <div className="mb-8 text-center border-b pb-6">
          <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-full uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-2xl font-bold text-ink mt-3 font-heading">{t('title')}</h1>
          <p className="text-muted text-sm mt-1">{t('subtitle')}: <strong className="text-ink">{opp?.title}</strong></p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50/80 text-blue-900 p-4 rounded-xl text-xs border border-blue-200 leading-relaxed">
            {t('intro')}
          </div>

          {pilotExpired && (
            <p role="alert" className="bg-bad/10 border border-bad/30 rounded-xl p-4 text-sm font-semibold text-bad">
              {tCommon('pilotExpired')}
            </p>
          )}

          <form action={async (fd) => {
            'use server';
            const result = await addBudgetLineByToken(
              token,
              fd.get('partnerName') as string,
              parseInt(fd.get('pm') as string, 10)
            );
            // A refused write re-renders the page, so a pilot that ended while
            // it was open shows the notice above instead of nothing.
            if (!result.success) revalidatePath(`/${locale}/portal/partner/${token}`);
          }} className="space-y-4">
            <fieldset disabled={pilotExpired} className="space-y-4 disabled:opacity-60">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">{t('partner_name_label')}</label>
                <input type="text" name="partnerName" placeholder={t('partner_name_placeholder')} required className="w-full border border-border p-3 rounded-lg text-sm shadow-xs focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">{t('effort_label')}</label>
                <input type="number" name="pm" placeholder={t('effort_placeholder')} required className="w-full border border-border p-3 rounded-lg text-sm shadow-xs focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow-sm hover:bg-blue-700 transition text-sm">
                {t('submit_button')}
              </button>
            </fieldset>
          </form>

          <div className="mt-8">
            <h3 className="font-semibold text-sm text-ink mb-3">{t('budget_table_title')}</h3>
            <div className="border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-ground border-b text-ink-2 font-semibold">
                  <tr>
                    <th className="p-3">{t('table_partner')}</th>
                    <th className="p-3">{t('table_pm')}</th>
                    <th className="p-3 text-right">{t('table_grant')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(part.content?.budget || []).map((b, idx: number) => (
                    <tr key={idx} className="bg-surface hover:bg-ground">
                      <td className="p-3 font-bold text-ink">{b.partnerName}</td>
                      <td className="p-3 font-mono text-ink-2">{b.personMonths} PM</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">€{Number(b.requestedTotal).toLocaleString(locale)}</td>
                    </tr>
                  ))}
                  {((part.content)?.budget || []).length === 0 && (
                    <tr className="bg-surface">
                      <td colSpan={3} className="p-4 text-center text-muted">{t('no_entries')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-6 text-muted text-xs font-mono">{t('footer', { brand: PRODUCT_NAME })}</p>
    </div>
  );
}
