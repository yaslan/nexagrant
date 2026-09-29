'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Archive, CheckCircle2 } from 'lucide-react';
import type { Gate } from '@prisma/client';

import { archiveOpportunity, declareApplication, evaluateOpportunityGate } from '../actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { errorMessage } from '@/lib/errors';
import { EffortTracker, type EffortEntry } from './effort';

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
  efforts,
  canArchive,
  backHref,
}: {
  opportunity: OpportunityView;
  g0: G0Display;
  /** Rows from the `Effort` table for this opportunity — empty is a real answer, not an error. */
  efforts: EffortEntry[];
  /** Whether this session may archive. The server action re-checks; this only hides the control. */
  canArchive: boolean;
  backHref: string;
}) {
  const t = useTranslations('Pipeline');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'effort'>('overview');
  const [outcome, setOutcome] = useState<GateOutcome | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorText = useActionErrorText();
  // Two-step archive: the button opens the confirmation panel, the panel's own button commits.
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, startArchiveTransition] = useTransition();

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
        setActionError(errorText(err, () => errorMessage(err, t('detail.error.GATE_EVALUATION_FAILED'))));
      }
    });
  };

  /**
   * Archiving is a two-step action and never says "delete".
   *
   * The row is not removed: `deletedAt` is stamped, the opportunity leaves every board and
   * every KPI, and the history attached to it stays on file. The confirmation copy says exactly
   * that, because a user who reads "delete" and means "hide" gets a different answer than the
   * one the database gives.
   */
  const handleArchive = () => {
    setArchiveError(null);
    startArchiveTransition(async () => {
      try {
        const res = await archiveOpportunity({ opportunityId: opportunity.id });
        if (!res.success) {
          setArchiveError(t(`detail.archive.error.${res.error}`));
          return;
        }
        // The detail page 404s for an archived opportunity, so there is nothing to return to
        // here: go back to the board, which will already have dropped the card.
        setConfirmingArchive(false);
        router.push(backHref);
        router.refresh();
      } catch (err) {
        setArchiveError(errorText(err, () => errorMessage(err, t('detail.archive.error.ARCHIVE_FAILED'))));
      }
    });
  };

  const [declareError, setDeclareError] = useState<string | null>(null);
  const [isDeclaring, startDeclareTransition] = useTransition();

  /** B7: the institution's own "gönderildi / kabul / red" declaration. The server applies the rule. */
  const handleDeclare = (declaration: 'submitted' | 'accepted' | 'rejected') => {
    setDeclareError(null);
    startDeclareTransition(async () => {
      try {
        const res = await declareApplication({ opportunityId: opportunity.id, declaration });
        if (!res.success) {
          setDeclareError(t(`detail.application.error.${res.error}`));
          return;
        }
        router.refresh();
      } catch (err) {
        setDeclareError(errorText(err, () => errorMessage(err, t('detail.application.error.DECLARE_FAILED'))));
      }
    });
  };

  const isSubmitted = ['SUBMITTED', 'FUNDED', 'REJECTED'].includes(opportunity.status);
  const isDecided = opportunity.status === 'FUNDED' || opportunity.status === 'REJECTED';

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

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleEvaluateGate}
              disabled={isPending}
              data-testid="pipeline-evaluate-gate"
              className="bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs cursor-pointer"
            >
              {isPending
                ? t('detail.evaluating')
                : t('detail.evaluateGate', { gate: opportunity.stage })}
            </button>

            {canArchive && !confirmingArchive && (
              <button
                onClick={() => {
                  setArchiveError(null);
                  setConfirmingArchive(true);
                }}
                data-testid="pipeline-archive"
                className="border border-border text-ink-2 hover:text-ink hover:border-ink-2 font-semibold py-2.5 px-5 rounded-lg transition cursor-pointer flex items-center gap-2"
              >
                <Archive className="w-4 h-4" aria-hidden="true" />
                {t('detail.archive.action')}
              </button>
            )}
          </div>
        </div>

        {/* Confirmation step. An archive is easy to trigger by accident from a card menu and,
            until restore ships, cannot be undone from the product — so it asks first, in its own
            band, and names what actually happens to the record. */}
        {confirmingArchive && (
          <div
            role="alertdialog"
            aria-labelledby="archive-confirm-title"
            data-testid="pipeline-archive-confirm"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-900"
          >
            <p id="archive-confirm-title" className="font-semibold flex items-center gap-2">
              <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
              {t('detail.archive.confirmTitle', { title: opportunity.title })}
            </p>
            <p className="mt-1 text-xs opacity-90">{t('detail.archive.confirmBody')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                data-testid="pipeline-archive-confirm-yes"
                className="bg-amber-700 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer"
              >
                {isArchiving ? t('detail.archive.archiving') : t('detail.archive.confirmYes')}
              </button>
              <button
                onClick={() => {
                  setConfirmingArchive(false);
                  setArchiveError(null);
                }}
                disabled={isArchiving}
                data-testid="pipeline-archive-cancel"
                className="border border-amber-300 text-amber-900 font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
              >
                {t('detail.archive.confirmNo')}
              </button>
            </div>
          </div>
        )}

        {archiveError && (
          <div
            role="alert"
            data-testid="pipeline-archive-error"
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 mb-4 text-sm text-rose-800 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{archiveError}</span>
          </div>
        )}

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

              <section
                className="bg-ground border border-border p-4 rounded-xl"
                aria-labelledby="application-declaration-title"
                data-testid="pipeline-application"
              >
                <h3
                  id="application-declaration-title"
                  className="text-xs font-semibold text-muted uppercase tracking-wider mb-1"
                >
                  {t('detail.application.title')}
                </h3>
                <p className="text-lg font-bold text-ink" data-testid="pipeline-application-status">
                  {t(`detail.application.current.${opportunity.status}`)}
                </p>
                <p className="text-xs text-muted mt-1">{t('detail.application.hint')}</p>
                {canArchive && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!isDecided && (
                      <button
                        onClick={() => handleDeclare('submitted')}
                        disabled={isDeclaring || opportunity.status === 'SUBMITTED'}
                        data-testid="pipeline-declare-submitted"
                        className="border border-border text-ink font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        {t('detail.application.submitted')}
                      </button>
                    )}
                    {isSubmitted && (
                      <>
                        <button
                          onClick={() => handleDeclare('accepted')}
                          disabled={isDeclaring || opportunity.status === 'FUNDED'}
                          data-testid="pipeline-declare-accepted"
                          className="bg-emerald-700 hover:opacity-90 text-white font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                        >
                          {t('detail.application.accepted')}
                        </button>
                        <button
                          onClick={() => handleDeclare('rejected')}
                          disabled={isDeclaring || opportunity.status === 'REJECTED'}
                          data-testid="pipeline-declare-rejected"
                          className="bg-rose-700 hover:opacity-90 text-white font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                        >
                          {t('detail.application.rejected')}
                        </button>
                      </>
                    )}
                    {isDeclaring && (
                      <span className="text-xs text-muted self-center" role="status">
                        {t('detail.application.saving')}
                      </span>
                    )}
                  </div>
                )}
                {declareError && (
                  <p role="alert" data-testid="pipeline-application-error" className="mt-2 text-xs text-rose-800">
                    {declareError}
                  </p>
                )}
              </section>

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

          {activeTab === 'effort' && (
            <EffortTracker opportunityId={opportunity.id} efforts={efforts} />
          )}
        </div>
      </div>
    </div>
  );
}
