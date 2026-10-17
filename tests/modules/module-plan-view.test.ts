import { describe, expect, it } from "vitest";

import type { TenantTx } from "../../src/lib/db";
import { grantsFor } from "../../src/lib/billing/catalog";
import { readModulesPlanView } from "../../src/app/[locale]/(app)/[workspace]/settings/modules/plan-view";

/**
 * The real reader, driven by a fake transaction: only the three reads it makes
 * (tenant + subscription via getEntitlements, ModuleState rows) are answered.
 */
function fakeTx(opts: {
  subscription: Record<string, unknown> | null;
  moduleStates?: Array<{ moduleId: string }>;
}): TenantTx {
  return {
    subscription: {
      findUnique: async () => opts.subscription,
    },
    tenant: {
      findUnique: async () => ({
        id: "t1",
        subscription: opts.subscription,
      }),
    },
    moduleState: {
      findMany: async () => opts.moduleStates ?? [],
    },
  } as unknown as TenantTx;
}

const NOW = new Date("2026-10-17T10:00:00Z");

describe("readModulesPlanView — tenant without a live subscription", () => {
  it("is Discover: the free grant's modules, nothing active, nothing orphaned", async () => {
    const view = await readModulesPlanView(
      "t1",
      fakeTx({ subscription: null }),
      "tr",
      NOW,
    );

    expect(view.planId).toBe("free");
    expect(view.planName).toBe("Discover");
    expect(view.entitledModules).toEqual(grantsFor("free")?.moduleIds ?? []);
    expect(view.activeModules).toEqual([]);
    expect(view.switchedOnOutsidePlan).toEqual([]);
  });

  it("with ModuleState rows only for entitled modules, still no ORPHANED", async () => {
    const view = await readModulesPlanView(
      "t1",
      fakeTx({
        subscription: null,
        moduleStates: [{ moduleId: "M3" }, { moduleId: "M5" }],
      }),
      "tr",
      NOW,
    );

    expect(view.activeModules).toEqual(["M3", "M5"]);
    expect(view.switchedOnOutsidePlan).toEqual([]);
  });

  it("a row for a module outside the free grant is reported as ORPHANED input", async () => {
    const view = await readModulesPlanView(
      "t1",
      fakeTx({
        subscription: null,
        moduleStates: [{ moduleId: "M1" }],
      }),
      "tr",
      NOW,
    );

    expect(view.activeModules).toEqual([]);
    expect(view.switchedOnOutsidePlan).toEqual(["M1"]);
  });
});

describe("readModulesPlanView — live paid subscription", () => {
  it("entitles from the Pro grant and lists its switched-on modules as active", async () => {
    const view = await readModulesPlanView(
      "t1",
      fakeTx({
        subscription: {
          planId: "pro",
          status: "ACTIVE",
          provider: "stripe",
          trialEndsAt: null,
          planVersion: null,
          addOns: [],
        },
        moduleStates: [{ moduleId: "M1" }, { moduleId: "M7" }],
      }),
      "tr",
      NOW,
    );

    expect(view.planId).toBe("pro");
    expect(view.entitledModules).toEqual(grantsFor("pro")?.moduleIds ?? []);
    expect(view.activeModules).toEqual(["M1"]);
    // M7 is Ultra-only, so a Pro tenant holding it is the downgrade case.
    expect(view.switchedOnOutsidePlan).toEqual(["M7"]);
  });
});
