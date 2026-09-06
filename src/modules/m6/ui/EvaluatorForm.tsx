'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { saveEvaluation } from '../server/actions';
import { saveEvaluationSchema } from '../server/validation';
import { DEFAULT_CRITERIA, MAX_SCORE, MIN_SCORE, type CriterionName } from '../types';

export interface EvaluatorFormProps {
  proposalId: string;
  evaluationId: string;
  onClose?: () => void;
  /** Called with the recomputed panel average after a successful save. */
  onSaved?: (avgScore: number | null) => void;
}

/** Initial marks sit at the midpoint of the 1–5 scale, not at a judgement. */
const NEUTRAL_MARK = Math.round((MIN_SCORE + MAX_SCORE) / 2);

export function EvaluatorForm({ proposalId, evaluationId, onClose, onSaved }: EvaluatorFormProps) {
  const t = useTranslations('m6');

  /**
   * Criterion labels come from a literal map rather than a template-literal
   * translation key. A key built by interpolation is invisible to
   * `pnpm i18n:check`, which then reports it as missing in both locales.
   */
  const criterionLabels: Record<CriterionName, string> = {
    Innovation: t('criteria.Innovation'),
    Feasibility: t('criteria.Feasibility'),
    Impact: t('criteria.Impact'),
    Communication: t('criteria.Communication'),
  };

  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c.name, NEUTRAL_MARK])),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Weighted preview of what the panel average becomes, using the same weights the
   * server scores with. An unweighted mean here would show the reviewer a different
   * number from the one that lands in the database.
   */
  const previewAverage = useMemo(() => {
    const totalWeight = DEFAULT_CRITERIA.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight <= 0) return 0;
    const weighted = DEFAULT_CRITERIA.reduce(
      (sum, c) => sum + (scores[c.name] ?? NEUTRAL_MARK) * c.weight,
      0,
    );
    return weighted / totalWeight;
  }, [scores]);

  const handleScoreChange = (criterion: string, value: string) => {
    setScores((prev) => ({ ...prev, [criterion]: Math.round(Number(value)) }));
  };

  const handleSubmit = async () => {
    setError(null);

    // Validate against the same schema the action enforces, so a bad mark is reported
    // in the form instead of coming back as an opaque server error.
    const payload = { evaluationId, proposalId, scores };
    const parsed = saveEvaluationSchema.safeParse(payload);
    if (!parsed.success) {
      setError(t('form.invalidInput'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await saveEvaluation(parsed.data);
      onSaved?.(result.avgScore);
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('form.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl border border-gray-200 rounded-lg p-6 bg-white" data-testid="m6-evaluator-form">
      <h2 className="text-xl font-semibold mb-2">{t('form.title')}</h2>

      {/* CLAUDE.md — Evaluator Lens output is never presented as an official score. */}
      <p
        className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        data-testid="m6-internal-badge"
      >
        <strong>{t('internalPreAssessment')}:</strong> {t('internalPreAssessmentBody')}
      </p>

      <div className="space-y-6">
        {DEFAULT_CRITERIA.map((criterion) => {
          const mark = scores[criterion.name] ?? NEUTRAL_MARK;
          const inputId = `m6-criterion-${criterion.name.toLowerCase()}`;
          return (
            <div key={criterion.name}>
              <div className="flex justify-between mb-2">
                <label className="font-medium text-gray-700" htmlFor={inputId}>
                  {criterionLabels[criterion.name]}{' '}
                  <span className="text-xs text-gray-500">
                    ({t('form.weight')} {Math.round(criterion.weight * 100)}%)
                  </span>
                </label>
                <span className="text-lg font-semibold text-blue-600" data-testid={`${inputId}-value`}>
                  {mark}/{MAX_SCORE}
                </span>
              </div>
              <input
                id={inputId}
                data-testid={inputId}
                type="range"
                min={MIN_SCORE}
                max={MAX_SCORE}
                step="1"
                value={mark}
                onChange={(e) => handleScoreChange(criterion.name, e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          );
        })}

        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">{t('form.panelAverage')}</span>
            <span className="text-2xl font-bold text-blue-600" data-testid="m6-preview-average">
              {previewAverage.toFixed(1)}/{MAX_SCORE}
            </span>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600" data-testid="m6-form-error">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            data-testid="m6-form-submit"
            className="flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? t('form.submitting') : t('form.submit')}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-gray-100 text-gray-900 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {t('form.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
