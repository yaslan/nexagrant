import { describe, expect, it } from "vitest";
import { asRole, can } from "@/lib/rbac";

// NG-259: `asRole` used `role in rolePermissions`, which walks the prototype
// chain, so Object.prototype keys were accepted as roles and `can` then threw
// `p.includes is not a function` instead of denying.
const PROTOTYPE_KEYS = [
  "constructor",
  "toString",
  "__proto__",
  "hasOwnProperty",
  "valueOf",
  "isPrototypeOf",
] as const;

describe("asRole rejects prototype keys (NG-259)", () => {
  it.each(PROTOTYPE_KEYS)("asRole(%s) returns null", (key) => {
    expect(asRole(key)).toBeNull();
  });

  it.each(PROTOTYPE_KEYS)("can(asRole(%s), action) denies without throwing", (key) => {
    expect(() => can(asRole(key), "edit_proposal")).not.toThrow();
    expect(can(asRole(key), "edit_proposal")).toBe(false);
    expect(can(asRole(key), "view_proposal")).toBe(false);
    expect(can(asRole(key), "manage_billing")).toBe(false);
  });

  it.each(PROTOTYPE_KEYS)(
    "plan-gated can(asRole(%s), manage_billing, resource) denies without throwing",
    (key) => {
      const resource = {
        feature: "billing",
        grantedFeatures: new Set(["billing"]),
        moduleOpen: true,
      };
      expect(() => can(asRole(key), "manage_billing", resource)).not.toThrow();
      expect(can(asRole(key), "manage_billing", resource)).toBe(false);
    }
  );

  it("still accepts every real role", () => {
    for (const role of [
      "TENANT_OWNER",
      "TENANT_ADMIN",
      "PIPELINE_MANAGER",
      "WRITER",
      "MEMBER",
      "GUEST_PARTNER",
    ]) {
      expect(asRole(role)).toBe(role);
    }
  });

  it("maps null, undefined and unknown strings to null", () => {
    expect(asRole(null)).toBeNull();
    expect(asRole(undefined)).toBeNull();
    expect(asRole("")).toBeNull();
    expect(asRole("NOT_A_ROLE")).toBeNull();
  });
});
