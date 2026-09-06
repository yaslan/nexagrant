'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getPanelScoresForProposal } from '../server/scoring';
import { prisma } from '@/lib/db';

export interface EvaluationDashboardProps {
  tenantId: string;
  proposalId: string;
}

interface PanelScoreRow {
  proposalId: string;
  panelScore: number | null;
  esrScore: number | null;
  deltaAbsolute: number | null;
}

export function EvaluationDashboard({ tenantId, proposalId }: EvaluationDashboardProps) {
  const t = useTranslations('m6');
  const [scores, setScores] = useState<PanelScoreRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const result = await getPanelScoresForProposal(prisma, tenantId, proposalId);
        setScores(
          result.map((r) => ({
            proposalId: r.proposalId,
            panelScore: r.panelScore,
            esrScore: r.esrScore,
            deltaAbsolute: r.esrScore && r.panelScore ? r.esrScore - r.panelScore : null,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch scores:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchScores();
  }, [tenantId, proposalId]);

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (scores.length === 0) {
    return <div className="text-center py-8 text-gray-500">No evaluations yet</div>;
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      <h2 className="text-xl font-semibold mb-6">{t('dashboard.title')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-4 font-semibold text-gray-700">{t('dashboard.proposalId')}</th>
              <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.panelScore')}</th>
              <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.esrScore')}</th>
              <th className="text-right py-2 px-4 font-semibold text-gray-700">{t('dashboard.delta')}</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((row) => (
              <tr key={row.proposalId} className="border-b hover:bg-gray-50">
                <td className="py-2 px-4 font-medium text-gray-900">{row.proposalId}</td>
                <td className="py-2 px-4 text-right text-gray-600">
                  {row.panelScore !== null ? row.panelScore.toFixed(2) : '—'}
                </td>
                <td className="py-2 px-4 text-right text-gray-600">
                  {row.esrScore !== null ? row.esrScore.toFixed(2) : '—'}
                </td>
                <td className="py-2 px-4 text-right">
                  {row.deltaAbsolute !== null ? (
                    <span
                      className={
                        Math.abs(row.deltaAbsolute) <= 0.5
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
