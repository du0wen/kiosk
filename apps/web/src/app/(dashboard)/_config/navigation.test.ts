import { describe, expect, it } from "vitest";
import { DASHBOARD_NAVIGATION, isNavigationActive } from "./navigation";

describe("dashboard navigation", () => {
  it("keeps the three canonical domains ordered and unique", () => {
    expect(DASHBOARD_NAVIGATION.map((item) => item.href)).toEqual([
      "/pages",
      "/members",
      "/settings",
    ]);
    expect(new Set(DASHBOARD_NAVIGATION.map((item) => item.href)).size).toBe(3);
    expect(new Set(DASHBOARD_NAVIGATION.map((item) => item.labelKey)).size).toBe(3);
  });

  it("marks Settings active on /settings and its sub-routes", () => {
    expect(isNavigationActive("/settings", "/settings")).toBe(true);
    expect(isNavigationActive("/settings/api-tokens", "/settings")).toBe(true);
    expect(isNavigationActive("/pages", "/settings")).toBe(false);
  });
});
