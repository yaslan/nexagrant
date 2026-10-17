import { describe, expect, it } from "vitest";

import {
  displayPlansForModule,
  FALLBACK_PLAN_ID,
  grantsFor,
  plansGrantingModule,
} from "../../src/lib/billing/catalog";
import {
  categorySummary,
  navFeatureLock,
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
const SOON_IDS = getAllManifests()
  .filter((m) => m.statusBadge === "soon")
  .map((m) => m.id);
const isSoon = (id: ModuleId) => SOON_IDS.includes(id);

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
    }
    for (const id of ALL_IDS.filter((id) => !isSoon(id))) {
      expect(displayPlansForModule(id).filter((p) => p !== "free")).toEqual(
        plansGrantingModule(id),
      );
    }
  });

  it("a Yakında module is shown on the cards of its plans, but no plan grants it", () => {
    for (const id of SOON_IDS) {
      expect(plansGrantingModule(id), id).toEqual([]);
      expect(displayPlansForModule(id), id).not.toEqual([]);
    }
    expect(displayPlansForModule("M0")).toEqual(["free", "basic", "pro", "ultra"]);
    expect(displayPlansForModule("M12")).toEqual(["free", "basic", "pro", "ultra"]);
    expect(displayPlansForModule("M13")).toEqual(["pro", "ultra"]);
    expect(displayPlansForModule("M14")).toEqual(["ultra"]);
    expect(displayPlansForModule("M15")).toEqual(["ultra"]);
    expect(displayPlansForModule("M16")).toEqual(["free", "basic", "pro", "ultra"]);
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
    expect(byCat("core")).toEqual(["M0", "M1", "M2", "M3", "M4", "M5", "M13", "M16"]);
    expect(byCat("ai")).toEqual(["M6", "M8", "M14"]);
    expect(byCat("tools")).toEqual(["M7", "M9", "M10", "M11", "M12", "M15"]);
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
    // Patron onayı K-563625: M5 covers only the late gates, so it alone is 2/5.
    expect(pipelineCoverage(["M5"])).toEqual({
      covered: ["G3", "G4"],
      total: 5,
    });
  });

  it("M5 declares exactly G3 and G4 as its stages", () => {
    expect(getAllManifests().find((m) => m.id === "M5")?.stages).toEqual([
      "G3",
      "G4",
    ]);
  });

  it("gives active/total per category", () => {
    expect(categorySummary(["M1", "M6", "M11"])).toEqual({
      core: { active: 1, total: 8 },
      ai: { active: 1, total: 3 },
      tools: { active: 1, total: 6 },
    });
  });
});

describe("navFeatureModule", () => {
  it("maps the approvals centre to M5 and the partner REST API to M1", () => {
    expect(navFeatureModule("approvals")).toBe("M5");
    expect(navFeatureModule("apiKeys")).toBe("M1");
    expect(navFeatureModule("calls")).toBe("M0");
  });

  it("does not lock a feature of a Yakında module, and locks one whose module is off", () => {
    expect(navFeatureLock("calls", [])).toBeNull();
    expect(navFeatureLock("calls", ["M0"])).toBeNull();
    expect(navFeatureLock("approvals", ["M5"])).toBeNull();
    expect(navFeatureLock("approvals", [])?.id).toBe("M5");
    expect(navFeatureLock("apiKeys", [])?.id).toBe("M1");
    expect(navFeatureLock("dashboard", [])).toBeNull();
  });
});

describe("Yakında modules and programme templates", () => {
  it("declares the six new manifests with the agreed categories, dependencies and badge", () => {
    const byId = Object.fromEntries(getAllManifests().map((m) => [m.id, m]));
    expect(SOON_IDS.sort()).toEqual(["M0", "M12", "M13", "M14", "M15", "M16"]);
    expect(byId.M13?.requires).toEqual(["M5"]);
    expect(byId.M13?.recommends).toEqual(["M11"]);
    expect(byId.M14?.requires).toEqual(["M11"]);
    expect(byId.M15?.requires).toEqual(["M5"]);
    expect(byId.M0?.requires).toEqual([]);
    expect(byId.M12?.requires).toEqual([]);
    expect(byId.M16?.requires).toEqual([]);
  });

  it("M11 recommends M13 and the application/concept modules ship the programme templates", () => {
    const byId = Object.fromEntries(getAllManifests().map((m) => [m.id, m]));
    expect(byId.M11?.recommends).toEqual(["M13"]);
    const templates = ["horizon-europe", "eurostars", "digital-europe", "eic-accelerator"];
    expect(byId.M2?.programTemplates).toEqual(templates);
    expect(byId.M11?.programTemplates).toEqual(templates);
  });

  it("the new chains resolve in dependency order with no cycle", () => {
    expect(findDependencyCycle()).toBeNull();
    expect(requirementChain("M13")).toEqual(["M5"]);
    expect(requirementChain("M15")).toEqual(["M5"]);
    expect(requirementChain("M14")).toEqual(["M1", "M2", "M3", "M5", "M8", "M11"]);
    expect(requirementChain("M12")).toEqual([]);
  });
});
