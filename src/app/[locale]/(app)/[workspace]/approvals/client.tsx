'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Role } from '@prisma/client';
import {
  submitApprovalRequestAction,
  approveRequestAction,
  rejectRequestAction,
  cancelRequestAction,
} from './actions';
import { DualApprovalActionType } from '@/lib/rbac';
import { errorMessage as toErrorMessage } from '@/lib/errors';

export interface ApprovalRequestItem {
  id: string;
  tenantId: string;
  workspaceId?: string | null;
  actionType: string;
  title: string;
  description?: string | null;
  payload: Record<string, unknown>;
  status: string;
  requiredRole: Role;
  requesterId: string;
  approverId?: string | null;
  rejectionReason?: string | null;
  auditHash?: string | null;
  expiresAt: string | Date;
  executedAt?: string | Date | null;
  createdAt: string | Date;
  requester?: { id: string; name?: string | null; email: string };
  approver?: { id: string; name?: string | null; email: string } | null;
}

interface ApprovalsClientProps {
  initialRequests: ApprovalRequestItem[];
  currentUserId: string;
  currentUserRole: Role;
  workspace: string;
  locale: string;
}

export default function ApprovalsClient({
  initialRequests,
  currentUserId,
  currentUserRole: _currentUserRole,
  workspace: _workspace,
  locale,
}: ApprovalsClientProps) {
  const t = useTranslations('Approvals');
  const [requests, setRequests] = useState<ApprovalRequestItem[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<'actionable' | 'my_requests' | 'history'>('actionable');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [rejectModalItem, setRejectModalItem] = useState<ApprovalRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedRequestDetails, setSelectedRequestDetails] = useState<ApprovalRequestItem | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Request Form State
  const [formActionType, setFormActionType] = useState<DualApprovalActionType>('GATE_G4_SUBMISSION');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPayloadJson, setFormPayloadJson] = useState('{\n  "opportunityId": "opp-1",\n  "notes": "Konsorsiyum mutabakatı tamamlandı."\n}');

  // Filter lists
  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const actionableRequests = pendingRequests.filter((r) => r.requesterId !== currentUserId);
  const myRequests = requests.filter((r) => r.requesterId === currentUserId);
  const historyRequests = requests.filter((r) => r.status !== 'PENDING');

  const handleApprove = async (req: ApprovalRequestItem) => {
    try {
      setLoadingId(req.id);
      setErrorMessage(null);
      const res = await approveRequestAction(req.id, t('statusApproved'));
      if (res.success) {
        setRequests((prev) =>
          prev.map((item) =>
            item.id === req.id
              ? { ...item, status: 'APPROVED', approverId: currentUserId, executedAt: new Date() }
              : item
          )
        );
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err) || t('errorApprove'));
    } finally {
      setLoadingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    try {
      setLoadingId(rejectModalItem.id);
      setErrorMessage(null);
      const res = await rejectRequestAction(rejectModalItem.id, rejectionReason);
      if (res.success) {
        setRequests((prev) =>
          prev.map((item) =>
            item.id === rejectModalItem.id
              ? { ...item, status: 'REJECTED', approverId: currentUserId, rejectionReason }
              : item
          )
        );
        setRejectModalItem(null);
        setRejectionReason('');
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err) || t('errorReject'));
    } finally {
      setLoadingId(null);
    }
  };

  const handleCancel = async (req: ApprovalRequestItem) => {
    if (!confirm(t('confirmCancel'))) return;
    try {
      setLoadingId(req.id);
      setErrorMessage(null);
      const res = await cancelRequestAction(req.id);
      if (res.success) {
        setRequests((prev) =>
          prev.map((item) => (item.id === req.id ? { ...item, status: 'CANCELLED' } : item))
        );
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err) || t('errorCancel'));
    } finally {
      setLoadingId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMessage(null);
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(formPayloadJson);
      } catch {
        throw new Error(t('errorInvalidPayload'));
      }

      const res = await submitApprovalRequestAction({
        actionType: formActionType,
        title: formTitle,
        description: formDescription,
        payload: parsedPayload,
      });

      if (res.success && res.request) {
        setRequests((prev) => [res.request, ...prev]);
        setIsNewModalOpen(false);
        setFormTitle('');
        setFormDescription('');
        setActiveTab('my_requests');
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err) || t('errorCreate'));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">⏳ {t('statusPending')}</span>;
      case 'APPROVED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">✓ {t('statusApproved')}</span>;
      case 'REJECTED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">✕ {t('statusRejected')}</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-hover text-ink dark:bg-gray-800 dark:text-gray-300">⊘ {t('statusCancelled')}</span>;
      case 'EXPIRED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">⏱ {t('statusExpired')}</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-hover text-ink">{status}</span>;
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'GATE_G4_SUBMISSION':
        return { label: t('actionTypeG4'), color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'BUDGET_ALLOCATION':
        return { label: t('actionTypeBudget'), color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'LEGAL_COMMITMENT':
        return { label: t('actionTypeLegal'), color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'MEMBER_ROLE_ELEVATION':
        return { label: t('actionTypeRoleElevation'), color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'SENSITIVE_SETTINGS_CHANGE':
        return { label: t('actionTypeSensitiveSettings'), color: 'bg-orange-50 text-orange-700 border-orange-200' };
      default:
        return { label: type, color: 'bg-ground text-ink-2 border-border' };
    }
  };

  const currentDisplayList =
    activeTab === 'actionable'
      ? actionableRequests
      : activeTab === 'my_requests'
      ? myRequests
      : historyRequests;

  return (
    <div className="space-y-6">
      {/* Top Banner with Alert / Error */}
      {errorMessage && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold text-lg">&times;</button>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border dark:border-gray-800 pb-4">
        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('actionable')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'actionable'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-ink-2 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 border border-border dark:border-gray-700/60'
            }`}
          >
            <span>{t('actionableTab')}</span>
            {actionableRequests.length > 0 && (
              <span className="bg-surface text-indigo-600 px-1.5 py-0.2 rounded-full text-xs font-bold">
                {actionableRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('my_requests')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'my_requests'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-ink-2 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 border border-border dark:border-gray-700/60'
            }`}
          >
            <span>{t('myRequestsTab')}</span>
            <span className="text-xs opacity-75">({myRequests.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-ink-2 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 border border-border dark:border-gray-700/60'
            }`}
          >
            <span>{t('historyTab')}</span>
          </button>
        </div>

        {/* New Request Button */}
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
        >
          <span>+</span>
          <span>{t('newRequest')}</span>
        </button>
      </div>

      {/* Requests Table / Cards */}
      {currentDisplayList.length === 0 ? (
        <div className="text-center py-16 bg-surface dark:bg-zinc-900 border border-dashed border-border dark:border-gray-800 rounded-2xl">
          <p className="text-muted text-sm">
            {activeTab === 'actionable'
              ? t('emptyActionable')
              : activeTab === 'my_requests'
              ? t('emptyMyRequests')
              : t('emptyHistory')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentDisplayList.map((req) => {
            const typeInfo = getActionTypeLabel(req.actionType);
            const isMaker = req.requesterId === currentUserId;

            return (
              <div
                key={req.id}
                className="p-5 bg-surface dark:bg-zinc-900 border border-border dark:border-gray-800 rounded-xl shadow-sm hover:border-border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium border ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    {getStatusBadge(req.status)}
                    {isMaker && (
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300">
                        👤 {t('makerBadge')}
                      </span>
                    )}
                    {req.requiredRole && (
                      <span className="text-xs text-muted">
                        {t('requiredRoleLabel')}: <strong>{req.requiredRole}</strong>
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-ink dark:text-white">{req.title}</h3>
                  {req.description && <p className="text-sm text-ink-2 dark:text-muted">{req.description}</p>}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
                    <span>
                      {t('requesterLabel')}: <strong>{req.requester?.name || req.requester?.email || req.requesterId}</strong>
                    </span>
                    <span>•</span>
                    <span>{t('dateLabel')}: {new Date(req.createdAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}</span>
                    {req.auditHash && (
                      <>
                        <span>•</span>
                        <span className="font-mono bg-surface-hover dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                          {t('hashLabel')}: {req.auditHash.substring(0, 10)}...
                        </span>
                      </>
                    )}
                    {req.rejectionReason && (
                      <div className="w-full text-red-600 dark:text-red-400 font-medium">
                        {t('reason')}: {req.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Button Bar */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => setSelectedRequestDetails(req)}
                    className="px-3 py-1.5 text-xs font-medium text-ink-2 dark:text-gray-300 bg-surface border border-border hover:bg-surface-hover dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {t('detailButton')}
                  </button>

                  {/* Actions for Checker */}
                  {req.status === 'PENDING' && !isMaker && (
                    <>
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={loadingId === req.id}
                        className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-all"
                      >
                        {loadingId === req.id ? t('processing') : `✓ ${t('approve')}`}
                      </button>
                      <button
                        onClick={() => {
                          setRejectModalItem(req);
                          setRejectionReason('');
                        }}
                        disabled={loadingId === req.id}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                      >
                        ✕ {t('reject')}
                      </button>
                    </>
                  )}

                  {/* Actions for Maker */}
                  {req.status === 'PENDING' && isMaker && (
                    <button
                      onClick={() => handleCancel(req)}
                      disabled={loadingId === req.id}
                      className="px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-red-600 bg-surface-hover dark:bg-gray-800 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      {t('cancel')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-zinc-900 border border-border dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink dark:text-white">{t('rejectModalTitle')}</h3>
            <p className="text-xs text-muted">
              {t('rejectModalHint')}
            </p>
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={t('rejectPlaceholder')}
                required
                rows={3}
                className="w-full text-sm p-3 border border-border dark:border-gray-700 rounded-lg bg-ground dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalItem(null)}
                  className="px-4 py-2 text-xs font-medium text-ink-2 dark:text-gray-300 bg-surface-hover dark:bg-gray-800 rounded-lg"
                >
                  {t('modalCancel')}
                </button>
                <button
                  type="submit"
                  disabled={loadingId === rejectModalItem.id || !rejectionReason.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-sm"
                >
                  {t('saveRejection')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details & Payload Modal */}
      {selectedRequestDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-zinc-900 border border-border dark:border-gray-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-ink dark:text-white">{selectedRequestDetails.title}</h3>
                <span className="text-xs text-muted">{t('requestIdLabel')}: {selectedRequestDetails.id}</span>
              </div>
              <button
                onClick={() => setSelectedRequestDetails(null)}
                className="text-muted hover:text-ink-2 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-ground dark:bg-zinc-800 rounded-lg font-mono text-[11px] overflow-auto max-h-48">
                <pre>{JSON.stringify(selectedRequestDetails.payload, null, 2)}</pre>
              </div>
              {selectedRequestDetails.auditHash && (
                <div className="text-[11px] text-muted break-all">
                  <strong>{t('cryptoHashLabel')}:</strong>
                  <br />
                  <span className="font-mono">{selectedRequestDetails.auditHash}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedRequestDetails(null)}
                className="px-4 py-2 text-xs font-medium text-ink-2 dark:text-gray-300 bg-surface-hover dark:bg-gray-800 rounded-lg"
              >
                {t('closeButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-zinc-900 border border-border dark:border-gray-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-ink dark:text-white">{t('newRequestModalTitle')}</h3>
              <button onClick={() => setIsNewModalOpen(false)} className="text-muted hover:text-ink-2 font-bold">
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">{t('actionTypeFieldLabel')}</label>
                <select
                  value={formActionType}
                  onChange={(e) => setFormActionType(e.target.value as DualApprovalActionType)}
                  className="w-full p-2.5 border border-border dark:border-gray-700 rounded-lg bg-ground dark:bg-zinc-800"
                >
                  <option value="GATE_G4_SUBMISSION">{t('actionTypeOptionG4')}</option>
                  <option value="BUDGET_ALLOCATION">{t('actionTypeOptionBudget')}</option>
                  <option value="LEGAL_COMMITMENT">{t('actionTypeOptionLegal')}</option>
                  <option value="MEMBER_ROLE_ELEVATION">{t('actionTypeOptionRoleElevation')}</option>
                  <option value="SENSITIVE_SETTINGS_CHANGE">{t('actionTypeOptionSensitive')}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">{t('titleFieldLabel')}</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={t('titlePlaceholder')}
                  required
                  className="w-full p-2.5 border border-border dark:border-gray-700 rounded-lg bg-ground dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">{t('descriptionFieldLabel')}</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  rows={2}
                  className="w-full p-2.5 border border-border dark:border-gray-700 rounded-lg bg-ground dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">{t('payloadFieldLabel')}</label>
                <textarea
                  value={formPayloadJson}
                  onChange={(e) => setFormPayloadJson(e.target.value)}
                  required
                  rows={4}
                  className="w-full p-2.5 font-mono text-[11px] border border-border dark:border-gray-700 rounded-lg bg-ground dark:bg-zinc-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-ink-2 dark:text-gray-300 bg-surface-hover dark:bg-gray-800 rounded-lg"
                >
                  {t('modalCancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  {t('submitCreate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
