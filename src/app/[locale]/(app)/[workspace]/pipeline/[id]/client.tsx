'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Gate } from '@prisma/client';

import { evaluateOpportunityGate } from '../actions';
import { errorMessage } from '@/lib/errors';
import { EffortTracker } from './effort';

/**
 * What the G0 scorer produced for this opportunity, already computed on the server.
 *
 * `score: null` is a first-class state, not a missing prop: the canonical scorer returns `null`
 * when there is no evidence to score on, and the screen has to say so. The page used to hold a
 * literal `g0Score: 92` in a mock object, which showed 92/100 while the scorer said 18 — the
 * number a user read had no relation to the number the gate decided on.
 */
export interface G0Display {
  score: number | null;
  decision: 'GO' | 'NO_GO' | null;
  /** How much of the weighted feature set had real evidence behind it. */
  measuredSources: number;
  totalSources: number;
  /** Non-localised diagnostics from the scorer; rendered as data, never as UI copy. */
  reasons: string[];
  /** `DEFAULT_GATE_RULES.G0.minScore`, so the screen names the threshold it is judged against. */
  minScore: number;
}

export interface OpportunityView {
  id: string;
  title: string;
  topicId: string | null;
  stage: Gate;
  status: string;
  intendedRole: string | null;
}

type GateOutcome = { passed: boolean; reasons: string[] };

const TASK_TEMPLATE = ['T-6', 'T-5', 'T-4'] as const;

export function OpportunityDetailClient({
  opportunity,
  g0,
  backHref,
}: {
  opportunity: OpportunityView;
  g0: G0Display;
  backHref: string;
}) {
  const t = useTranslations('Pipeline');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'effort'>('overview');
  const [outcome, setOutcome] = useState<GateOutcome | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * The button runs the real gate.
   *
   * It used to `alert('Evaluating…')` and then `alert('Evaluation passed! Moving to G1.')` on a
   * one-second timer — a pass announced without anything being evaluated and without the stage
   * moving. `evaluateGate` scores the opportunity, records a `GateDecision` and advances the
   * stage only when the rules actually pass, so the answer on screen is the stored decision.
   */
  const handleEvaluateGate = () => {
    setActionError(null);
    setOutcome(null);
    startTransition(async () => {
      try {
        const res = await evaluateOpportunityGate({
          opportunityId: opportunity.id,
          gate: opportunity.stage,
        });
        if (!res.success) {
          setActionError(t(`detail.error.${res.error}`));
          return;
        }
        setOutcome({ passed: res.passed, reasons: res.reasons });
        // The gate writes the score and, on a pass, the new stage: re-read the server component
        // rather than guessing the new state on the client.
        router.refresh();
      } catch (err) {
        setActionError(errorMessage(err, t('detail.error.GATE_EVALUATION_FAILED')));
      }
    });
  };

  const scoreKnown = g0.score !== null;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <Link href={backHref} className="text-accent hover:underline text-sm font-medium flex items-center gap-1">
          ← {t('detail.back')}
        </Link>
      </div>

      <div className="bg-surface p-6 md:p-8 rounded-xl shadow-xs border border-border mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold bg-accent/15 text-accent-ink border border-accent/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                {opportunity.stage}
              </span>
              <span className="text-xs font-semibold bg-ok/15 text-ok border border-ok/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {opportunity.status}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-2">{opportunity.title}</h1>
            {opportunity.topicId && <p className="text-muted font-mono text-sm">{opportunity.topicId}</p>}
          </div>

          <button
            onClick={handleEvaluateGate}
            disabled={isPending}
            data-testid="pipeline-evaluate-gate"
            className="bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs shrink-0 cursor-pointer"
          >
            {isPending
              ? t('detail.evaluating')
              : t('detail.evaluateGate', { gate: opportunity.stage })}
          </button>
        </div>

        {/* Gate result. Same banner shape as the M6 Evaluator Lens error band
            (opportunities/[id]/evaluations/client.tsx) so the two screens report failure
            identically; the pass variant is the same band in emerald. */}
        {actionError && (
          <div
            role="alert"
            data-testid="pipeline-gate-error"
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {outcome && (
          <div
            role="alert"
            data-testid="pipeline-gate-result"
            className={
              outcome.passed
                ? 'rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2'
                : 'rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2'
            }
          >
            {outcome.passed ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">
                {outcome.passed
                  ? t('detail.gatePassed', { gate: opportunity.stage })
                  : t('detail.gateFailed', { gate: opportunity.stage })}
              </p>
              {outcome.reasons.length > 0 && (
                <ul className="list-disc list-inside font-mono text-xs opacity-90">
                  {outcome.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex border-b border-border mt-8 gap-2">
          {(['overview', 'tasks', 'effort'] as const).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition cursor-pointer ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink hover:border-border'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {t(`detail.tab.${tab}`)}
            </button>
          ))}
        </div>

        <div className="py-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-ground border border-border p-4 rounded-xl" data-testid="pipeline-g0-score">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                    {t('detail.g0Score')}
                  </h3>
                  {scoreKnown ? (
                    <>
                      <p className="text-2xl font-bold text-ink">{g0.score}/100</p>
                      <p className="text-xs text-muted mt-1">
                        {t('detail.threshold', { min: g0.minScore })} ·{' '}
                        {t('detail.evidenceCoverage', {
                          measured: g0.measuredSources,
                          total: g0.totalSources,
                        })}
                      </p>
                      {g0.decision && (
                        <p className="text-xs font-semibold mt-1">
                          {g0.decision === 'GO' ? t('detail.decisionGo') : t('detail.decisionNoGo')}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-amber" data-testid="pipeline-g0-unscored">
                        {t('detail.g0NotComputed')}
                      </p>
                      <p className="text-xs text-muted mt-1">{t('detail.g0NotComputedHint')}</p>
                    </>
                  )}
                  <p className="text-[11px] text-muted mt-2 italic">{t('detail.internalPreAssessment')}</p>
                </div>
                <div className="bg-ground border border-border p-4 rounded-xl">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                    {t('detail.intendedRole')}
                  </h3>
                  <p className="text-2xl font-bold text-ink capitalize">
                    {opportunity.intendedRole ?? t('detail.roleUnset')}
                  </p>
                </div>
              </div>

              {g0.reasons.length > 0 && (
                <div className="bg-ground border border-border p-4 rounded-xl">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    {t('detail.scoreReasons')}
                  </h3>
                  <ul className="list-disc list-inside text-xs text-ink-2 font-mono space-y-1">
                    {g0.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <p className="text-muted text-sm mb-4">{t('detail.tasksTemplateNote')}</p>
              <ul className="space-y-2 text-sm text-ink-2">
                {TASK_TEMPLATE.map((step) => (
                  <li
                    key={step}
                    className="flex items-center gap-2.5 bg-ground p-3 rounded-lg border border-border"
                  >
                    <span className="font-mono text-xs text-muted">{step}</span>
                    <span>{t(`detail.taskStep.${step}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'effort' && <EffortTracker opportunityId={opportunity.id} />}
        </div>
      </div>
    </div>
  );
}
