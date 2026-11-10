'use client';

import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { getAllManifests, getManifest } from '@/lib/modules/registry';
import { ModuleId, ModuleStatus } from '@/lib/modules/types';
import { updateTenantModuleStatus } from './actions';
import { getDisableCascade } from '@/lib/modules/state-machine';
import { errorMessage as toErrorMessage } from '@/lib/errors';

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

interface AdminModulesClientProps {
  tenants: TenantSummary[];
  initialTenantId: string;
  initialStates: Record<string, Record<string, ModuleStatus>>; // tenantId -> moduleId -> ModuleStatus
}

export function AdminModulesClient({ tenants, initialTenantId, initialStates }: AdminModulesClientProps) {
  const t = useTranslations('adminModules');
  const manifests = getAllManifests();
  
  const [selectedTenantId, setSelectedTenantId] = useState<string>(initialTenantId || tenants[0]?.id || '');
  const [moduleStates, setModuleStates] = useState<Record<string, Record<string, ModuleStatus>>>(initialStates);
  const [cascadeModal, setCascadeModal] = useState<{ target: ModuleId; cascading: ModuleId[] } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tenantStates = moduleStates[selectedTenantId] || {};

  const getModuleStatus = (modId: string): ModuleStatus => {
    return tenantStates[modId] || 'OFF';
  };

  const getActiveModuleIds = (): ModuleId[] => {
    return Object.entries(tenantStates)
      .filter(([_, status]) => status === 'ON' || status === 'PILOT')
      .map(([id, _]) => id as ModuleId);
  };

  const handleStatusChange = (modId: ModuleId, targetStatus: ModuleStatus) => {
    setErrorMessage(null);
    const currentStatus = getModuleStatus(modId);
    if (currentStatus === targetStatus) return;

    const activeMods = getActiveModuleIds();

    if (targetStatus === 'OFF') {
      const cascade = getDisableCascade(modId, activeMods);
      if (cascade.length > 0) {
        setCascadeModal({ target: modId, cascading: cascade });
        return;
      }
    }

    applyStatusChange(modId, targetStatus);
  };

  const applyStatusChange = (modId: ModuleId, targetStatus: ModuleStatus) => {
    const modulesToOff = targetStatus === 'OFF' ? [modId, ...(cascadeModal?.cascading || [])] : [modId];
    setCascadeModal(null);

    startTransition(async () => {
      // Optimistic update
      setModuleStates(prev => {
        const tenantCopy = { ...(prev[selectedTenantId] || {}) };
        if (targetStatus === 'OFF') {
          for (const m of modulesToOff) {
            tenantCopy[m] = 'OFF';
          }
        } else {
          tenantCopy[modId] = targetStatus;
        }
        return { ...prev, [selectedTenantId]: tenantCopy };
      });

      try {
        await updateTenantModuleStatus(selectedTenantId, modId, targetStatus);
      } catch (e) {
        setErrorMessage(toErrorMessage(e) || t('updateFailed'));
        // Revert optimistic update
        setModuleStates(initialStates);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-8 sm:px-4">
      {/* Header & Tenant Filter */}
      <div className="bg-surface p-6 rounded-2xl border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-ink">{t('stateTitle')}</h1>
          <p className="text-xs text-muted mt-0.5">{t('stateDescription')}</p>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <label className="text-xs font-semibold text-ink whitespace-nowrap">{t('selectTenant')}</label>
          <select
            value={selectedTenantId}
            onChange={(e) => {
              setSelectedTenantId(e.target.value);
              setErrorMessage(null);
            }}
            className="border border-border rounded-xl px-3 py-2 text-xs bg-ground text-ink shadow-xs focus:outline-none focus:ring-2 focus:ring-accent w-full md:w-64"
          >
            {tenants.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-bad/15 border-l-4 border-bad p-4 rounded-xl text-bad text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold text-bad ml-4">&times;</button>
        </div>
      )}

      {/* Modules List */}
      <div className="grid gap-4">
        {manifests.map((mod) => {
          const currentStatus = getModuleStatus(mod.id);

          return (
            <div
              key={mod.id}
              className={`bg-surface border border-border rounded-xl p-5 shadow-xs transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
                isPending ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-xs font-bold bg-ground text-ink px-2.5 py-0.5 rounded border border-border">
                    {mod.id}
                  </span>
                  <h3 className="text-base font-bold text-ink">{mod.name}</h3>
                  <span className="text-[11px] text-muted font-mono">v{mod.version}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 pt-1">
                  <div>
                    <span className="font-semibold text-muted">{t('requires')}</span>
                    {mod.requires.length > 0 ? (
                      mod.requires.map(r => (
                        <span key={r} className="inline-block bg-ground border border-border px-1.5 py-0.5 rounded mr-1 font-mono text-[10px]">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">{t('none')}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-muted">{t('recommends')}</span>
                    {mod.recommends.length > 0 ? (
                      mod.recommends.map(r => (
                        <span key={r} className="inline-block bg-ground border border-border px-1.5 py-0.5 rounded mr-1 font-mono text-[10px]">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">{t('none')}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs text-muted pt-0.5">
                  <span className="font-semibold">{t('plans')}</span>
                  {mod.planTiers.map(tier => (
                    <span key={tier} className="uppercase text-[10px] bg-ground border border-border px-1.5 py-0.5 rounded font-mono">
                      {tier}
                    </span>
                  ))}
                  {mod.addOnSku && (
                    <span className="text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[10px]">
                      SKU: {mod.addOnSku}
                    </span>
                  )}
                </div>
              </div>

              {/* Status Selector Buttons */}
              <div className="flex items-center space-x-1.5 bg-ground p-1.5 rounded-xl border border-border w-full lg:w-auto justify-stretch lg:justify-end">
                {(['OFF', 'DEV', 'PILOT', 'ON'] as ModuleStatus[]).map((st) => {
                  const isCurrent = currentStatus === st;
                  
                  let activeStyle = '';
                  if (isCurrent) {
                    switch (st) {
                      case 'OFF': activeStyle = 'bg-ink text-surface shadow-2xs font-bold'; break;
                      case 'DEV': activeStyle = 'bg-accent text-white shadow-2xs font-bold'; break;
                      case 'PILOT': activeStyle = 'bg-amber text-white shadow-2xs font-bold'; break;
                      case 'ON': activeStyle = 'bg-ok text-white shadow-2xs font-bold'; break;
                    }
                  } else {
                    activeStyle = 'text-muted hover:bg-surface hover:text-ink';
                  }

                  return (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(mod.id as ModuleId, st)}
                      className={`flex-1 lg:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeStyle}`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cascade Confirmation Modal */}
      {cascadeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-border">
            <h2 className="text-lg font-bold text-ink flex items-center font-heading">
              {t('cascadeTitle')}
            </h2>
            <p className="text-xs text-ink-2">
              {t('cascadeLeadPrefix')} <strong className="text-ink">{getManifest(cascadeModal.target)?.name} ({cascadeModal.target})</strong> {t('cascadeLeadSuffix')}
            </p>

            <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 space-y-1">
              {cascadeModal.cascading.map(id => (
                <div key={id} className="text-xs font-semibold text-amber flex items-center">
                  <span className="w-2 h-2 rounded-full bg-amber mr-2"></span>
                  {getManifest(id)?.name} ({id})
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setCascadeModal(null)}
                className="px-4 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-surface-hover text-ink-2"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => applyStatusChange(cascadeModal.target, 'OFF')}
                className="px-4 py-2 text-xs font-semibold bg-bad text-white rounded-lg hover:opacity-90 shadow-2xs"
              >
                {t('disableDependents')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
