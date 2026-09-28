'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { assessFit, requiredChecks, type FitGap, type FitRequirements } from '@/lib/public-sector/fit';

const QUESTION_KEY: Record<FitGap, 'q_pic' | 'q_partner' | 'q_cofinancing'> = {
  pic: 'q_pic',
  partner: 'q_partner',
  cofinancing: 'q_cofinancing',
};

const ORDER: FitGap[] = ['pic', 'partner', 'cofinancing'];

/**
 * "Size uygun mu? 3 soru" — three yes/no questions and a verdict computed by
 * the pure `assessFit`. Nothing is stored or sent: the answers live in this
 * component's state only.
 */
export default function FitCheck({
  requirements,
  readinessHref,
  idPrefix,
}: {
  requirements: FitRequirements;
  readinessHref: string;
  idPrefix: string;
}) {
  const t = useTranslations('publicSectorCalls');
  const [answers, setAnswers] = useState<Partial<Record<FitGap, boolean>>>({});

  const needed = new Set(requiredChecks(requirements));
  const complete = ORDER.every((q) => !needed.has(q) || answers[q] !== undefined);
  const result = complete
    ? assessFit(requirements, {
        hasPic: answers.pic ?? true,
        hasPartner: answers.partner ?? true,
        canCofinance: answers.cofinancing ?? true,
      })
    : null;

  return (
    <details className="group rounded-lg border border-border bg-background" data-testid="fit-check">
      <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-semibold text-accent-ink focus-visible:outline-2 focus-visible:outline-accent">
        {t('fit.summary')}
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">
        {ORDER.map((q) => {
          const groupId = `${idPrefix}-${q}`;
          if (!needed.has(q)) {
            return (
              <div key={q} className="text-xs text-muted">
                <p>{t(`fit.${QUESTION_KEY[q]}`)}</p>
                <p className="italic">{t('fit.not_needed')}</p>
              </div>
            );
          }
          return (
            <fieldset key={q} className="space-y-2">
              <legend id={groupId} className="text-sm text-ink">
                {t(`fit.${QUESTION_KEY[q]}`)}
              </legend>
              <div className="flex gap-2" role="radiogroup" aria-labelledby={groupId}>
                {([true, false] as const).map((value) => {
                  const selected = answers[q] === value;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-answer={`${q}-${value ? 'yes' : 'no'}`}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q]: value }))}
                      className={`rounded-md border px-4 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-accent ${
                        selected
                          ? 'border-accent bg-accent text-white'
                          : 'border-border bg-surface text-ink hover:border-accent'
                      }`}
                    >
                      {value ? t('fit.yes') : t('fit.no')}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {result && (
          <div
            role="status"
            data-verdict={result.verdict}
            className={`rounded-md border p-3 text-sm ${
              result.verdict === 'fit' ? 'border-ok/30 bg-ok/10' : 'border-amber/40 bg-amber/10'
            }`}
          >
            {result.verdict === 'fit' ? (
              <>
                <p className="font-bold text-ok">{t('fit.result_fit')}</p>
                <p className="mt-1 text-ink">{t('fit.result_fit_detail')}</p>
              </>
            ) : (
              <>
                <p className="font-bold text-ink">{t('fit.result_prepare')}</p>
                <p className="mt-1 text-ink">{t('fit.result_prepare_detail')}</p>
                <ul className="mt-1 list-disc pl-5 text-ink">
                  {result.gaps.map((g) => (
                    <li key={g}>{t(`fit.gap.${g}`)}</li>
                  ))}
                </ul>
                <a
                  href={readinessHref}
                  className="mt-2 inline-block font-semibold text-accent-ink underline underline-offset-2"
                >
                  {t('fit.readiness_link')}
                </a>
              </>
            )}
            <button
              type="button"
              onClick={() => setAnswers({})}
              className="mt-3 block text-xs text-muted underline underline-offset-2"
            >
              {t('fit.reset')}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
