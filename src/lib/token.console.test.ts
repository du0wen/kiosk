import { describe, it, expect, afterEach } from "vitest";
import { createToken, listTokens, revokeToken, verifyToken } from "./token";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("listTokens + revokeToken", () => {
  it("lists org tokens and revokes one (which then fails verification)", async () => {
    principal = await createPrincipal();
    const { id, plaintext } = await createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "second",
    });
    const list = await listTokens(principal.organizationId);
    expect(list.some((t) => t.id === id)).toBe(true);
    expect(list.every((t) => !("tokenHash" in t))).toBe(true);

    expect(await revokeToken(id, principal.organizationId)).toBe(true);
    expect(await verifyToken(plaintext)).toBeNull();
  });
  it("does not revoke a token from another org", async () => {
    principal = await createPrincipal();
    const { id } = await createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "x",
    });
    expect(await revokeToken(id, "other-org")).toBe(false);
  });
});
