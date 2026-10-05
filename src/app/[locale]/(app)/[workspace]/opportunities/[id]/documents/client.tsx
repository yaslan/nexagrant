'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  FileText,
  ShieldCheck,
  Award,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  Sparkles,
  FileCode,
  Landmark,
  Plus,
  RotateCw,
  Eye,
  X,
} from 'lucide-react';
import {
  generateStandardDoc,
  signDocument,
  createNewVersion,
  submitDualApprovalAction,
  departmentApproveAction,
  type DualApprovalActionResult,
} from '@/modules/m10/server/actions';
import type {
  ApprovalStage,
  Department,
  DualApprovalRefusal,
  DualApprovalState,
} from '@/lib/dual-approval';
import { errorMessage } from '@/lib/errors';
import {
  documentKindRequiresDualApproval,
  knownDocumentKind,
  type FollowupDocKind,
} from '@/lib/followup-doc-kinds';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

export interface DocItem {
  id: string;
  kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK' | string;
  version: number;
  contentUrl?: string | null;
  signedAt?: Date | string | null;
  createdAt: Date | string;
  contentText?: string;
  /** The stored flow for this document, or null when it was never submitted. */
  approval?: DualApprovalState | null;
}

interface DocumentsClientProps {
  opportunityId: string;
  opportunityTitle: string;
  documents: DocItem[];
  /** The flow the page found open, so a reload does not lose a sign-off. */
  initialApproval?: DualApprovalState | null;
}

/**
 * How far the four-step banner is lit.
 *
 * The banner used to be static markup: four coloured boxes that read
 * "2. Finans Onayı" / "3. Hukuk Onayı" whatever the documents underneath were,
 * for a tenant that had never approved anything — while
 * `submitDualApprovalAction` and `departmentApproveAction` had no caller at all
 * outside their unit test. It is now driven by the state those two actions
 * return, so a lit step means a real call with a real session actor behind it,
 * and no document in the flow means no step is lit.
 */
const STAGE_INDEX: Record<ApprovalStage, number> = {
  DRAFT: 0,
  PENDING_FINANCE_APPROVAL: 1,
  PENDING_LEGAL_APPROVAL: 2,
  APPROVED_AND_SIGNED: 3,
  REJECTED: 0,
};

export function DocumentsClient({
  opportunityId,
  opportunityTitle,
  documents: initialDocs,
  initialApproval = null,
}: DocumentsClientProps) {
  const t = useTranslations('m10');
  const locale = useLocale();
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'LEGAL' | 'COMMITMENT' | 'AWARD'>('ALL');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const [approval, setApproval] = useState<DualApprovalState | null>(initialApproval);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  // Only an ended pilot is said here; the other document failures stay in the console, as before.
  const [docError, setDocError] = useState<string | null>(null);
  // A refused signature is said under the row that was clicked: the page-top
  // alert sat a screen above the table, off-screen, and the click looked like
  // it did nothing (İNCELEME-65 Y-1).
  const [signError, setSignError] = useState<{ docId: string; text: string } | null>(null);
  const errorText = useActionErrorText();

  const formatDate = (value: Date | string) => new Date(value).toLocaleDateString(locale);
  const formatDateTime = (value: Date | string) => new Date(value).toLocaleString(locale);

  const handleGenerateDoc = async (kind: FollowupDocKind) => {
    setIsGenerating(true);
    setDocError(null);
    try {
      // The action reads the tenant and user from the session.
      const res = await generateStandardDoc(opportunityId, kind);
      const newDoc: DocItem = {
        id: res.id || `doc-${Date.now()}`,
        kind: res.kind || kind,
        version: res.version || 1,
        contentUrl: res.contentUrl,
        signedAt: res.signedAt || null,
        createdAt: new Date().toISOString(),
        contentText: res.contentText,
      };
      setDocs((prev) => [newDoc, ...prev]);
    } catch (err) {
      console.error('Error generating document:', err);
      setDocError(errorText(err, null));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSignDoc = async (docId: string) => {
    setSignError(null);
    try {
      const res = await signDocument(docId);
      if (!res.success) {
        // NDA/LOI/COMMITMENT are signed by the dual approval flow, not here.
        setSignError({ docId, text: t(`signRefusal.${res.refusal}`) });
        return;
      }
      const signedAt = new Date(res.signedAt).toISOString();
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, signedAt } : d)));
    } catch (err) {
      console.error('Error signing document:', err);
      const text = errorText(err, null);
      if (text) setSignError({ docId, text });
    }
  };

  const handleCreateNewVersion = async (docId: string) => {
    setDocError(null);
    try {
      const res = await createNewVersion(docId);
      const updatedDoc = res.updatedDoc;
      if (updatedDoc) {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  version: updatedDoc.version,
                  signedAt: null,
                  // The server dropped this revision's inherited sign-off; the
                  // banner must not keep showing it.
                  approval: null,
                  contentUrl: updatedDoc.contentUrl,
                }
              : d
          )
        );
        setApproval((prev) => (prev?.docId === docId ? null : prev));
      }
    } catch (err) {
      console.error('Error updating document version:', err);
      setDocError(errorText(err, null));
    }
  };

  /** A refusal from the server is copy the user can act on, not a stack trace. */
  const refusalMessage = (refusal: DualApprovalRefusal) => t(`approval.refusal.${refusal}`);

  /** Keeps the row and the banner telling the same story after every step. */
  const applyResult = (res: DualApprovalActionResult) => {
    if (!res.success) {
      if (res.approvalState) setApproval(res.approvalState);
      setApprovalError(refusalMessage(res.refusal));
      return;
    }
    const next = res.approvalState;
    setApproval(next);
    setDocs((prev) =>
      prev.map((d) => (d.id === next.docId ? { ...d, signedAt: res.signedAt, approval: next } : d))
    );
  };

  /** Puts one real document into the workflow. The actor comes from the session. */
  const handleSubmitForApproval = async (docId: string) => {
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      applyResult(await submitDualApprovalAction(docId));
    } catch (err) {
      setApprovalError(errorText(err, () => errorMessage(err, t('approval.error'))));
    } finally {
      setApprovalBusy(false);
    }
  };

  /**
   * One department sign-off.
   *
   * The action is told which document and which department, nothing more: the
   * workflow state it acts on is the one in the database, not one this component
   * hands it. The legal step writes the signature in the same transaction, so
   * step 4 lit here means `FollowupDoc.signedAt` is set — and every step before
   * it is a row too, which is why a reload no longer empties the banner.
   */
  const handleDepartmentApprove = async (department: Department) => {
    if (!approval) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      applyResult(await departmentApproveAction(approval.docId, department));
    } catch (err) {
      setApprovalError(errorText(err, () => errorMessage(err, t('approval.error'))));
    } finally {
      setApprovalBusy(false);
    }
  };

  // Filters, labels and badges go by the normalised kind: a stored `"NDA "`
  // is an NDA and belongs in the legal filter, not hidden from it (İNCELEME-65 B-1).
  const filteredDocs = docs.filter((d) => {
    const kind = knownDocumentKind(d.kind);
    if (activeFilter === 'LEGAL') return kind === 'NDA' || kind === 'LOI';
    if (activeFilter === 'COMMITMENT') return kind === 'COMMITMENT';
    if (activeFilter === 'AWARD') return kind === 'AWARD_PACK' || kind === 'ESR_DEBRIEF';
    return true;
  });

  const docKindLabel = (kind: string) => {
    const known = knownDocumentKind(kind);
    return known ? t(`kinds.${known}`) : kind;
  };

  const getDocKindBadge = (kind: string) => {
    const label = docKindLabel(kind);
    switch (knownDocumentKind(kind)) {
      case 'NDA':
        return <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold text-xs">{label}</span>;
      case 'LOI':
        return <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold text-xs">{label}</span>;
      case 'COMMITMENT':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold text-xs">{label}</span>;
      case 'AWARD_PACK':
        return <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold text-xs">{label}</span>;
      case 'ESR_DEBRIEF':
        return <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold text-xs">{label}</span>;
      default:
        return <span className="bg-surface-hover text-ink px-2.5 py-0.5 rounded-full font-bold text-xs">{label}</span>;
    }
  };

  const approvalDoc = approval ? docs.find((d) => d.id === approval.docId) : undefined;
  const currentStep = approval ? STAGE_INDEX[approval.stage] : -1;
  const steps = [t('approval.stage1'), t('approval.stage2'), t('approval.stage3'), t('approval.stage4')];

  const stepState = (index: number): 'done' | 'active' | 'idle' => {
    if (currentStep < 0) return 'idle';
    // The last stage is an outcome, not a step still waiting on somebody.
    if (approval?.stage === 'APPROVED_AND_SIGNED') return 'done';
    if (index < currentStep) return 'done';
    if (index === currentStep) return 'active';
    return 'idle';
  };

  const STEP_CLASS: Record<'done' | 'active' | 'idle', string> = {
    done: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    active: 'bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-300',
    idle: 'bg-ground border-border text-muted',
  };

  return (
    <div className="space-y-6">
      {docError && (
        <p role="alert" className="bg-bad/10 border border-bad/30 rounded-xl p-4 text-sm font-semibold text-bad">
          {docError}
        </p>
      )}
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <FileSignature className="w-4 h-4 text-blue-400" />
              <span>{t('header.module')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              {t('header.title')}
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              {t('header.opportunity')}: <strong className="text-slate-200">{opportunityTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full font-mono font-bold">
              {t('header.docCount', { count: docs.length })}
            </span>
          </div>
        </div>

        {/* TÜBİTAK Eşik Üstü Award Highlight Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-amber-300">{t('award.title')}</h4>
              <p className="text-[11px] text-slate-300">{t('award.description')}</p>
            </div>
          </div>

          <button
            onClick={() => handleGenerateDoc('AWARD_PACK')}
            disabled={isGenerating}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-4 py-2 rounded-xl transition text-xs shadow-md shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t('award.generate')}</span>
          </button>
        </div>
      </div>

      {/* ──────────────────────── DUAL APPROVAL STEPPER BANNER ──────────────────────── */}
      <div
        data-testid="dual-approval-banner"
        data-approval-stage={approval?.stage ?? 'NONE'}
        className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-xs text-ink uppercase tracking-wider">
              {t('approval.title')}
            </h3>
          </div>
          <span className="text-[11px] bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-semibold">
            {t('approval.badge')}
          </span>
        </div>

        {approval && approvalDoc ? (
          <p className="text-[11px] text-ink-2" data-testid="approval-subject">
            {t('approval.inFlow', {
              doc: docKindLabel(approvalDoc.kind),
              version: approvalDoc.version,
              actor: approval.submittedBy,
            })}
          </p>
        ) : (
          <p className="text-[11px] text-muted" data-testid="approval-idle">
            {t('approval.idle')}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs pt-1">
          {steps.map((label, index) => {
            const state = stepState(index);
            return (
              <div
                key={label}
                data-testid={`approval-step-${index + 1}`}
                data-state={state}
                className={`p-2.5 rounded-xl border font-bold flex flex-col items-center gap-1 ${STEP_CLASS[state]}`}
              >
                <span className="text-[10px] uppercase opacity-70">
                  {t('approval.stageLabel', { n: index + 1 })}
                </span>
                <span>{label}</span>
                <span className="text-[10px] font-semibold opacity-80">
                  {t(`approval.status.${state}`)}
                </span>
              </div>
            );
          })}
        </div>

        {approval && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {approval.stage === 'PENDING_FINANCE_APPROVAL' && (
              <button
                data-testid="approve-finance"
                onClick={() => handleDepartmentApprove('FINANCE')}
                disabled={approvalBusy}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg transition font-semibold text-xs"
              >
                {t('approval.approveFinance')}
              </button>
            )}

            {approval.stage === 'PENDING_LEGAL_APPROVAL' && (
              <button
                data-testid="approve-legal"
                onClick={() => handleDepartmentApprove('LEGAL')}
                disabled={approvalBusy}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg transition font-semibold text-xs"
              >
                {t('approval.approveLegal')}
              </button>
            )}

            {approval.stage === 'APPROVED_AND_SIGNED' && (
              <span
                data-testid="approval-complete"
                className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-bold"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {t('approval.completed')}
              </span>
            )}

            <button
              data-testid="approval-close"
              onClick={() => {
                setApproval(null);
                setApprovalError(null);
              }}
              className="px-3 py-1.5 bg-surface-hover hover:bg-slate-200 text-ink rounded-lg transition font-semibold text-xs"
            >
              {t('approval.close')}
            </button>
          </div>
        )}

        {approvalError && (
          <p data-testid="approval-error" className="text-[11px] text-red-700 font-semibold">
            {approvalError}
          </p>
        )}

        {approval && approval.auditTrail.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            <h4 className="text-[11px] font-bold text-ink-2 uppercase tracking-wider">
              {t('approval.auditTitle')}
            </h4>
            <ul className="space-y-1" data-testid="approval-audit">
              {approval.auditTrail.map((entry) => (
                <li key={entry.id} className="text-[11px] text-muted font-mono">
                  {formatDateTime(entry.timestamp)} · {entry.department} · {entry.actorName}
                  {entry.note ? ` — ${entry.note}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-muted pt-1">{t('approval.note')}</p>
      </div>

      {/* ──────────────────────── QUICK ACTIONS & GENERATORS ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-sm text-ink flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-600" />
          <span>{t('generate.title')}</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => handleGenerateDoc('NDA')}
            disabled={isGenerating}
            className="p-3 bg-blue-50/70 hover:bg-blue-100/80 border border-blue-200 text-blue-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>{t('generate.nda')}</span>
          </button>

          <button
            onClick={() => handleGenerateDoc('LOI')}
            disabled={isGenerating}
            className="p-3 bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>{t('generate.loi')}</span>
          </button>

          <button
            onClick={() => handleGenerateDoc('COMMITMENT')}
            disabled={isGenerating}
            className="p-3 bg-emerald-50/70 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{t('generate.commitment')}</span>
          </button>

          <button
            onClick={() => handleGenerateDoc('ESR_DEBRIEF')}
            disabled={isGenerating}
            className="p-3 bg-purple-50/70 hover:bg-purple-100/80 border border-purple-200 text-purple-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <FileCode className="w-4 h-4 text-purple-600" />
            <span>{t('generate.esr')}</span>
          </button>
        </div>
      </div>

      {/* ──────────────────────── FILTER TABS & TABLE ──────────────────────── */}
      <div className="space-y-4">
        <div className="flex border-b border-border gap-2">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'ALL'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t('filters.all', { count: docs.length })}
          </button>

          <button
            onClick={() => setActiveFilter('LEGAL')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'LEGAL'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t('filters.legal')}
          </button>

          <button
            onClick={() => setActiveFilter('COMMITMENT')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'COMMITMENT'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t('filters.commitment')}
          </button>

          <button
            onClick={() => setActiveFilter('AWARD')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'AWARD'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t('filters.award')}
          </button>
        </div>

        {/* Documents Grid / Table */}
        <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-4">{t('table.kind')}</th>
                <th className="p-4">{t('table.version')}</th>
                <th className="p-4">{t('table.created')}</th>
                <th className="p-4">{t('table.status')}</th>
                <th className="p-4 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDocs.map((doc) => (
                <React.Fragment key={doc.id}>
                <tr className="hover:bg-ground/80 transition-colors">
                  <td className="p-4 font-semibold text-ink">
                    {getDocKindBadge(doc.kind)}
                  </td>
                  <td className="p-4 font-mono font-bold text-ink-2">
                    v{doc.version}
                  </td>
                  <td className="p-4 text-muted font-mono">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="p-4">
                    {doc.signedAt ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        {t('table.signed', { date: formatDate(doc.signedAt) })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        {t('table.pending')}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {doc.contentText && (
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="px-2.5 py-1 bg-surface-hover hover:bg-slate-200 text-ink rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t('table.preview')}</span>
                        </button>
                      )}

                      {!doc.signedAt && !doc.approval && approval?.docId !== doc.id && (
                        <button
                          data-testid={`submit-approval-${doc.id}`}
                          onClick={() => handleSubmitForApproval(doc.id)}
                          disabled={approvalBusy}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 disabled:opacity-60 rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        >
                          <Landmark className="w-3.5 h-3.5" />
                          <span>{t('table.submitForApproval')}</span>
                        </button>
                      )}

                      {/* A dual approval kind is signed by the flow's legal step; a
                          direct button there could only be refused (İNCELEME-65 Ö-2). */}
                      {!doc.signedAt && !documentKindRequiresDualApproval(doc.kind) && (
                        <button
                          data-testid={`sign-${doc.id}`}
                          onClick={() => handleSignDoc(doc.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          <span>{t('table.sign')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleCreateNewVersion(doc.id)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        title={t('table.revisionTitle')}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>{t('table.revision', { version: doc.version + 1 })}</span>
                      </button>

                      <a
                        href={`/api/documents/export?type=${doc.kind}&format=docx&opportunityId=${opportunityId}&locale=${locale}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        title={t('table.docxTitle')}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('table.docx')}</span>
                      </a>

                      <a
                        href={`/api/documents/export?type=${doc.kind}&format=pdf&opportunityId=${opportunityId}&locale=${locale}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        title={t('table.pdfTitle')}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('table.pdf')}</span>
                      </a>
                    </div>
                  </td>
                </tr>
                {signError?.docId === doc.id && (
                  <tr>
                    <td colSpan={5} className="px-4 pb-4">
                      <p
                        role="alert"
                        data-testid={`sign-error-${doc.id}`}
                        // Sticky left and capped to the viewport: on a phone the table
                        // scrolls sideways to reach the button, and the text must not
                        // stay behind at the table's far left.
                        className="sticky left-4 w-fit max-w-[calc(100vw-7rem)] bg-bad/10 border border-bad/30 rounded-xl p-3 text-sm font-semibold text-bad"
                      >
                        {signError.text}
                      </p>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}

              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted text-xs">
                    {t('table.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────── PREVIEW MODAL ──────────────── */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                {getDocKindBadge(previewDoc.kind)}
                <span className="font-mono text-xs text-muted font-bold">v{previewDoc.version}</span>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                aria-label={t('preview.close')}
                className="p-1 rounded-lg hover:bg-surface-hover text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap font-sans leading-relaxed p-4 bg-ground border border-border rounded-xl">
              {previewDoc.contentText}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold"
              >
                {t('preview.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
