import { getTranslations } from 'next-intl/server';

/**
 * NG-9: every legal page says, at the top, that its text is a draft awaiting legal
 * approval. It goes away page by page when legal signs off (NG-29 publish gate),
 * not by editing the copy.
 */
export default async function LegalDraftNotice({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'legal.draft' });
  return (
    <p
      role="note"
      data-testid="legal-draft-notice"
      className="mb-6 inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-ink/30 bg-amber/15 px-3 py-2 text-sm text-amber-ink"
    >
      <span className="font-semibold">{t('badge')}</span>
      <span>{t('body')}</span>
    </p>
  );
}
