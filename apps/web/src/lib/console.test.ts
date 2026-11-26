import { describe, it, expect, afterEach } from "vitest";
import { resolveUserOrg, resolveActiveOrg, isAdminEmail } from "./console";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("resolveUserOrg", () => {
  it("returns the user's org", async () => {
    principal = await createPrincipal();
    expect(await resolveUserOrg(principal.userId)).toBe(principal.organizationId);
  });
  it("returns null for an unknown user", async () => {
    expect(await resolveUserOrg("nobody")).toBeNull();
  });
});

describe("resolveActiveOrg", () => {
  it("prefers the session's activeOrganizationId", async () => {
    principal = await createPrincipal();
    const org = await resolveActiveOrg({
      user: { id: principal.userId },
      session: { activeOrganizationId: "explicit-org" },
    });
    expect(org).toBe("explicit-org");
  });
  it("falls back to the user's first membership when unset", async () => {
    principal = await createPrincipal();
    const org = await resolveActiveOrg({
      user: { id: principal.userId },
      session: { activeOrganizationId: null },
    });
    expect(org).toBe(principal.organizationId);
  });
});

describe("isAdminEmail", () => {
  it("matches the KIOSK_ADMIN_EMAILS allowlist", () => {
    const prev = process.env.KIOSK_ADMIN_EMAILS;
    process.env.KIOSK_ADMIN_EMAILS = "a@x.com, b@y.com";
    expect(isAdminEmail("b@y.com")).toBe(true);
    expect(isAdminEmail("c@z.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    process.env.KIOSK_ADMIN_EMAILS = prev;
  });
});
