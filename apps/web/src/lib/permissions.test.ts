import { describe, it, expect } from "vitest";
import { can, type Role, type Action } from "./permissions";

const ROLES: Role[] = ["owner", "admin", "member"];

describe("can()", () => {
  it("everyone can edit any page", () => {
    for (const r of ROLES) expect(can(r, "page.edit")).toBe(true);
  });

  it("admin/owner delete any page; member only own", () => {
    for (const a of ["page.delete", "page.setVisibility"] as Action[]) {
      expect(can("owner", a)).toBe(true);
      expect(can("admin", a)).toBe(true);
      expect(can("member", a, { isResourceOwner: true })).toBe(true);
      expect(can("member", a, { isResourceOwner: false })).toBe(false);
      expect(can("member", a)).toBe(false); // no ctx → not owner
    }
  });

  it("member management + org settings: admin/owner only", () => {
    for (const a of [
      "member.invite",
      "member.remove",
      "member.setRole",
      "org.update",
    ] as Action[]) {
      expect(can("owner", a)).toBe(true);
      expect(can("admin", a)).toBe(true);
      expect(can("member", a, { isResourceOwner: true })).toBe(false);
    }
  });

  it("delete org / transfer: owner only", () => {
    for (const a of ["org.delete", "org.transfer"] as Action[]) {
      expect(can("owner", a)).toBe(true);
      expect(can("admin", a)).toBe(false);
      expect(can("member", a)).toBe(false);
    }
  });
});
