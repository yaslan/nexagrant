'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ModuleId } from './types';
import { getManifest } from './registry';

/** A module open as a preview rather than finished (`ModuleStatus` minus ON/OFF). */
export type ModulePreviewStatus = 'PILOT' | 'DEV';

interface ModuleContextType {
  activeModules: ModuleId[];
  previewStatus: Partial<Record<ModuleId, ModulePreviewStatus>>;
  upgradeModules: ModuleId[];
}

const ModuleContext = createContext<ModuleContextType>({
  activeModules: [], // Default empty
  previewStatus: {},
  upgradeModules: [],
});

/**
 * Fed by the app shell from `listModuleNav` (@/lib/modules/access): which modules
 * are open, which of those are a PILOT/DEV preview, and which are closed only by
 * the plan. All three are the server's answer; nothing here re-decides them.
 */
export const ModuleProvider = ({
  activeModules,
  previewStatus = {},
  upgradeModules = [],
  children,
}: {
  activeModules: ModuleId[];
  previewStatus?: Partial<Record<ModuleId, ModulePreviewStatus>>;
  upgradeModules?: ModuleId[];
  children: ReactNode;
}) => {
  return (
    <ModuleContext.Provider value={{ activeModules, previewStatus, upgradeModules }}>
      {children}
    </ModuleContext.Provider>
  );
};

/**
 * Every module the session may open, as decided on the server by
 * `listAccessibleModules` (plan + `ModuleState` + role) and handed to the app shell's
 * `ModuleProvider`. For lists — the sidebar — where calling `useModuleEnabled` per item
 * would mean a hook in a loop.
 */
export function useActiveModules(): readonly ModuleId[] {
  return useContext(ModuleContext).activeModules;
}

/** PILOT/DEV for an open module that is still a preview; absent when it is ON. */
export function useModulePreviewStatus(): Partial<Record<ModuleId, ModulePreviewStatus>> {
  return useContext(ModuleContext).previewStatus;
}

/** Modules the plan does not include; the sidebar shows their entries locked. */
export function useUpgradeModules(): readonly ModuleId[] {
  return useContext(ModuleContext).upgradeModules;
}

export function useModuleEnabled(moduleId: ModuleId): boolean {
  return useActiveModules().includes(moduleId);
}

/**
 * Client-side module gate for a *component* — hides UI whose module is not active
 * for the session tenant.
 *
 * This is a convenience only. The gate that matters runs on the server
 * (`moduleGate` for pages, `assertModuleAccess` for server actions in
 * @/lib/modules/access): a hidden button is not a closed door, and the action
 * behind it is a public POST endpoint.
 *
 * It previously took no component to wrap and returned an empty fragment when the
 * module *was* active, so anything routed through it rendered nothing at all.
 */
export function requireModule<P extends object>(
  moduleId: ModuleId,
  Component: React.ComponentType<P>,
  Fallback?: React.ComponentType,
) {
  return function ProtectedComponent(props: P) {
    const isEnabled = useModuleEnabled(moduleId);
    const manifest = getManifest(moduleId);

    if (!isEnabled) {
      if (Fallback) return <Fallback />;
      return <ModuleLockedNotice name={manifest?.name ?? moduleId} />;
    }

    return <Component {...props} />;
  };
}

/** Inline "module is closed" notice. Copy comes from the `ModuleGate` namespace. */
function ModuleLockedNotice({ name }: { name: string }) {
  const t = useTranslations('ModuleGate');
  return (
    <div className="p-8 border rounded-lg bg-ground flex flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold mb-2">{t('title')}</h2>
      <p className="text-ink-2">{t('reason.MODULE_OFF', { module: name })}</p>
    </div>
  );
}
