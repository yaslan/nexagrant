'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ModuleId } from './types';
import { getManifest } from './registry';

interface ModuleContextType {
  activeModules: ModuleId[];
}

const ModuleContext = createContext<ModuleContextType>({
  activeModules: [], // Default empty
});

export const ModuleProvider = ({
  activeModules,
  children,
}: {
  activeModules: ModuleId[];
  children: ReactNode;
}) => {
  return (
    <ModuleContext.Provider value={{ activeModules }}>
      {children}
    </ModuleContext.Provider>
  );
};

export function useModuleEnabled(moduleId: ModuleId): boolean {
  const context = useContext(ModuleContext);
  return context.activeModules.includes(moduleId);
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
