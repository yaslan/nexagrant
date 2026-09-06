'use client';

import React, { createContext, useContext, ReactNode } from 'react';
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
 * A Higher-Order Component to protect routes/components based on module state.
 */
export function requireModule(moduleId: ModuleId, Fallback?: React.ComponentType) {
  return function ProtectedComponent(props: any) {
    const isEnabled = useModuleEnabled(moduleId);
    const manifest = getManifest(moduleId);

    if (!isEnabled) {
      if (Fallback) {
        return <Fallback />;
      }
      return (
        <div className="p-8 border rounded-lg bg-ground flex flex-col items-center justify-center text-center">
          <h2 className="text-xl font-semibold mb-2">
            Module Locked: {manifest?.name || moduleId}
          </h2>
          <p className="text-ink-2">
            This module is currently inactive. Please enable it in your workspace settings.
          </p>
        </div>
      );
    }

    return <>{/* The actual component would go here, but this is a simplified HOC logic */}</>;
  };
}
