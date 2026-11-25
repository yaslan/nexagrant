'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Archive, CheckCircle2 } from 'lucide-react';
import type { Gate } from '@prisma/client';

import { getWorkspaceRoute } from '@/lib/routes';
import { useActiveModules } from '@/lib/modules/hooks';
import { getOpportunityTabs } from '@/lib/modules/registry';

import {
  archiveOpportunity,
  declareApplication,
  evaluateOpportunityGate,
  reactivateOpportunityAction,
  withdrawOpportunityAction,
} from '../actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { useGateReasonText } from '@/lib/hooks/use-gate-reason-text';
import type { GateReason } from '@/lib/gates/reasons';
import { nextStageOf } from '@/lib/gates/transition';
import { g0BoxMode, g0ReasonsVisible, type SavedG0Decision } from '@/lib/gates/latest-g0-decision';
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
  /** Why the scorer said no, as codes: the screen words them through `useGateReasonText`. */
  reasons: GateReason[];
  /** `DEFAULT_GATE_RULES.G0.minScore`, so the screen names the threshold it is judged against. */
  minScore: number;
  /**
   * `no_history_evidence`: a partner with no CORDIS history was scored without the history
   * criteria. The score is then the average over the criteria that were measured, and
   * `denominator` is the weight those criteria add up to (not 100).
   */
  scoringBasis: 'standard' | 'no_history_evidence';
  /** Sum of the weights the score was normalised by; `null` when nothing was scored. */
  denominator: number | null;
}

export interface OpportunityView {
  id: string;
  title: string;
  topicId: string | null;
  stage: Gate;
  status: string;
  intendedRole: string | null;
}

type GateOutcome = { gate: Gate; stageBefore: Gate; passed: boolean; reasons: string[] };

/** One `decision_log` row as the detail page passes it (dates as ISO strings). */
export interface DecisionEntry {
  id: string;
  kind: 'APPLY' | 'WITHDRAW' | 'REACTIVATE';
  reason: string;
  decidedAt: string;
}

const TASK_TEMPLATE = ['T-6', 'T-5', 'T-4'] as const;

export function OpportunityDetailClient({
  opportunity,
  g0,
  efforts,
  decisions,
  canArchive,
  backHref,
  locale,
  workspace,
  savedG0,
}: {
  opportunity: OpportunityView;
  g0: G0Display;
  /** Latest saved G0 decision; the G0 box shows it once the opportunity has left G0 (NG-69). */
  savedG0: SavedG0Decision | null;
  /** Rows from the `Effort` table for this opportunity — empty is a real answer, not an error. */
  efforts: EffortEntry[];
  /** The `decision_log` rows for this opportunity, oldest first (NG-15). */
  decisions: DecisionEntry[];
  /** Whether this session may archive. The server action re-checks; this only hides the control. */
  canArchive: boolean;
  backHref: string;
  locale: string;
  workspace: string;
}) {
  const t = useTranslations('Pipeline');
  const reasonText = useGateReasonText();
  const activeModules = useActiveModules();
  // The per-opportunity pages other modules own, from each manifest's
  // `opportunityTabs[]`. Until these links existed they were reachable only by typing
  // the address (TASK-MVBB4FCX2Q24T K-1). A tab shows only when the server-side module
  // decision (`listModuleNav`, via `ModuleProvider`) opens its module; the page behind
  // it still runs `moduleGate`.
  const moduleTabs = getOpportunityTabs(activeModules);
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
   *
   * The main button runs the gate in front of the opportunity. A stage records a gate already
   * passed, so running the stage's own gate could never have moved it, whatever the label said.
   */
  const nextStage = nextStageOf(opportunity.stage);

  const handleEvaluateGate = (gate: Gate) => {
    setActionError(null);
    setOutcome(null);
    startTransition(async () => {
      try {
        const res = await evaluateOpportunityGate({
          opportunityId: opportunity.id,
          gate,
        });
        if (!res.success) {
          setActionError(t(`detail.error.${res.error}`));
          return;
        }
        // The stage on screen changes after the refresh; the banner names what was decided here.
        setOutcome({ gate, stageBefore: opportunity.stage, passed: res.passed, reasons: res.reasonDetails?.map(reasonText) ?? res.reasons });
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

  /** NG-15: the withdraw form. Refusals (empty reason, wrong status) come back from the server. */
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isWithdrawing, startWithdrawTransition] = useTransition();

  const handleWithdraw = () => {
    setWithdrawError(null);
    startWithdrawTransition(async () => {
      try {
        const res = await withdrawOpportunityAction({ opportunityId: opportunity.id, reason: withdrawReason });
        if (!res.success) {
          setWithdrawError(t(`detail.withdraw.error.${res.error}`));
          return;
        }
        setWithdrawOpen(false);
        setWithdrawReason('');
        router.refresh();
      } catch (err) {
        setWithdrawError(errorText(err, () => errorMessage(err, t('detail.withdraw.error.WITHDRAW_FAILED'))));
      }
    });
  };

  /**
   * NG-241 Faz 2: reactivate a withdrawn opportunity. Same form pattern as the withdraw dialog above;
   * the server checks the reason, the role and the status again (a refusal comes back as an error code).
   */
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reactivateReason, setReactivateReason] = useState('');
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const [isReactivating, startReactivateTransition] = useTransition();

  const handleReactivate = () => {
    setReactivateError(null);
    startReactivateTransition(async () => {
      try {
        const res = await reactivateOpportunityAction({ opportunityId: opportunity.id, reason: reactivateReason });
        if (!res.success) {
          setReactivateError(t(`detail.reactivate.error.${res.error}`));
          return;
        }
        setReactivateOpen(false);
        setReactivateReason('');
        router.refresh();
      } catch (err) {
        setReactivateError(errorText(err, () => errorMessage(err, t('detail.reactivate.error.REACTIVATE_FAILED'))));
      }
    });
  };

  const canWithdraw = canArchive && (opportunity.status === 'ACTIVE' || opportunity.status === 'SUBMITTED');
  const isWithdrawn = opportunity.status === 'WITHDRAWN';
  const canReactivate = canArchive && isWithdrawn;

  const isSubmitted = ['SUBMITTED', 'FUNDED', 'REJECTED'].includes(opportunity.status);
  const isDecided = opportunity.status === 'FUNDED' || opportunity.status === 'REJECTED';

  const scoreKnown = g0.score !== null;
  // The first reason the scorer gave for refusing: shown on the score card, the full list is below.
  const refusalReason = g0.decision === 'NO_GO' ? g0.reasons[0] : undefined;
  // Past G0 the box shows the saved decision and its date, never the live computation (NG-69).
  const boxMode = g0BoxMode(opportunity.stage, savedG0);

  return (
    <div className="max-w-5xl mx-auto py-4 sm:px-4 md:p-8">
      <div className="mb-6">
        <Link href={backHref} className="text-accent hover:underline text-sm font-medium flex items-center gap-1">
          ← {t('detail.back')}
        </Link>
      </div>

      <div className="bg-surface p-6 md:p-8 rounded-xl shadow-xs border border-border mb-8">
        <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap justify-between items-start gap-4 mb-6">
          {/* w-full below sm: the column's items-start would otherwise size this block to the
              longest unbreakable word of the title (a pasted link), wider than the card. */}
          <div className="w-full sm:w-auto min-w-0 break-words">
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

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              onClick={() => nextStage && handleEvaluateGate(nextStage)}
              disabled={isPending || !nextStage}
              data-testid="pipeline-evaluate-gate"
              className="bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs cursor-pointer"
            >
              {!nextStage
                ? t('detail.finalStage', { gate: opportunity.stage })
                : isPending
                  ? t('detail.evaluating')
                  : t('detail.evaluateNextGate', { gate: nextStage })}
            </button>

            {/* G0 is the one gate no move leads to, and its score is read from this decision. */}
            {opportunity.stage === 'G0' && (
              <button
                onClick={() => handleEvaluateGate('G0')}
                disabled={isPending}
                data-testid="pipeline-evaluate-current-gate"
                className="border border-border text-ink-2 hover:text-ink hover:border-ink-2 disabled:opacity-50 font-semibold py-2.5 px-5 rounded-lg transition cursor-pointer"
              >
                {t('detail.evaluateGate', { gate: 'G0' })}
              </button>
            )}

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
              {/* Bare text here would be an anonymous flex item as wide as the title's longest
                  word; a pasted link pushed <main> sideways by up to 387px at 320. */}
              <span className="min-w-0 break-words">
                {t('detail.archive.confirmTitle', { title: opportunity.title })}
              </span>
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
                {!outcome.passed
                  ? t('detail.gateFailed', { gate: outcome.gate, stage: outcome.stageBefore })
                  : outcome.gate === outcome.stageBefore
                    ? t('detail.gatePassed', { gate: outcome.gate })
                    : t('detail.gateAdvanced', { gate: outcome.gate })}
              </p>
              {outcome.reasons.length > 0 && (
                <ul className="list-disc list-inside text-xs opacity-90">
                  {outcome.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {moduleTabs.length > 0 && (
          <nav
            aria-labelledby="opportunity-modules-label"
            data-testid="opportunity-module-tabs"
            className="mt-8 flex flex-wrap items-center gap-2"
          >
            <span
              id="opportunity-modules-label"
              className="text-xs font-semibold text-muted uppercase tracking-wider mr-1"
            >
              {t('detail.modules.label')}
            </span>
            {moduleTabs.map((tab) => (
              <Link
                key={tab.routeKey}
                href={getWorkspaceRoute(tab.routeKey, locale, workspace, opportunity.id)}
                data-testid={`opportunity-module-tab-${tab.labelKey}`}
                className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-border bg-ground text-sm font-medium text-ink-2 hover:text-ink hover:border-accent/40 transition-colors"
              >
                {t(`detail.modules.${tab.labelKey}`)}
                {/* text-ink-2, not text-muted: muted on bg-ground is 4.39:1, under AA. */}
                <span className="font-mono text-[10px] text-ink-2">{tab.moduleId}</span>
              </Link>
            ))}
          </nav>
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
                  {boxMode.kind === 'saved' ? (
                    <>
                      <p
                        className={`text-2xl font-bold ${boxMode.passed ? 'text-ok' : 'text-rose-800'}`}
                        data-testid="pipeline-g0-saved"
                      >
                        {boxMode.passed ? t('detail.savedG0Passed') : t('detail.savedG0Refused')}
                      </p>
                      <p className="text-xs text-muted mt-1" data-testid="pipeline-g0-saved-date">
                        {t('detail.savedG0Date', {
                          date: boxMode.decidedAt.toLocaleDateString(locale, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }),
                        })}
                      </p>
                    </>
                  ) : boxMode.kind === 'none' ? (
                    <>
                      <p className="text-lg font-bold text-amber" data-testid="pipeline-g0-saved-none">
                        {t('detail.savedG0None')}
                      </p>
                    </>
                  ) : scoreKnown ? (
                    <>
                      {g0.scoringBasis === 'no_history_evidence' ? (
                        // Not "/100": the score is an average over the criteria that were measured,
                        // so the scale is not a fixed 100 here (NG-69).
                        <>
                          <p className="text-2xl font-bold text-ink" data-testid="pipeline-g0-value">
                            {g0.score}
                          </p>
                          <p className="text-xs text-muted mt-1" data-testid="pipeline-g0-basis">
                            {t('detail.noHistoryBasis', { denominator: g0.denominator ?? 0 })}
                          </p>
                        </>
                      ) : (
                        <p className="text-2xl font-bold text-ink" data-testid="pipeline-g0-value">
                          {g0.score}/100
                        </p>
                      )}
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
                      {refusalReason && (
                        <p className="text-xs text-rose-800 mt-1" data-testid="pipeline-g0-refusal">
                          {t('detail.refusedBecause', { reason: reasonText(refusalReason) })}
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
                  {boxMode.kind === 'live' && (
                    <p className="text-[11px] text-muted mt-2 italic">{t('detail.internalPreAssessment')}</p>
                  )}
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
                {/* A withdrawn opportunity takes no application declaration (the server refuses it too). */}
                {canArchive && !isWithdrawn && (
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

                {isWithdrawn && (
                  <div
                    role="status"
                    data-testid="pipeline-withdrawn-warning"
                    className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg text-xs"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t('detail.withdraw.withdrawnNotice')}</span>
                  </div>
                )}

                {canReactivate && !reactivateOpen && (
                  <button
                    onClick={() => {
                      setReactivateError(null);
                      setReactivateOpen(true);
                    }}
                    data-testid="pipeline-reactivate-open"
                    className="mt-3 border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer"
                  >
                    {t('detail.reactivate.open')}
                  </button>
                )}

                {canReactivate && reactivateOpen && (
                  <div className="mt-3 space-y-2" data-testid="pipeline-reactivate-form">
                    <label htmlFor="reactivate-reason" className="block text-xs font-semibold text-ink">
                      {t('detail.reactivate.reasonLabel')}
                    </label>
                    <p id="reactivate-reason-hint" className="text-xs text-muted">
                      {t('detail.reactivate.reasonHint')}
                    </p>
                    <textarea
                      id="reactivate-reason"
                      value={reactivateReason}
                      onChange={(e) => setReactivateReason(e.target.value)}
                      aria-required="true"
                      aria-describedby="reactivate-reason-hint"
                      rows={3}
                      maxLength={2000}
                      disabled={isReactivating}
                      data-testid="pipeline-reactivate-reason"
                      className="w-full bg-surface border border-border rounded-lg p-2 text-sm text-ink"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleReactivate}
                        disabled={isReactivating}
                        data-testid="pipeline-reactivate-submit"
                        className="bg-emerald-700 hover:opacity-90 text-white font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        {isReactivating ? t('detail.reactivate.saving') : t('detail.reactivate.submit')}
                      </button>
                      <button
                        onClick={() => {
                          setReactivateOpen(false);
                          setReactivateError(null);
                        }}
                        disabled={isReactivating}
                        data-testid="pipeline-reactivate-cancel"
                        className="border border-border text-ink-2 font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        {t('detail.reactivate.cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {reactivateError && (
                  <p role="alert" data-testid="pipeline-reactivate-error" className="mt-2 text-xs text-rose-800">
                    {reactivateError}
                  </p>
                )}

                {canWithdraw && !withdrawOpen && (
                  <button
                    onClick={() => {
                      setWithdrawError(null);
                      setWithdrawOpen(true);
                    }}
                    data-testid="pipeline-withdraw-open"
                    className="mt-3 border border-rose-300 text-rose-800 hover:bg-rose-50 font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer"
                  >
                    {t('detail.withdraw.open')}
                  </button>
                )}

                {canWithdraw && withdrawOpen && (
                  <div className="mt-3 space-y-2" data-testid="pipeline-withdraw-form">
                    <label htmlFor="withdraw-reason" className="block text-xs font-semibold text-ink">
                      {t('detail.withdraw.reasonLabel')}
                    </label>
                    <p id="withdraw-reason-hint" className="text-xs text-muted">
                      {t('detail.withdraw.reasonHint')}
                    </p>
                    <textarea
                      id="withdraw-reason"
                      value={withdrawReason}
                      onChange={(e) => setWithdrawReason(e.target.value)}
                      aria-required="true"
                      aria-describedby="withdraw-reason-hint"
                      rows={3}
                      maxLength={2000}
                      disabled={isWithdrawing}
                      data-testid="pipeline-withdraw-reason"
                      className="w-full bg-surface border border-border rounded-lg p-2 text-sm text-ink"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleWithdraw}
                        disabled={isWithdrawing}
                        data-testid="pipeline-withdraw-submit"
                        className="bg-rose-700 hover:opacity-90 text-white font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        {isWithdrawing ? t('detail.withdraw.saving') : t('detail.withdraw.submit')}
                      </button>
                      <button
                        onClick={() => {
                          setWithdrawOpen(false);
                          setWithdrawError(null);
                        }}
                        disabled={isWithdrawing}
                        data-testid="pipeline-withdraw-cancel"
                        className="border border-border text-ink-2 font-semibold py-2 px-4 rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        {t('detail.withdraw.cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {withdrawError && (
                  <p role="alert" data-testid="pipeline-withdraw-error" className="mt-2 text-xs text-rose-800">
                    {withdrawError}
                  </p>
                )}

                {decisions.length > 0 && (
                  <div className="mt-4" data-testid="pipeline-decision-log">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                      {t('detail.withdraw.logTitle')}
                    </h4>
                    <ol className="space-y-2">
                      {decisions.map((d) => (
                        <li key={d.id} className="text-xs text-ink-2 border-l-2 border-border pl-3">
                          <span className="font-semibold text-ink">{t(`detail.withdraw.kind.${d.kind}`)}</span>
                          <span className="text-muted"> · {new Date(d.decidedAt).toLocaleString(locale)}</span>
                          <p className="whitespace-pre-line break-words">{d.reason}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>

              {g0ReasonsVisible(boxMode) && g0.reasons.length > 0 && (
                <div className="bg-ground border border-border p-4 rounded-xl">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    {t('detail.scoreReasons')}
                  </h3>
                  <ul className="list-disc list-inside text-xs text-ink-2 space-y-1">
                    {g0.reasons.map((reason) => (
                      <li key={reason.code}>{reasonText(reason)}</li>
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
            <>
              <EffortTracker opportunityId={opportunity.id} efforts={efforts} />
              {/* The tenant-wide roll-up of these rows; M5 is already open on this page. */}
              <Link
                href={getWorkspaceRoute('reportsPersonDays', locale, workspace)}
                data-testid="pipeline-person-days-link"
                className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
              >
                {t('detail.personDaysReport')} →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
