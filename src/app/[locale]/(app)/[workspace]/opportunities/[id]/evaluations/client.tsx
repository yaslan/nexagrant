'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { 
  Award, 
  Bot, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Scale, 
  FileCheck, 
  Sliders, 
  Zap, 
  RotateCcw,
  BookOpen,
  Info
} from 'lucide-react';
import { generateAiEvaluation, saveHumanEvaluation, calibrateESR } from '@/modules/m6/server/actions';
import { notesObject, type EvaluationNotes } from '@/modules/m6/types';

interface EvaluationItem {
  id: string;
  readerType: 'AI' | 'HUMAN';
  excellence: number;
  impact: number;
  implementation: number;
  weaknesses?: EvaluationNotes;
  calibration?: number | null;
  createdAt?: Date | string;
}


interface EvaluationsClientProps {
  opportunityId: string;
  opportunityTitle: string;
  evaluations: EvaluationItem[];
}

export function EvaluationsClient({
  opportunityId,
  opportunityTitle,
  evaluations: initialEvaluations,
}: EvaluationsClientProps) {
  const t = useTranslations('m6');
  const locale = useLocale();
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>(initialEvaluations);
  const [activeTab, setActiveTab] = useState<'evaluations' | 'rea' | 'calibration'>('evaluations');
  const [isAiLoading, setIsAiLoading] = useState(false);
  // The M6 actions now throw on a failed save instead of logging and returning
  // normally, so the page has to be able to tell the user something went wrong.
  const [actionError, setActionError] = useState<string | null>(null);
  const [isInnovationAction, setIsInnovationAction] = useState(false);

  // Human evaluation form state
  const [humanExcellence, setHumanExcellence] = useState('4.0');
  const [humanImpact, setHumanImpact] = useState('4.0');
  const [humanImplementation, setHumanImplementation] = useState('3.8');
  const [humanWeaknesses, setHumanWeaknesses] = useState('');
  const [humanStrengths, setHumanStrengths] = useState('');
  const [isSubmittingHuman, setIsSubmittingHuman] = useState(false);

  // Calibration state
  const [selectedEvalForCalibration, setSelectedEvalForCalibration] = useState<string>(
    evaluations[0]?.id || ''
  );
  const [actualEsrScore, setActualEsrScore] = useState('12.5');
  const [calibrationResult, setCalibrationResult] = useState<number | null>(null);

  // REA Checklist state
  const [reaChecklist, setReaChecklist] = useState<{ [key: string]: boolean }>({
    kpi: true,
    trl: true,
    gender: false,
    dec: true,
    risk: false,
    effort: true,
    openScience: false,
  });

  const handleToggleRea = (key: string) => {
    setReaChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRunAiEvaluation = async () => {
    setIsAiLoading(true);
    setActionError(null);
    try {
      // The action reads the tenant and user from the session; the browser
      // no longer names either.
      const result = await generateAiEvaluation(opportunityId);
      const newEval: EvaluationItem = {
        id: `ev-ai-${Date.now()}`,
        readerType: 'AI',
        excellence: result.excellence,
        impact: result.impact,
        implementation: result.implementation,
        weaknesses: {
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          recommendations: result.recommendations,
        },
        createdAt: new Date().toISOString(),
      };
      setEvaluations((prev) => [newEval, ...prev]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('errors.aiFailed'));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveHumanEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingHuman(true);
    setActionError(null);
    try {
      const exc = parseFloat(humanExcellence);
      const imp = parseFloat(humanImpact);
      const impl = parseFloat(humanImplementation);
      const weakList = humanWeaknesses.split('\n').filter((s) => s.trim().length > 0);
      const strList = humanStrengths.split('\n').filter((s) => s.trim().length > 0);

      await saveHumanEvaluation({
        opportunityId,
        excellence: exc,
        impact: imp,
        implementation: impl,
        weaknesses: weakList,
        strengths: strList,
      });

      const newEval: EvaluationItem = {
        id: `ev-human-${Date.now()}`,
        readerType: 'HUMAN',
        excellence: exc,
        impact: imp,
        implementation: impl,
        weaknesses: {
          strengths: strList,
          weaknesses: weakList,
        },
        createdAt: new Date().toISOString(),
      };
      setEvaluations((prev) => [newEval, ...prev]);
      setHumanWeaknesses('');
      setHumanStrengths('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('errors.saveFailed'));
    } finally {
      setIsSubmittingHuman(false);
    }
  };

  const handleCalibrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvalForCalibration) return;

    const actual = parseFloat(actualEsrScore);
    setActionError(null);
    try {
      const res = await calibrateESR(selectedEvalForCalibration, actual);

      setCalibrationResult(res.calibration);
      setEvaluations((prev) =>
        prev.map((ev) =>
          ev.id === selectedEvalForCalibration ? { ...ev, calibration: res.calibration } : ev
        )
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('errors.calibrationFailed'));
    }
  };

  // Compute G3 Gate Eligibility
  const humanCount = evaluations.filter((e) => e.readerType === 'HUMAN').length;
  const aiCount = evaluations.filter((e) => e.readerType === 'AI').length;
  const meetsEvaluatorCount = humanCount >= 2 || (humanCount >= 1 && aiCount >= 1);

  const calculateTotal = (e: EvaluationItem) => {
    const impactVal = isInnovationAction ? e.impact * 1.5 : e.impact;
    return e.excellence + impactVal + e.implementation;
  };

  const avgTotalScore =
    evaluations.length > 0
      ? (
          evaluations.reduce((acc, ev) => acc + calculateTotal(ev), 0) / evaluations.length
        ).toFixed(1)
      : '0.0';

  const meetsScoreThreshold = Number(avgTotalScore) >= 12.0;
  const passesG3Gate = meetsEvaluatorCount && meetsScoreThreshold;

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 4.0) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 3.0) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div
          role="alert"
          data-testid="m6-action-error"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <Award className="w-4 h-4 text-blue-400" />
              <span>{t('moduleLabel')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              {t('lensTitle')}
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              {t.rich('opportunityLabel', {
                title: opportunityTitle,
                strong: (chunks) => <strong className="text-slate-200">{chunks}</strong>,
              })}
            </p>
          </div>

          {/* CLAUDE.md — Evaluator Lens output is never presented as an official score.
              The copy was hard-coded Turkish, so an English reader saw no disclaimer they
              could read. It now comes from the same m6 keys the panel surfaces use. */}
          <div
            className="bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2.5 shadow-xs shrink-0 max-w-sm"
            data-testid="m6-internal-badge"
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
            <span>
              <strong>{t('internalPreAssessment')}:</strong> {t('internalPreAssessmentBody')}
            </span>
          </div>
        </div>

        {/* Top Metric Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('metrics.avgScore')}</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {avgTotalScore} <span className="text-xs text-muted">{t('metrics.outOf15')}</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('metrics.evaluatorCount')}</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {evaluations.length}{' '}
              <span className="text-xs text-muted">
                {t('metrics.evaluatorBreakdown', { human: humanCount, ai: aiCount })}
              </span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('metrics.g3GateStatus')}</span>
            <span className={`text-sm font-bold font-mono mt-1 flex items-center gap-1.5 ${passesG3Gate ? 'text-emerald-400' : 'text-amber-400'}`}>
              {passesG3Gate ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {t('metrics.g3Ready')}
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {t('metrics.g3Incomplete')}
                </>
              )}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-muted block text-[11px]">{t('metrics.iaMultiplierLabel')}</span>
              <span className="text-xs font-bold text-blue-300 mt-0.5 block">
                {isInnovationAction ? t('metrics.iaActive') : t('metrics.iaInactive')}
              </span>
            </div>
            <button
              onClick={() => setIsInnovationAction(!isInnovationAction)}
              className={`p-1.5 rounded-lg border transition ${isInnovationAction ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-700 text-slate-300 border-slate-600'}`}
              title={t('metrics.iaToggleTitle')}
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('evaluations')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'evaluations'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink hover:bg-ground'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>{t('tabs.evaluations')}</span>
          <span className="bg-slate-200 text-ink-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
            {evaluations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('rea')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'rea'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink hover:bg-ground'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>{t('tabs.rea')}</span>
          <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
            {t('tabs.reaBadge')}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('calibration')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'calibration'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink hover:bg-ground'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>{t('tabs.calibration')}</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 1: EVALUATIONS & SCORE CARDS ──────────────────────── */}
      {activeTab === 'evaluations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Actions & Form (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* AI Evaluator Action Box */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-indigo-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/40 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">{t('ai.title')}</h3>
                    <p className="text-[11px] text-slate-300">{t('ai.subtitle')}</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded-full">
                  {t('ai.creditBadge', { count: 3 })}
                </span>
              </div>

              <button
                onClick={handleRunAiEvaluation}
                disabled={isAiLoading}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition shadow-md flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                {isAiLoading ? (
                  <>
                    <Zap className="w-4 h-4 animate-spin" />
                    <span>{t('ai.loading')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{t('ai.startButton')}</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-muted flex items-center gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>{t('ai.description')}</span>
              </div>
            </div>

            {/* Human Evaluation Form Box */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-ink">{t('human.title')}</h3>
              </div>

              <form onSubmit={handleSaveHumanEvaluation} className="space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-ink-2">{t('human.excellenceLabel')}</label>
                    <span className="font-mono font-bold text-blue-600">{t('human.outOf5', { value: humanExcellence })}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={humanExcellence}
                    onChange={(e) => setHumanExcellence(e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-ink-2">{t('human.impactLabel')}</label>
                    <span className="font-mono font-bold text-blue-600">{t('human.outOf5', { value: humanImpact })}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={humanImpact}
                    onChange={(e) => setHumanImpact(e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-ink-2">{t('human.implementationLabel')}</label>
                    <span className="font-mono font-bold text-blue-600">{t('human.outOf5', { value: humanImplementation })}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={humanImplementation}
                    onChange={(e) => setHumanImplementation(e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">{t('human.strengthsLabel')}</label>
                  <textarea
                    rows={2}
                    value={humanStrengths}
                    onChange={(e) => setHumanStrengths(e.target.value)}
                    placeholder={t('human.strengthsPlaceholder')}
                    className="w-full border border-border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">{t('human.weaknessesLabel')}</label>
                  <textarea
                    rows={2}
                    value={humanWeaknesses}
                    onChange={(e) => setHumanWeaknesses(e.target.value)}
                    placeholder={t('human.weaknessesPlaceholder')}
                    className="w-full border border-border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingHuman}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{isSubmittingHuman ? t('human.saving') : t('human.saveButton')}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Evaluations Feed (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="font-bold text-sm text-ink flex items-center justify-between">
              <span>{t('feed.title')}</span>
              <span className="text-xs font-normal text-muted">
                {t('feed.hint')}
              </span>
            </h3>

            {evaluations.length === 0 ? (
              <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted space-y-2">
                <BookOpen className="w-8 h-8 text-muted mx-auto" />
                <p className="font-semibold text-sm">{t('feed.emptyTitle')}</p>
                <p className="text-xs">{t('feed.emptyBody')}</p>
              </div>
            ) : (
              evaluations.map((ev) => {
                const total = calculateTotal(ev).toFixed(1);
                const isPassed = Number(total) >= 10.0;

                return (
                  <div
                    key={ev.id}
                    className="bg-surface border border-border rounded-2xl p-5 shadow-2xs space-y-4 hover:border-border transition"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        {ev.readerType === 'AI' ? (
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            <Bot className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                            <UserCheck className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-xs text-ink block leading-none">
                            {ev.readerType === 'AI' ? t('feed.aiReader') : t('feed.humanReader')}
                          </span>
                          <span className="text-[10px] text-muted font-mono">
                            {ev.createdAt ? new Date(ev.createdAt).toLocaleDateString(locale) : t('feed.today')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${getScoreColor(Number(total) / 3)}`}>
                          {t('feed.totalScore', {
                            total,
                            status: isPassed ? t('feed.aboveThreshold') : t('feed.belowThreshold'),
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown Meters */}
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-ground border border-border p-2.5 rounded-xl text-center">
                        <span className="text-[10px] text-muted font-medium block">{t('feed.excellenceLabel')}</span>
                        <span className="font-bold text-sm font-mono text-ink">{t('human.outOf5', { value: ev.excellence.toFixed(1) })}</span>
                      </div>

                      <div className="bg-ground border border-border p-2.5 rounded-xl text-center">
                        <span className="text-[10px] text-muted font-medium block">
                          {t('feed.impactLabel')} {isInnovationAction && t('feed.impactMultiplierSuffix')}
                        </span>
                        <span className="font-bold text-sm font-mono text-ink">
                          {t('human.outOf5', { value: (isInnovationAction ? ev.impact * 1.5 : ev.impact).toFixed(1) })}
                        </span>
                      </div>

                      <div className="bg-ground border border-border p-2.5 rounded-xl text-center">
                        <span className="text-[10px] text-muted font-medium block">{t('feed.implementationLabel')}</span>
                        <span className="font-bold text-sm font-mono text-ink">{t('human.outOf5', { value: ev.implementation.toFixed(1) })}</span>
                      </div>
                    </div>

                    {/* Strengths & Weaknesses */}
                    {(() => {
                      const notes = notesObject(ev.weaknesses);
                      const strengths = notes?.strengths ?? [];
                      const weaknessList = Array.isArray(ev.weaknesses)
                        ? ev.weaknesses
                        : notes?.weaknesses ?? [];
                      if (strengths.length === 0 && weaknessList.length === 0) return null;

                      return (
                        <div className="space-y-2 text-xs pt-1">
                          {strengths.length > 0 && (
                            <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-xl">
                              <span className="font-bold text-emerald-800 flex items-center gap-1 mb-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                {t('feed.detectedStrengths')}
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-emerald-900">
                                {strengths.map((s, idx) => (
                                  <li key={idx}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {weaknessList.length > 0 && (
                            <div className="bg-rose-50/60 border border-rose-100 p-3 rounded-xl">
                              <span className="font-bold text-rose-800 flex items-center gap-1 mb-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                {t('feed.detectedWeaknesses')}
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-rose-900">
                                {weaknessList.map((w, idx) => (
                                  <li key={idx}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 2: REA CHECKLIST ──────────────────────── */}
      {activeTab === 'rea' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-600" />
              <span>{t('rea.title')}</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              {t('rea.description')}
            </p>
          </div>

          <div className="space-y-3">
            {(['kpi', 'trl', 'gender', 'dec', 'risk', 'effort', 'openScience'] as const).map((key) => (
              <div
                key={key}
                onClick={() => handleToggleRea(key)}
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                  reaChecklist[key]
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                    : 'bg-ground border-border text-ink-2 hover:bg-surface-hover/80'
                }`}
              >
                <div
                  className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition ${
                    reaChecklist[key]
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-surface border-border'
                  }`}
                >
                  {reaChecklist[key] && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h4 className="font-bold text-xs">{t(`rea.items.${key}.title`)}</h4>
                  <p className="text-[11px] opacity-80 mt-0.5">{t(`rea.items.${key}.desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 3: ESR CALIBRATION ──────────────────────── */}
      {activeTab === 'calibration' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-600" />
              <span>{t('calibration.title')}</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              {t('calibration.description')}
            </p>
          </div>

          <form onSubmit={handleCalibrate} className="space-y-4 max-w-md">
            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">
                {t('calibration.selectLabel')}
              </label>
              <select
                value={selectedEvalForCalibration}
                onChange={(e) => setSelectedEvalForCalibration(e.target.value)}
                className="w-full border border-border rounded-xl p-2.5 text-xs bg-ground focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {evaluations.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.readerType === 'AI' ? t('calibration.aiOption') : t('calibration.humanOption')}{' '}
                    {t('calibration.scoreSuffix', {
                      value: (ev.excellence + ev.impact + ev.implementation).toFixed(1),
                    })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">
                {t('calibration.officialScoreLabel')}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="15"
                value={actualEsrScore}
                onChange={(e) => setActualEsrScore(e.target.value)}
                className="w-full border border-border rounded-xl p-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-xl transition text-xs shadow-sm flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('calibration.submitButton')}</span>
            </button>
          </form>

          {calibrationResult !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs space-y-1">
              <span className="font-bold text-blue-900 block">{t('calibration.resultLabel')}</span>
              <p className="text-blue-800 font-mono text-sm">
                {t('calibration.deviationLabel', {
                  value: calibrationResult > 0 ? `+${calibrationResult}` : calibrationResult,
                })}
              </p>
              <p className="text-[11px] text-blue-700">
                {Math.abs(calibrationResult) <= 0.5
                  ? t('calibration.goodMessage')
                  : t('calibration.driftMessage')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
