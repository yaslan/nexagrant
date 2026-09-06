'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { listPanelScores } from '../server/actions';

export interface EvaluationDashboardProps {
  proposalId: string;
}

interface PanelScoreRow {
  evaluationId: string;
  reviewerCount: number;
  completedReviewerCount: number;
  panelScore: number | null;
  esrScore: number | null;
  consensusOutcome: string | null;
  deltaAbsolute: number | null;
}

/** A panel and an ESR score are treated as agreeing when they sit within half a point. */
const AGREEMENT_TOLERANCE = 0.5;

/**
 * Panel scores for one proposal, read from the database through a tenant-scoped server
 * action.
 *
 * This component previously imported `prisma` directly and queried inside a `useEffect`
 * — from a `'use client'` module, which cannot reach a database — and took `tenantId` as
 * a prop supplied by the browser. The tenant now comes from the session inside
 * `listPanelScores`, and the component never names one.
 */
export function EvaluationDashboard({ proposalId }: EvaluationDashboardProps) {
  const t = useTranslations('m6');

  /** Literal keys, not an interpolated one — see the note in EvaluatorForm. */
  const consensusLabels: Record<string, string> = {
    solid: t('dashboard.consensusOutcome.solid'),
    divergent: t('dashboard.consensusOutcome.divergent'),
  };

  const [rows, setRows] = useState<PanelScoreRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listPanelScores(proposalId);
      setRows(
        result.map((r) => ({
          evaluationId: r.evaluationId,
          reviewerCount: r.reviewerCount,
          completedReviewerCount: r.completedReviewerCount,
          panelScore: r.panelScore,
          esrScore: r.esrScore,
          consensusOutcome: r.consensusOutcome,
          deltaAbsolute:
            r.esrScore !== null && r.panelScore !== null ? r.esrScore - r.panelScore : null,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500" data-testid="m6-dashboard-loading">
        {t('dashboard.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-6" data-testid="m6-dashboard-error">
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 text-sm font-semibold text-red-700 underline"
        >
          {t('dashboard.retry')}
        </button>
      </div>
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
              {rows.map((row) => (
                <tr key={row.evaluationId} className="border-b hover:bg-gray-50" data-testid="m6-dashboard-row">
                  <td className="py-2 px-4 font-medium text-gray-900">
                    {row.completedReviewerCount}/{row.reviewerCount}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600" data-testid="m6-panel-score">
                    {row.panelScore !== null ? row.panelScore.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600">
                    {row.esrScore !== null ? row.esrScore.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {row.deltaAbsolute !== null ? (
                      <span
                        className={
                          Math.abs(row.deltaAbsolute) <= AGREEMENT_TOLERANCE
                            ? 'text-green-600 font-semibold'
                            : 'text-red-600 font-semibold'
                        }
                      >
                        {row.deltaAbsolute >= 0 ? '+' : ''}
                        {row.deltaAbsolute.toFixed(2)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600">
                    {(row.consensusOutcome && consensusLabels[row.consensusOutcome]) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
