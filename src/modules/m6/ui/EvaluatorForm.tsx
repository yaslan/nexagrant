'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { saveEvaluation } from '../server/actions';
import { DEFAULT_CRITERIA } from '../types';

export interface EvaluatorFormProps {
  proposalId: string;
  evaluationId: string;
  onClose?: () => void;
}

export function EvaluatorForm({ proposalId, evaluationId, onClose }: EvaluatorFormProps) {
  const t = useTranslations('m6');
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    DEFAULT_CRITERIA.forEach((c) => {
      initial[c.name] = 3;
    });
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / DEFAULT_CRITERIA.length;

  const handleScoreChange = (criterion: string, value: string) => {
    setScores((prev) => ({ ...prev, [criterion]: Math.round(Number(value)) }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await saveEvaluation({
        evaluationId,
        proposalId,
        scores,
      });
      onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl border border-gray-200 rounded-lg p-6 bg-white">
      <h2 className="text-xl font-semibold mb-6">{t('form.title')}</h2>
      <div className="space-y-6">
        {DEFAULT_CRITERIA.map((criterion) => (
          <div key={criterion.name}>
            <div className="flex justify-between mb-2">
              <label className="font-medium text-gray-700">{criterion.name}</label>
              <span className="text-lg font-semibold text-blue-600">{scores[criterion.name]}/5</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={scores[criterion.name]}
              onChange={(e) => handleScoreChange(criterion.name, e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        ))}

        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">Panel Average</span>
            <span className="text-2xl font-bold text-blue-600">{totalScore.toFixed(1)}/5</span>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {t('form.submit')}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-900 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200"
            >
              {t('form.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
