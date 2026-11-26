import { describe, expect, it } from "vitest";
import { dashboardPath, LEGACY_REDIRECTS } from "./paths";

describe("dashboard paths", () => {
  it("builds encoded page routes", () => {
    expect(dashboardPath.pageHistory("a/b c")).toBe("/pages/a%2Fb%20c/history");
    expect(dashboardPath.pageExport("a/b c", "pdf")).toBe(
      "/pages/a%2Fb%20c/export?format=pdf",
    );
  });

  it("keeps legacy URLs mapped to canonical routes", () => {
    expect(LEGACY_REDIRECTS).toEqual({
      "/branding": "/settings/branding",
      "/api-tokens": "/settings/api-tokens",
      "/settings/members": "/members",
      "/settings/tokens": "/settings/api-tokens",
    });
  });

  it("has no redirect loop (no target is also a source)", () => {
    const keys = new Set(Object.keys(LEGACY_REDIRECTS));
    for (const target of Object.values(LEGACY_REDIRECTS)) {
      expect(keys.has(target.split("#")[0])).toBe(false);
    }
  });
});
