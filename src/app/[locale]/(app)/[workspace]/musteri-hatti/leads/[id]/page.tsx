import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { moduleGate } from '@/lib/modules/guard';
import { formatMoney } from '@/lib/money';
import { asRole, can } from '@/lib/rbac';
import { getLead } from '@/modules/m18/server/leads-repo';
import { SectionNav } from '../../_components/section-nav';
import { DealCreateForm, StageSelect } from '../../_components/client-forms';
import { LiveNoticeProvider } from '../../_components/live-notice';
import { eligibilityCallChoices, listEligibilityReports } from '@/modules/m18/server/eligibility';
import { aiCreditEntry } from '@/lib/billing/catalog';
import { ApproveReportButton, EligibilityForm, EnrichmentPanel, PreAssessmentLabel } from '../../_components/ai-panels';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const locked = await moduleGate('M18', locale);
  if (locked) return locked;
  const { tenantId, role } = await requireTenantPageRole(locale, 'client_pipeline_read');
  const canWrite = can(asRole(role), 'client_pipeline_write');
  const t = await getTranslations({ locale, namespace: 'm18' });
  const back = `/${locale}/${workspace}/musteri-hatti/leads`;

  const [lead, reports, calls] = await withTenant(tenantId, (tx) =>
    Promise.all([
      getLead(tx, tenantId, id),
      listEligibilityReports(tx, tenantId, id),
      eligibilityCallChoices(tx, tenantId, id),
    ]),
  );
  const tAi = await getTranslations({ locale, namespace: 'm18.ai' });
  if (!lead) {
    return (
      <main className="space-y-4 p-6">
        <SectionNav locale={locale} workspace={workspace} active="leads" />
        <p role="alert">{t('lead.notFound')}</p>
        <Link href={back} className="text-sky-800 underline">{t('lead.backToList')}</Link>
      </main>
    );
  }

  return (
    <LiveNoticeProvider>
      <main className="space-y-6 p-6">
        <SectionNav locale={locale} workspace={workspace} active="leads" />
        <Link href={back} className="text-sm text-sky-800 underline">{t('lead.backToList')}</Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{lead.name}</h1>
          <p className="text-sm text-slate-600">{t(`lifecycle.${lead.lifecycle}`)}</p>
          {lead.legalName ? (
            <p className="text-sm">
              <span className="text-slate-600">{t('lead.legalName')}</span> {lead.legalName}
            </p>
          ) : null}
          {lead.website ? (
            <a href={lead.website} rel="noopener noreferrer" className="text-sm text-sky-800 underline">{lead.website}</a>
          ) : null}
        </header>

        <section aria-labelledby="contacts-heading" className="space-y-2">
          <h2 id="contacts-heading" className="text-lg font-semibold">{t('lead.contactsHeading')}</h2>
          {lead.contacts.length === 0 ? (
            <p className="text-slate-600">{t('lead.noContacts')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lead.contacts.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.fullName}</span>{' '}
                  <span className="text-slate-600">{[c.title, c.email].filter(Boolean).join(', ')}</span>
                  {c.doNotContact ? <span className="ml-2 text-red-700">{t('lead.doNotContact')}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="deals-heading" className="space-y-2">
          <h2 id="deals-heading" className="text-lg font-semibold">{t('lead.dealsHeading')}</h2>
          {lead.deals.length === 0 ? (
            <p className="text-slate-600">{t('lead.noDeals')}</p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm">
              {lead.deals.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="font-medium">{d.title}</span>
                  <span className="tabular-nums">
                    {d.estimatedFeeCents != null ? formatMoney(d.estimatedFeeCents, d.currency, locale) : '—'}
                  </span>
                  {canWrite ? <StageSelect dealId={d.id} stage={d.stage} /> : <span>{t(`stage.${d.stage}`)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canWrite ? <DealCreateForm organizationId={lead.id} /> : null}

        {canWrite ? (
          <section aria-labelledby="enrich-heading" className="space-y-2">
            <h2 id="enrich-heading" className="text-lg font-semibold">{tAi('enrichHeading')}</h2>
            <EnrichmentPanel
              organizationId={lead.id}
              hasWebsite={Boolean(lead.website)}
              credits={aiCreditEntry('M18', 'enrich-organization')?.credits ?? 0}
            />
          </section>
        ) : null}

        <section aria-labelledby="eligibility-heading" className="space-y-3">
          <h2 id="eligibility-heading" className="text-lg font-semibold">{tAi('eligibilityHeading')}</h2>
          <PreAssessmentLabel text={tAi('label')} />
          {canWrite ? (
            <>
              <p className="text-sm text-slate-600">{tAi('eligibilityHint', { credits: aiCreditEntry('M18', 'eligibility-pre-report')?.credits ?? 0 })}</p>
              <EligibilityForm organizationId={lead.id} calls={calls} />
            </>
          ) : null}
          <h3 className="text-base font-semibold">{tAi('reportsHeading')}</h3>
          {reports.length === 0 ? (
            <p className="text-slate-600">{tAi('noReports')}</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <li key={r.id} className="space-y-2 rounded border border-slate-200 p-3" data-testid="eligibility-report">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <PreAssessmentLabel text={tAi('label')} />
                    <span className="font-medium">{r.call.callIdentifier}</span>
                    <span className="text-slate-600">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(r.createdAt)}</span>
                    <span className={r.status === 'APPROVED' ? 'text-emerald-700' : 'text-amber-800'}>
                      {tAi(`status.${r.status === 'APPROVED' ? 'APPROVED' : 'DRAFT'}`)}
                    </span>
                    {canWrite && r.status !== 'APPROVED' ? <ApproveReportButton reportId={r.id} /> : null}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{r.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </LiveNoticeProvider>
  );
}
