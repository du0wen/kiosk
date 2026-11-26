import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { verifyToken } from "@/lib/token";
import { POST } from "./route";

let principal: { userId: string; organizationId: string } | null = null;
const tokens: string[] = [];

async function seedAccessToken(userId: string): Promise<string> {
  const accessToken = "oidc_" + uuidv7();
  await db.insert(oauthAccessToken).values({
    id: uuidv7(),
    accessToken,
    clientId: "kiosk-cli",
    userId,
    scopes: "openid",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
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

const req = (auth?: string) =>
  new Request("http://localhost/api/cli/token", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });

describe("POST /api/cli/token", () => {
  it("401 without a Bearer token", async () => {
    expect((await POST(req())).status).toBe(401);
  });

  it("401 for an unknown OIDC token", async () => {
    expect((await POST(req("Bearer nope"))).status).toBe(401);
  });

  it("mints a durable kiosk_api_ token for a valid OIDC token", async () => {
    principal = await createPrincipal();
    const at = await seedAccessToken(principal.userId);
    const res = await POST(req(`Bearer ${at}`));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(token.startsWith("kiosk_api_")).toBe(true);
    // The minted token authenticates against the same org.
    const identity = await verifyToken(token);
    expect(identity?.organizationId).toBe(principal.organizationId);
  });
});
