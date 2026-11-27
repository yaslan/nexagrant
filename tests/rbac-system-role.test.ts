import type { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, SYSTEM_ROLE } from "@/lib/rbac";

// NG-272 review B-1: SYSTEM_ROLE used to be the string "SYSTEM". `can()` skipped the
// permission table for any value equal to that string, so a plain "SYSTEM" that reached
// `can` through a `as Role` cast (session roles are cast this way) passed every action.
// The sentinel is a symbol now: a string can never equal it.
const FORGED = "SYSTEM" as unknown as Role;

const plan = (granted: string[], moduleOpen?: boolean) => ({
  feature: "billing",
  grantedFeatures: new Set(granted),
  moduleOpen,
});

describe("SYSTEM_ROLE is a symbol, not a string (NG-272 B-1)", () => {
  it("is a unique symbol", () => {
    expect(typeof SYSTEM_ROLE).toBe("symbol");
  });

  it("a forged string role named SYSTEM is refused for every action", () => {
    expect(can(FORGED, "manage_billing")).toBe(false);
    expect(can(FORGED, "manage_users")).toBe(false);
    expect(can(FORGED, "manage_modules")).toBe(false);
  });

  it("a forged string role named SYSTEM is refused even with a plan resource", () => {
    expect(can(FORGED, "manage_billing", plan(["billing"], true))).toBe(false);
  });

  it("SYSTEM_ROLE decides by the plan resource alone: granted feature and open module", () => {
    expect(can(SYSTEM_ROLE, "manage_billing", plan(["billing"], true))).toBe(true);
  });

  it("SYSTEM_ROLE is refused when the plan does not grant the feature", () => {
    expect(can(SYSTEM_ROLE, "manage_billing", plan([], true))).toBe(false);
  });

  it("SYSTEM_ROLE is refused when the module behind the feature is closed", () => {
    expect(can(SYSTEM_ROLE, "manage_billing", plan(["billing"], false))).toBe(false);
  });
});
