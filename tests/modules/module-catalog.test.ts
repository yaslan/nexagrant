import { describe, expect, it } from "vitest";

import {
  displayPlansForModule,
  FALLBACK_PLAN_ID,
  grantsFor,
  plansGrantingModule,
} from "../../src/lib/billing/catalog";
import {
  categorySummary,
  navFeatureModule,
  pipelineCoverage,
} from "../../src/lib/modules/catalog";
import { getAllManifests } from "../../src/lib/modules/registry";
import {
  canEnableEntitled,
  findDependencyCycle,
  moduleStatus,
  requirementChain,
  requirementGraph,
  type ModuleStatusView,
} from "../../src/lib/modules/state-machine";
import type { ModuleId } from "../../src/lib/modules/types";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";

const ALL_IDS = getAllManifests().map((m) => m.id);

/** The view `readModulesPlanView` builds, from entitlements and switched-on rows. */
function viewOf(
  entitled: ModuleId[],
  switchedOn: ModuleId[],
): ModuleStatusView {
  return {
    entitledModules: entitled,
    activeModules: switchedOn.filter((id) => entitled.includes(id)),
    switchedOnOutsidePlan: switchedOn.filter((id) => !entitled.includes(id)),
  };
}

describe("moduleStatus — four card states", () => {
  const view = viewOf(["M1", "M2"], ["M1", "M7"]);

  it("entitled and switched on is ACTIVE", () => {
    expect(moduleStatus("M1", view)).toBe("ACTIVE");
  });
  it("entitled and switched off is AVAILABLE", () => {
    expect(moduleStatus("M2", view)).toBe("AVAILABLE");
  });
  it("not entitled and never switched on is LOCKED", () => {
    expect(moduleStatus("M3", view)).toBe("LOCKED");
  });
  it("switched on but outside the plan (downgrade) is ORPHANED", () => {
    expect(moduleStatus("M7", view)).toBe("ORPHANED");
  });

  it("a Discover tenant that never subscribed has no ORPHANED module", () => {
    const discover = [
      ...(grantsFor(FALLBACK_PLAN_ID)?.moduleIds ?? []),
    ] as ModuleId[];
    expect(discover).toEqual(["M3", "M5"]);

    // No ModuleState rows yet.
    const fresh = viewOf(discover, []);
    expect(
      ALL_IDS.filter((id) => moduleStatus(id, fresh) === "ORPHANED"),
    ).toEqual([]);

    // Every switch the settings action would accept for that tenant, in dependency order.
    const switchedOn: ModuleId[] = [];
    for (const id of ALL_IDS) {
      if (canEnableEntitled(id, switchedOn, discover).allowed)
        switchedOn.push(id);
    }
    const tried = viewOf(discover, switchedOn);
    expect(
      ALL_IDS.filter((id) => moduleStatus(id, tried) === "ORPHANED"),
    ).toEqual([]);
    expect(moduleStatus("M3", tried)).toBe("ACTIVE");
    expect(moduleStatus("M1", tried)).toBe("LOCKED");
  });
});

describe("displayPlansForModule — card plan list", () => {
  it("lists Discover for the modules the free tier grants", () => {
    expect(displayPlansForModule("M3")).toEqual([
      "free",
      "basic",
      "pro",
      "ultra",
    ]);
    expect(displayPlansForModule("M5")).toEqual([
      "free",
      "basic",
      "pro",
      "ultra",
    ]);
    expect(displayPlansForModule("M1")).toEqual(["pro", "ultra"]);
    expect(displayPlansForModule("M7")).toEqual(["ultra"]);
    expect(grantsFor("free")?.name).toBe("Discover");
  });

  it("leaves gating alone: plansGrantingModule still never names free", () => {
    for (const id of ALL_IDS) {
      expect(plansGrantingModule(id)).not.toContain("free");
      expect(displayPlansForModule(id).filter((p) => p !== "free")).toEqual(
        plansGrantingModule(id),
      );
    }
  });
});

describe("requirementChain / findDependencyCycle", () => {
  it("the manifests agree with the owner graph M1→M4→M7/M9/M10; M1→M8; M2+M3+M5+M8→M11", () => {
    expect(requirementChain("M4")).toEqual(["M1"]);
    expect(requirementChain("M7")).toEqual(["M1", "M4"]);
    expect(requirementChain("M9")).toEqual(["M1", "M4"]);
    expect(requirementChain("M10")).toEqual(["M1", "M4"]);
    expect(requirementChain("M8")).toEqual(["M1"]);
    expect(requirementChain("M11")).toEqual(["M1", "M2", "M3", "M5", "M8"]);
    for (const root of ["M1", "M2", "M3", "M5", "M6"] as const) {
      expect(requirementChain(root)).toEqual([]);
    }
  });

  it("puts every dependency before the modules that need it, once", () => {
    const graph = requirementGraph();
    for (const id of ALL_IDS) {
      const chain = requirementChain(id);
      expect(new Set(chain).size).toBe(chain.length);
      expect(chain).not.toContain(id);
      chain.forEach((dep, i) => {
        for (const sub of graph[dep])
          expect(chain.indexOf(sub)).toBeLessThan(i);
      });
    }
  });

  it("the shipped graph has no cycle", () => {
    expect(findDependencyCycle()).toBeNull();
  });

  it("finds a planted cycle and refuses to build a chain through it", () => {
    const graph = { A: ["B"], B: ["C"], C: ["A"], D: ["A"] };
    expect(findDependencyCycle(graph)).toEqual(["A", "B", "C", "A"]);
    expect(() => requirementChain("D", graph)).toThrow(/cycle: A → B → C → A/);
    expect(findDependencyCycle({ X: ["X"] })).toEqual(["X", "X"]);
  });

  it("a diamond yields each shared dependency once", () => {
    const graph = { A: [], B: ["A"], C: ["A"], D: ["B", "C"] };
    expect(requirementChain("D", graph)).toEqual(["A", "B", "C"]);
  });
});

describe("manifest catalogue fields", () => {
  it("categories match the owner grouping", () => {
    const byCat = (c: string) =>
      getAllManifests()
        .filter((m) => m.category === c)
        .map((m) => m.id);
    expect(byCat("core")).toEqual(["M1", "M2", "M3", "M4", "M5"]);
    expect(byCat("ai")).toEqual(["M6", "M8"]);
    expect(byCat("tools")).toEqual(["M7", "M9", "M10", "M11"]);
  });

  it("every module names at least one gate and a name + tagline in both locales", () => {
    const messages = { tr, en } as Record<
      string,
      { modules: Record<string, { name?: string; tagline?: string }> }
    >;
    for (const m of getAllManifests()) {
      expect(m.stages.length, m.id).toBeGreaterThan(0);
      for (const locale of ["tr", "en"]) {
        const entry = messages[locale]?.modules[m.key];
        expect(entry?.name, `${locale} modules.${m.key}.name`).toBeTruthy();
        expect(
          entry?.tagline,
          `${locale} modules.${m.key}.tagline`,
        ).toBeTruthy();
      }
    }
    expect(en.modules["concept-note"].name).toBe("Concept Note Builder");
  });
});

describe("pipelineCoverage / categorySummary", () => {
  it("counts the gates active modules cover, in pipeline order", () => {
    expect(pipelineCoverage([])).toEqual({ covered: [], total: 5 });
    expect(pipelineCoverage(["M6"])).toEqual({ covered: ["G3"], total: 5 });
    expect(pipelineCoverage(["M4", "M2"])).toEqual({
      covered: ["G0", "G1", "G2"],
      total: 5,
    });
    expect(pipelineCoverage(["M5"])).toEqual({
      covered: ["G0", "G1", "G2", "G3", "G4"],
      total: 5,
    });
  });

  it("gives active/total per category", () => {
    expect(categorySummary(["M1", "M6", "M11"])).toEqual({
      core: { active: 1, total: 5 },
      ai: { active: 1, total: 2 },
      tools: { active: 1, total: 4 },
    });
  });
});

describe("navFeatureModule", () => {
  it("maps the approvals centre to M5 and the partner REST API to M1", () => {
    expect(navFeatureModule("approvals")).toBe("M5");
    expect(navFeatureModule("apiKeys")).toBe("M1");
    expect(navFeatureModule("calls")).toBeNull();
  });
});
