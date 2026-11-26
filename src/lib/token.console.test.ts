import { describe, it, expect, afterEach } from "vitest";
import {
  createToken,
  fingerprintFromHash,
  hashToken,
  listTokens,
  revokeToken,
  verifyToken,
} from "./token";
import { db } from "@/db";
import { apiToken } from "@/db/schema";
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
  it("continues to verify a stored legacy kiosk_live_ token", async () => {
    principal = await createPrincipal();
    const legacy = `kiosk_live_${principal.userId}`;
    const tokenHash = hashToken(legacy);
    await db.insert(apiToken).values({
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      name: "legacy",
      tokenHash,
      tokenFingerprint: fingerprintFromHash(tokenHash),
    });

    await expect(verifyToken(legacy)).resolves.toMatchObject({
      userId: principal.userId,
      organizationId: principal.organizationId,
      scopes: expect.arrayContaining(["identity:read", "pages:write"]),
    });
  });

  it("stores explicit scopes and rejects an expired token", async () => {
    principal = await createPrincipal();
    const { id, plaintext } = await createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "read only",
      scopes: ["pages:read"],
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await verifyToken(plaintext)).toBeNull();
    expect(await listTokens(principal.organizationId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, scopes: ["pages:read"], expiresAt: expect.any(Date) }),
      ]),
    );
  });

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
    expect(list.every((t) => !("tokenPrefix" in t))).toBe(true);
    expect(list.find((t) => t.id === id)?.tokenFingerprint).toBe(
      hashToken(plaintext).slice(0, 12),
    );
    expect(list.find((t) => t.id === id)).toMatchObject({
      createdBy: principal.userId,
      creatorEmail: expect.any(String),
    });

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
