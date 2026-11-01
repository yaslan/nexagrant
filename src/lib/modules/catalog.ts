import { getAllManifests, getManifest } from "./registry";
import { isComingSoon } from "./state-machine";
import {
  PIPELINE_STAGES,
  type ModuleCategory,
  type ModuleId,
  type ModuleManifest,
  type PipelineStage,
} from "./types";

/**
 * Read-only views over the module manifests for the modules settings page —
 * computed here so the page counts manifest fields instead of hard-coding which
 * module sits where. Dependency and status logic stays in `state-machine.ts`.
 */

/** Filter tabs / summary cards, in display order. */
export const MODULE_CATEGORIES: readonly ModuleCategory[] = [
  "core",
  "ai",
  "tools",
];

export interface PipelineCoverage {
  /** Gates at least one active module works in, in pipeline order. */
  covered: PipelineStage[];
  total: number;
}

export function pipelineCoverage(
  activeIds: readonly ModuleId[],
): PipelineCoverage {
  const stages = new Set(
    getAllManifests()
      .filter((m) => activeIds.includes(m.id))
      .flatMap((m) => m.stages),
  );
  return {
    covered: PIPELINE_STAGES.filter((s) => stages.has(s)),
    total: PIPELINE_STAGES.length,
  };
}

export type CategorySummary = Record<
  ModuleCategory,
  { active: number; total: number }
>;

/** "aktif/toplam" for each category card. */
export function categorySummary(
  activeIds: readonly ModuleId[],
): CategorySummary {
  const summary = Object.fromEntries(
    MODULE_CATEGORIES.map((c) => [c, { active: 0, total: 0 }]),
  ) as CategorySummary;
  for (const m of getAllManifests()) {
    summary[m.category].total += 1;
    if (activeIds.includes(m.id)) summary[m.category].active += 1;
  }
  return summary;
}

/**
 * Sidebar entries that are not a module's own `nav[]` item but are a feature of
 * one: shown locked while that module is off. Keyed by the `SidebarNav` item key.
 * `calls` maps to M0 (Call Fit) as data only: M0 is "Yakında", so `navFeatureLock`
 * does not lock it. Fırsatlar (`pipeline`) is M5's own nav item, not a feature,
 * so it is not mapped here.
 */
export const NAV_FEATURE_MODULE: Readonly<Record<string, ModuleId>> = {
  approvals: "M5",
  apiKeys: "M1",
  calls: "M0",
};

export function navFeatureModule(navKey: string): ModuleId | null {
  return NAV_FEATURE_MODULE[navKey] ?? null;
}

/**
 * The module whose absence locks a sidebar feature, or `null` when the entry
 * stays open. A feature of a `soon` module is never locked: nothing a tenant can
 * use today is taken away by a module that has not shipped (FO-40).
 */
export function navFeatureLock(
  navKey: string,
  activeIds: readonly ModuleId[],
): ModuleManifest | null {
  const id = navFeatureModule(navKey);
  if (!id || activeIds.includes(id) || isComingSoon(id)) return null;
  return getManifest(id);
}
