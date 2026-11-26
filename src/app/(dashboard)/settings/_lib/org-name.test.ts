import { describe, expect, it } from "vitest";
import { validateOrgName } from "./org-name";

describe("validateOrgName", () => {
  it("trims and accepts a valid name", () => {
    expect(validateOrgName("  Acme  ")).toEqual({ ok: true, name: "Acme" });
  });
  it("rejects empty", () => {
    expect(validateOrgName("")).toEqual({ ok: false });
  });
  it("rejects whitespace-only", () => {
    expect(validateOrgName("   ")).toEqual({ ok: false });
  });
  it("rejects more than 80 characters", () => {
    expect(validateOrgName("a".repeat(81))).toEqual({ ok: false });
  });
  it("accepts exactly 80 characters", () => {
    expect(validateOrgName("a".repeat(80))).toEqual({ ok: true, name: "a".repeat(80) });
  });
});
