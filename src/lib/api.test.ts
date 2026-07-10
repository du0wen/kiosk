import { describe, it, expect, afterEach } from "vitest";
import { requireToken, ApiError } from "./api";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

function reqWithAuth(token?: string): Request {
  return new Request("http://localhost/api/v1/me", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("requireToken", () => {
  it("resolves the org/user for a valid token", async () => {
    principal = await createPrincipal();
    const id = await requireToken(reqWithAuth(principal.token));
    expect(id.organizationId).toBe(principal.organizationId);
    expect(id.userId).toBe(principal.userId);
    expect(id.role).toBe("owner");
  });
  it("throws ApiError 401 when the header is missing", async () => {
    await expect(requireToken(reqWithAuth())).rejects.toMatchObject({
      status: 401,
    });
  });
  it("throws ApiError 401 for an unknown token", async () => {
    await expect(requireToken(reqWithAuth("kiosk_live_nope"))).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
