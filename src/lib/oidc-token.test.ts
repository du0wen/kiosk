import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { resolveOidcAccessToken } from "./oidc-token";

let principal: { userId: string; organizationId: string } | null = null;
const tokens: string[] = [];

async function seedAccessToken(userId: string, expiresAt: Date): Promise<string> {
  const accessToken = "oidc_" + uuidv7();
  await db.insert(oauthAccessToken).values({
    id: uuidv7(),
    accessToken,
    clientId: "kiosk-cli", // FK → seeded oauth_application row
    userId,
    scopes: "openid",
    accessTokenExpiresAt: expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  tokens.push(accessToken);
  return accessToken;
}

afterEach(async () => {
  for (const t of tokens.splice(0)) {
    await db.delete(oauthAccessToken).where(eq(oauthAccessToken.accessToken, t));
  }
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("resolveOidcAccessToken", () => {
  it("resolves an unexpired access token to its user", async () => {
    principal = await createPrincipal();
    const at = await seedAccessToken(principal.userId, new Date(Date.now() + 60_000));
    expect((await resolveOidcAccessToken(at))?.userId).toBe(principal.userId);
  });

  it("returns null for an expired access token", async () => {
    principal = await createPrincipal();
    const at = await seedAccessToken(principal.userId, new Date(Date.now() - 60_000));
    expect(await resolveOidcAccessToken(at)).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    expect(await resolveOidcAccessToken("nope")).toBeNull();
  });
});
