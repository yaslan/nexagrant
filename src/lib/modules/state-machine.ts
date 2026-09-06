import { ModuleId, PlanTier } from './types';
import { getManifest, getAllManifests } from './registry';

export interface CanEnableResult {
  allowed: boolean;
  reason?: string;
  missingDependencies?: ModuleId[];
}

/**
 * Checks if a module can be enabled based on its dependencies and the current plan tier.
 */
export function canEnable(
  moduleId: ModuleId,
  activeModules: ModuleId[],
  plan: PlanTier
): CanEnableResult {
  const manifest = getManifest(moduleId);
  if (!manifest) {
    return { allowed: false, reason: 'Module not found.' };
  }

  // Check plan constraint
  if (!manifest.planTiers.includes(plan)) {
    return { allowed: false, reason: 'Plan upgrade required.' };
  }

  // Check dependencies
  const missingDependencies = manifest.requires.filter(
    (req) => !activeModules.includes(req)
  );

  if (missingDependencies.length > 0) {
    return { allowed: false, reason: 'Missing dependencies.', missingDependencies };
  }

  return { allowed: true };
}

/**
 * Returns a list of module IDs that would be disabled as a side effect
 * of disabling the given module (due to dependency constraints).
 * Computes this recursively.
 */
export function getDisableCascade(
  moduleIdToDisable: ModuleId,
  activeModules: ModuleId[]
): ModuleId[] {
  const cascadeSet = new Set<ModuleId>([moduleIdToDisable]);
  let added = true;

  // Iteratively find modules that depend on any module in the cascade set
  while (added) {
    added = false;
    for (const activeMod of activeModules) {
      if (cascadeSet.has(activeMod)) continue;

      const manifest = getManifest(activeMod);
      const hasMissingDeps = manifest.requires.some((req) => cascadeSet.has(req));

      if (hasMissingDeps) {
        cascadeSet.add(activeMod);
        added = true;
      }
    }
  }

  // Exclude the module being explicitly disabled from the cascade result list
  cascadeSet.delete(moduleIdToDisable);
  return Array.from(cascadeSet);
}
