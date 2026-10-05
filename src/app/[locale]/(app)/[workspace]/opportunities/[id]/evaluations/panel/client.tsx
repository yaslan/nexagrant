'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { EvaluatorForm } from '@/modules/m6/ui/EvaluatorForm';

export interface PanelClientProps {
  proposalId: string;
  /** The PANEL evaluation this user is seated on, or null when they are not a reviewer. */
  seatedEvaluationId: string | null;
  /** The dashboard, rendered on the server so its rows come from a tenant-scoped read. */
  dashboard: ReactNode;
}

export function PanelClient({ proposalId, seatedEvaluationId, dashboard }: PanelClientProps) {
  const t = useTranslations('m6');
  const router = useRouter();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('panel.title')}</h1>

      {seatedEvaluationId ? (
        <EvaluatorForm
          proposalId={proposalId}
          evaluationId={seatedEvaluationId}
          // Re-runs the server component above so the dashboard shows the average the
          // save just recomputed rather than the pre-save one.
          onSaved={() => router.refresh()}
        />
      ) : (
        <p className="text-sm text-gray-500" data-testid="m6-not-seated">
          {t('panel.notSeated')}
        </p>
      )}

      {dashboard}
    </div>
  );
}
