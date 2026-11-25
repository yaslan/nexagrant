import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import { getWorkspaceRoute } from '@/lib/routes';
import { publicLeadRetentionMonths } from '@/lib/leads/public-lead-policy';
import { EXPERT_PREREG_RETENTION_DAYS } from '@/lib/expert-prereg/server/constants';
import { INVITATION_RETENTION_DAYS } from '@/lib/invitations/retention';
import { NOTIFICATION_RETENTION_DAYS } from '@/lib/notifications/retention';
import CookiePreferencesButton from '@/components/CookiePreferencesButton';
import { PRIVACY_LISTS, PRIVACY_TABLES, type PrivacyTableSection } from './structure';
import LegalDraftNotice from '@/components/LegalDraftNotice';

/**
 * Legal pages get shared publicly, so they carry their own title, description
 * and Open Graph tags per locale instead of falling back to the app-wide
 * defaults. Copy lives in messages/{tr,en}.json under `legal.privacy`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });

  return {
    title,
    description,
    alternates: { canonical: `/${locale}/privacy` },
    openGraph: {
      title,
      description,
      type: 'article',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}/privacy`,
    },
    twitter: { card: 'summary', title, description },
  };
}

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Values the retention rows state, read from the constants the purge jobs use. */
const RETENTION_VALUES = {
  leads: { months: publicLeadRetentionMonths() },
  expertPrereg: { months: publicLeadRetentionMonths(EXPERT_PREREG_RETENTION_DAYS) },
  teamInvites: { days: INVITATION_RETENTION_DAYS },
  notifications: { days: NOTIFICATION_RETENTION_DAYS },
} as const;

const brand = { brand: PRODUCT_NAME };

function cellValues(section: PrivacyTableSection, row: string) {
  if (section === 's6' && row in RETENTION_VALUES) {
    return RETENTION_VALUES[row as keyof typeof RETENTION_VALUES];
  }
  return brand;
}

function PrivacyTable({ t, section }: { t: Translate; section: PrivacyTableSection }) {
  const { columns, cells, rows } = PRIVACY_TABLES[section];
  return (
    <div className="overflow-x-auto my-4 min-w-0">
      <table className="w-full text-sm border border-border rounded-lg">
        <thead className="bg-ground">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="text-left font-semibold text-ink px-3 py-2 border-b border-border">
                {t(`${section}.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="border-b border-border last:border-0">
              {cells.map((cell, index) => {
                const text = t(`${section}.rows.${row}.${cell}`, cellValues(section, row));
                return index === 0 ? (
                  <th key={cell} scope="row" className="px-3 py-2 align-top text-left font-medium text-ink [overflow-wrap:break-word]">
                    {text}
                  </th>
                ) : (
                  <td key={cell} className="px-3 py-2 align-top text-ink-2 [overflow-wrap:anywhere]">
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-ink mb-2">{heading}</h2>
      {children}
    </section>
  );
}

export default async function PrivacyPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });

  // CLAUDE.md §8 — every word below comes from `legal.privacy`; the nine-section
  // layout follows the owner's KVKK template (FO-170) and ./structure.ts says
  // which rows and items each section carries.
  const list = (prefix: string, ids: readonly string[], ordered = false) => {
    const Tag = ordered ? 'ol' : 'ul';
    return (
      <Tag className={`${ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1 [overflow-wrap:anywhere]`}>
        {ids.map((id) => (
          <li key={id}>{t(`${prefix}.${id}`, brand)}</li>
        ))}
      </Tag>
    );
  };

  return (
    <main id="main" className="flex-1">
      <div className="max-w-4xl mx-edge sm:mx-auto py-12 px-4 sm:px-6 bg-surface border rounded-xl my-8 min-w-0">
        <LegalDraftNotice locale={locale} />
        <h1 className="text-3xl font-bold font-heading mb-6 text-ink">{t('heading')}</h1>

        <div className="text-ink-2 space-y-8 leading-relaxed">
          <Section heading={t('s1.heading')}>
            <p>{t('s1.body', brand)}</p>
            <PrivacyTable t={t} section="s1" />
          </Section>

          <Section heading={t('s2.heading')}>
            <p>{t('s2.body')}</p>
            <PrivacyTable t={t} section="s2" />
            <p>{t('s2.note')}</p>
          </Section>

          <Section heading={t('s3.heading')}>
            <p>{t('s3.body')}</p>
            <PrivacyTable t={t} section="s3" />
          </Section>

          <Section heading={t('s4.heading')}>
            <p className="mb-2">{t('s4.body')}</p>
            {list('s4.items', PRIVACY_LISTS.s4)}
          </Section>

          <Section heading={t('s5.heading')}>
            <p>{t('s5.body')}</p>
            <h3 className="font-semibold text-ink mt-4 mb-2">{t('s5.domesticHeading')}</h3>
            {list('s5.domestic', PRIVACY_LISTS.s5domestic)}
            <h3 className="font-semibold text-ink mt-4 mb-2">{t('s5.abroadHeading')}</h3>
            <p>{t('s5.abroadBody')}</p>
            <PrivacyTable t={t} section="s5" />
            <p>{t('s5.safeguards')}</p>
            <p className="mt-3">{t('s5.ownTransfer', brand)}</p>
          </Section>

          <Section heading={t('s6.heading')}>
            <p>{t('s6.body')}</p>
            <PrivacyTable t={t} section="s6" />
            <p>{t('s6.disposal')}</p>
            <h3 className="font-semibold text-ink mt-4 mb-2">{t('s6.securityHeading')}</h3>
            <p>{t('s6.securityBody')}</p>
          </Section>

          <Section heading={t('s7.heading')}>
            <p>{t('s7.body')}</p>
            <PrivacyTable t={t} section="s7" />
            <p>{t('s7.withdraw')}</p>
            <p className="mt-2">
              <CookiePreferencesButton className="text-accent underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded" />
            </p>
          </Section>

          <Section heading={t('s8.heading')}>
            <p className="mb-2">{t('s8.body', brand)}</p>
            {list('s8.rights', PRIVACY_LISTS.s8rights, true)}
            <p className="mt-3">{t('s8.exportNote')}</p>
            <p className="mt-2">
              <Link href={getWorkspaceRoute('settingsPrivacy', locale, 'default')} className="text-accent underline hover:no-underline">
                {t('s8.rightsLink')}
              </Link>
            </p>
            <h3 className="font-semibold text-ink mt-4 mb-2">{t('s8.howHeading')}</h3>
            <p className="mb-2">{t('s8.howBody')}</p>
            {list('s8.channels', PRIVACY_LISTS.s8channels)}
            <p className="mt-3">{t('s8.response')}</p>
            <p className="mt-3">{t('s8.complaint')}</p>
          </Section>

          <Section heading={t('s9.heading')}>
            <p className="mb-2">{t('s9.body')}</p>
            {list('s9.consents', PRIVACY_LISTS.s9consents)}
            <p className="mt-3">{t('s9.withdraw')}</p>
            <p className="mt-3">{t('s9.effective')}</p>
          </Section>
        </div>
      </div>
    </main>
  );
}
