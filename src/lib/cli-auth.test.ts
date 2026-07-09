import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliAuthCode, apiToken } from "@/db/schema";
import {
  isLoopback,
  createCliAuthCode,
  exchangeCliAuthCode,
  CliAuthError,
} from "./cli-auth";
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

describe("isLoopback", () => {
  it("accepts loopback, rejects public hosts", () => {
    expect(isLoopback("http://127.0.0.1:5000/callback")).toBe(true);
    expect(isLoopback("http://localhost:5000/callback")).toBe(true);
    expect(isLoopback("https://evil.com/callback")).toBe(false);
    expect(isLoopback("not a url")).toBe(false);
  });
});

describe("createCliAuthCode + exchangeCliAuthCode", () => {
  it("round-trips a code into a fresh token", async () => {
    principal = await createPrincipal();
    const code = await createCliAuthCode({
      userId: principal.userId,
      redirectUri: "http://127.0.0.1:5000/callback",
    });
    const { token } = await exchangeCliAuthCode(code, "CLI test");
    expect(token.startsWith("kiosk_live_")).toBe(true);
    const minted = await db
      .select()
      .from(apiToken)
      .where(eq(apiToken.organizationId, principal.organizationId));
    expect(minted.some((t) => t.name === "CLI test")).toBe(true);
  });
  it("rejects a non-loopback redirect_uri", async () => {
    principal = await createPrincipal();
    await expect(
      createCliAuthCode({
        userId: principal.userId,
        redirectUri: "https://evil.com/cb",
      }),
    ).rejects.toBeInstanceOf(CliAuthError);
  });
  it("rejects reuse of a code", async () => {
    principal = await createPrincipal();
    const code = await createCliAuthCode({
      userId: principal.userId,
      redirectUri: "http://127.0.0.1:5000/callback",
    });
    await exchangeCliAuthCode(code);
    await expect(exchangeCliAuthCode(code)).rejects.toBeInstanceOf(CliAuthError);
  });
});
