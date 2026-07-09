import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { POST } from "./route";
import { db } from "@/db";
import { cliAuthCode } from "@/db/schema";
import { createCliAuthCode } from "@/lib/cli-auth";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null =
  null;
afterEach(async () => {
  if (principal) {
    await db.delete(cliAuthCode).where(eq(cliAuthCode.userId, principal.userId));
    await cleanupPrincipal(principal);
    principal = null;
  }
});

const post = (body: unknown) =>
  new Request("http://localhost/api/cli/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/cli/exchange", () => {
  it("exchanges a valid code for a token", async () => {
    principal = await createPrincipal();
    const code = await createCliAuthCode({
      userId: principal.userId,
      redirectUri: "http://127.0.0.1:9999/callback",
    });
    const res = await POST(post({ code, device: "dev" }));
    expect(res.status).toBe(200);
    expect((await res.json()).token.startsWith("kiosk_live_")).toBe(true);
  });
  it("400 for a missing code", async () => {
    expect((await POST(post({}))).status).toBe(400);
  });
  it("400 for an unknown code", async () => {
    expect((await POST(post({ code: "nope" }))).status).toBe(400);
  });
});
