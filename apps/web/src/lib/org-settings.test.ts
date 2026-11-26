import { describe, it, expect, afterEach } from "vitest";
import {
  isHexColor,
  getOrgSettings,
  setOrgSettings,
  getOrgBranding,
} from "./org-settings";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string } | null = null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("isHexColor", () => {
  it("validates #rrggbb", () => {
    expect(isHexColor("#1a2b3c")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#12345g")).toBe(false);
  });
});

describe("org settings", () => {
  it("defaults to null, round-trips a patch, rejects bad hex", async () => {
    principal = await createPrincipal();
    const org = principal.organizationId;
    expect(await getOrgSettings(org)).toEqual({
      themeColor: null,
      exportWatermark: null,
    });
    await setOrgSettings(org, {
      themeColor: "#4f46e5",
      exportWatermark: "ACME confidential",
    });
    expect(await getOrgSettings(org)).toEqual({
      themeColor: "#4f46e5",
      exportWatermark: "ACME confidential",
    });
    await expect(
      setOrgSettings(org, { themeColor: "notacolor" }),
    ).rejects.toThrow();
  });
  it("getOrgBranding joins the org name", async () => {
    principal = await createPrincipal();
    await setOrgSettings(principal.organizationId, { themeColor: "#000000" });
    const b = await getOrgBranding(principal.organizationId);
    expect(b.themeColor).toBe("#000000");
    expect(typeof b.name).toBe("string");
  });
});
