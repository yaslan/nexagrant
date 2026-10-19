import { getAllManifests } from "./registry";
import {
  PIPELINE_STAGES,
  type ModuleCategory,
  type ModuleId,
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
 * `calls` (and Fırsatlar) are unmapped until the M0 module exists (phase 2).
 */
export const NAV_FEATURE_MODULE: Readonly<Record<string, ModuleId>> = {
  approvals: "M5",
  apiKeys: "M1",
};

export function navFeatureModule(navKey: string): ModuleId | null {
  return NAV_FEATURE_MODULE[navKey] ?? null;
}
