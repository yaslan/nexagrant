import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getFormatter, getTranslations } from 'next-intl/server';

import { getWorkspaceRoute } from '@/lib/routes';
import { requireTenantPageRole } from '@/lib/page-role';
import { withTenant } from '@/lib/db';
import { PRODUCT_NAME } from '@/lib/brand';
import { errorMessage } from '@/lib/errors';
import { DEFAULT_GATE_RULES, DEFAULT_SCORING_WEIGHTS } from '@/lib/scoring/defaults';
import { DEFAULT_G0_RULES, G0_FEATURE_KEYS } from '@/lib/scoring/g0-canonical';
import { resolveWeights } from '@/lib/scoring/g0-compute';

/**
 * Read-only view of the rules the gate engine decides with (AKTAR-MURBCJ0A-1).
 *
 * This page used to be a form whose "Save" waited 800 ms and alerted "saved":
 * nothing was sent and nothing was stored, and a negative threshold "saved" too
 * (denetim bulgusu cae-fb K-1). There is no per-workspace gate configuration, so
 * the page shows the values from the places the engine actually reads them —
 * no copied numbers:
 *
 *   • G0 composite threshold — `DEFAULT_GATE_RULES.G0.minScore` (src/lib/gates/evaluate.ts G0)
 *   • G0 hard rules          — `DEFAULT_G0_RULES` (decideG0 in src/lib/scoring/g0-canonical.ts)
 *   • G1 / G2 / G3            — `DEFAULT_GATE_RULES` (src/lib/gates/evaluate.ts)
 *   • weights                 — `resolveWeights(Tenant.settings)`, what computeG0 scores with
 *
 * Rules that are defined but not enforced (G2.maxWeeksFromG0, G2.requireBudgetApproved,
 * G4.minHoursBeforeDeadline) are left out rather than shown as if they applied.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings.gates' });
  return { title: `${t('title')} — ${PRODUCT_NAME}` };
}

type Weights = typeof DEFAULT_SCORING_WEIGHTS;

export default async function GateSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  // Role door (NG-64 review B-2, K-577543): the tenant's scoring weights are
  // the gate evaluators' screen, so `evaluate_gates` (rbac.ts) opens it.
  const { tenantId } = await requireTenantPageRole(locale, 'evaluate_gates');
  const t = await getTranslations({ locale, namespace: 'settings.gates' });
  const format = await getFormatter({ locale });

  // A failed read shows that it failed: falling back to the defaults here would
  // put numbers on screen the scorer may not be using for this tenant.
  let weights: Weights | null = null;
  try {
    const tenant = await withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    weights = resolveWeights(tenant?.settings);
  } catch (err) {
    console.warn(`[GateSettings] tenant settings read failed: ${errorMessage(err)}`);
  }

  const g0 = DEFAULT_GATE_RULES.G0;
  const { G1, G2, G3 } = DEFAULT_GATE_RULES;
  const customised =
    weights !== null && G0_FEATURE_KEYS.some((key) => weights[key] !== DEFAULT_SCORING_WEIGHTS[key]);
  const total = weights ? G0_FEATURE_KEYS.reduce((sum, key) => sum + weights[key], 0) : 0;

  return (
    <div className="max-w-3xl mx-auto py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-ink-2 mb-4">
        <a href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbHome')}
        </a>
        <span aria-hidden="true">/</span>
        <a href={getWorkspaceRoute('settingsModules', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbSettings')}
        </a>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-ink font-semibold">
          {t('title')}
        </span>
      </nav>

      <h1 className="text-3xl font-bold mb-4 font-heading text-ink">{t('title')}</h1>
      <p className="text-ink-2 mb-4">{t('intro')}</p>
      <p role="note" className="mb-8 rounded-lg border border-border bg-ground px-4 py-3 text-sm text-ink">
        {t('readOnlyNote')}
      </p>

      <div className="space-y-8 bg-surface p-6 rounded-lg shadow-sm border border-border">
        <Section title={t('g0Heading')}>
          <Row label={t('g0MinScore')}>
            <Value testId="g0-min-score">{format.number(g0.minScore)}</Value> {t('outOf100')}
          </Row>
          {DEFAULT_G0_RULES.minAlignment !== null && (
            <Row label={t('g0MinAlignment')}>
              <Value testId="g0-min-alignment">{format.number(DEFAULT_G0_RULES.minAlignment)}</Value>{' '}
              {t('outOf100')}
            </Row>
          )}
          <Row label={t('g0MinBaseRate')}>
            <Value testId="g0-min-base-rate">{format.number(DEFAULT_G0_RULES.minBaseRate)}</Value> {t('percent')}
          </Row>
          <Row label={t('g0Country')}>
            {DEFAULT_G0_RULES.requireEligibleCountry ? t('required') : t('notRequired')}
          </Row>
        </Section>

        <Section title={t('g1Heading')}>
          <Row label={t('g1Coordinator')}>
            {G1.requireCoordinatorHistoryIfCoordinator ? t('g1Recorded') : t('off')}
          </Row>
          <Row label={t('g1CriticalSeats')}>{G1.requireCriticalSeatsFilled ? t('required') : t('notRequired')}</Row>
          <Row label={t('g1BackupCandidates')}>{G1.requireBackupForCriticalSeats ? t('required') : t('notRequired')}</Row>
        </Section>

        <Section title={t('g2Heading')}>
          <Row label={t('g2Seats')}>{G2.requireAllSeatsFilled ? t('required') : t('notRequired')}</Row>
        </Section>

        <Section title={t('g3Heading')}>
          <Row label={t('g3MinCriterion')}>
            <Value testId="g3-min-criterion">{format.number(G3.minCriterionScore)}</Value>
          </Row>
          <Row label={t('g3MinTotal')}>
            <Value testId="g3-min-total">{format.number(G3.minTotalScore)}</Value>
          </Row>
        </Section>

        <section aria-labelledby="gate-weights-heading">
          <h2 id="gate-weights-heading" className="text-lg font-semibold text-ink border-b border-border pb-2 mb-4">
            {t('weightsHeading')}
          </h2>
          <p className="text-sm text-ink-2 mb-4">{t('weightsIntro')}</p>
          {weights === null ? (
            <p role="alert" className="text-sm text-ink">
              {t('weightsUnavailable')}
            </p>
          ) : (
            <>
              {customised && <p className="text-sm text-ink mb-4">{t('weightsCustom')}</p>}
              <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                {G0_FEATURE_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex justify-between items-baseline gap-2 bg-ground p-2 rounded border border-border"
                  >
                    <dt className="text-sm font-medium text-ink-2 min-w-0 break-words">
                      <span>{t(`weights.${key}`)}</span>
                    </dt>
                    <dd className="text-sm text-ink font-mono shrink-0 text-right">
                      <Value testId={`weight-${key}`}>{format.number(weights[key])}</Value>
                      {weights[key] !== DEFAULT_SCORING_WEIGHTS[key] && (
                        <span className="block text-xs text-ink-2 font-sans">
                          {t('weightsDefault', { value: format.number(DEFAULT_SCORING_WEIGHTS[key]) })}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between items-baseline gap-2 p-2 rounded border border-border">
                  <dt className="text-sm font-semibold text-ink">{t('weightsTotal')}</dt>
                  <dd className="text-sm text-ink font-mono font-semibold shrink-0">{format.number(total)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink border-b border-border pb-2 mb-4">{title}</h2>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className="text-sm text-ink sm:text-right">{children}</dd>
    </div>
  );
}

function Value({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <span data-testid={testId} className="font-mono font-semibold">
      {children}
    </span>
  );
}
