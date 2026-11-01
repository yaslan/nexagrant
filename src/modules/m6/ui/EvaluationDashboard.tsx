'use client';

import { useTranslations } from 'next-intl';

import type { PanelScoreQueryResult } from '../server/scoring';

export interface EvaluationDashboardProps {
  /** Panel scores for one proposal, already read on the server under the session tenant. */
  rows: PanelScoreQueryResult[];
}

/** A panel and an ESR score are treated as agreeing when they sit within half a point. */
const AGREEMENT_TOLERANCE = 0.5;

/**
 * Panel scores for one proposal.
 *
 * This component previously imported `prisma` directly and queried inside a `useEffect`
 * — from a `'use client'` module, which cannot reach a database — and took `tenantId` as
 * a prop supplied by the browser. The rows now arrive from the server component above,
 * which reads them through `listPanelScores` under the session's tenant; the component
 * never names a tenant and never fetches.
 */
export function EvaluationDashboard({ rows }: EvaluationDashboardProps) {
  const t = useTranslations('m6');

  /** Literal keys, not an interpolated one — see the note in EvaluatorForm. */
  const consensusLabels: Record<string, string> = {
    solid: t('dashboard.consensusOutcome.solid'),
    divergent: t('dashboard.consensusOutcome.divergent'),
    'not-measured': t('dashboard.consensusOutcome.notMeasured'),
  };

  const unmeasuredReasons: Record<string, string> = {
    'no-submitted-marks': t('dashboard.notMeasuredReason.noSubmittedMarks'),
    'no-weighted-criterion': t('dashboard.notMeasuredReason.noWeightedCriterion'),
  };

  /**
   * What a missing panel score looks like.
   *
   * An em dash reads as "nothing here" — which is right for a column that is merely
   * blank, but a missing panel score is a fact about the evaluation and the owner needs
   * to know it exists and why. Rendering the reason also keeps the cell from being
   * mistaken for a rendering glitch and re-entered by hand.
   */
  function NotMeasured({ reason }: { reason: string | null }) {
    const explanation = (reason && unmeasuredReasons[reason]) ?? undefined;
    return (
      <span
        className="text-xs font-normal text-gray-500 italic"
        title={explanation}
        data-testid="m6-not-measured"
      >
        {t('dashboard.notMeasured')}
      </span>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white" data-testid="m6-dashboard">
      <h2 className="text-xl font-semibold mb-2">{t('dashboard.title')}</h2>

      {/* CLAUDE.md — Evaluator Lens output is never presented as an official score. */}
      <p
        className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        data-testid="m6-internal-badge"
      >
        <strong>{t('internalPreAssessment')}:</strong> {t('internalPreAssessmentBody')}
      </p>

      {rows.length === 0 ? (
        <p className="text-center py-8 text-gray-500" data-testid="m6-dashboard-empty">
          {t('dashboard.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 font-semibold text-gray-700">{t('dashboard.reviewers')}</th>
                <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.panelScore')}</th>
                <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.esrScore')}</th>
                <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.delta')}</th>
                <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.consensus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta =
                  row.esrScore !== null && row.panelScore !== null
                    ? row.esrScore - row.panelScore
                    : null;
                return (
                <tr key={row.evaluationId} className="border-b hover:bg-gray-50" data-testid="m6-dashboard-row">
                  <td className="py-2 px-4 font-medium text-gray-900">
                    {row.completedReviewerCount}/{row.reviewerCount}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600" data-testid="m6-panel-score">
                    {row.panelScore !== null ? (
                      row.panelScore.toFixed(2)
                    ) : (
                      <NotMeasured reason={row.unmeasuredReason} />
                    )}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600">
                    {row.esrScore !== null ? row.esrScore.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {delta !== null ? (
                      <span
                        className={
                          Math.abs(delta) <= AGREEMENT_TOLERANCE
                            ? 'text-green-600 font-semibold'
                            : 'text-red-600 font-semibold'
                        }
                      >
                        {delta >= 0 ? '+' : ''}
                        {delta.toFixed(2)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600" data-testid="m6-consensus">
                    {row.consensusOutcome === 'not-measured' ? (
                      <span className="text-xs font-normal text-gray-500 italic">
                        {consensusLabels['not-measured']}
                      </span>
                    ) : (
                      consensusLabels[row.consensusOutcome]
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
