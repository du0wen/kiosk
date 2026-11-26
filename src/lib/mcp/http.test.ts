import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { member } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cleanupPrincipal, createPrincipal } from "@/test/factories";
import { revokeToken } from "@/lib/token";
import { ProtectionStoreError } from "@/lib/protection/errors";
import {
  authenticateMcpRequest,
  handleMcpOptions,
  handleMcpPost,
  loadMcpHttpConfig,
  validateMcpRequest,
} from "./http";

type Principal = Awaited<ReturnType<typeof createPrincipal>>;
let principal: Principal | null = null;

afterEach(async () => {
  if (principal) await cleanupPrincipal(principal);
  principal = null;
});

const config = loadMcpHttpConfig({
  APP_ORIGIN: "https://app.kiosk.example",
  MCP_ALLOWED_HOSTS: "preview.kiosk.example",
  MCP_ALLOWED_ORIGINS: "https://admin.example, http://localhost:4173",
});

function request(options: {
  host?: string;
  origin?: string;
  authorization?: string;
  method?: string;
  body?: string;
} = {}) {
  return new Request("https://app.kiosk.example/mcp", {
    method: options.method ?? "POST",
    headers: {
      host: options.host ?? "app.kiosk.example",
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.authorization ? { authorization: options.authorization } : {}),
      "content-type": "application/json",
    },
    ...(options.method === "OPTIONS" ? {} : { body: options.body ?? "not-json-yet" }),
  });
}

describe("MCP HTTP configuration", () => {
  it("derives the app host, local development hosts, and exact origins", () => {
    expect(config.allowedHosts).toEqual(
      expect.arrayContaining([
        "app.kiosk.example",
        "preview.kiosk.example",
        "localhost",
        "127.0.0.1",
        "[::1]",
      ]),
    );
    expect(config.allowedOrigins).toEqual([
      "https://app.kiosk.example",
      "https://admin.example",
      "http://localhost:4173",
    ]);
    expect(config.allowedHosts).not.toContain("serve.kiosk.example");
  });

  it("accepts absent or allowed Origin and rejects mismatched host/origin", () => {
    expect(validateMcpRequest(request(), config)).toBeUndefined();
    expect(
      validateMcpRequest(request({ origin: "https://admin.example" }), config),
    ).toBeUndefined();
    expect(
      validateMcpRequest(request({ host: "serve.kiosk.example" }), config)?.status,
    ).toBe(403);
    expect(
      validateMcpRequest(request({ origin: "https://app.kiosk.example:444" }), config)
        ?.status,
    ).toBe(403);
    expect(
      validateMcpRequest(request({ origin: "null" }), config)?.status,
    ).toBe(403);
  });

  it("returns preflight headers only for an allowed browser origin", () => {
    const allowed = handleMcpOptions(
      request({ method: "OPTIONS", origin: "https://admin.example" }),
      config,
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://admin.example",
    );
    expect(allowed.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );

    const rejected = handleMcpOptions(
      request({ method: "OPTIONS", origin: "https://evil.example" }),
      config,
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
  });
});

describe("MCP Bearer authentication", () => {
  it("returns a Bearer challenge for missing, malformed, and revoked tokens", async () => {
    for (const authorization of [undefined, "Basic abc", "Bearer kiosk_api_nope"]) {
      const result = await authenticateMcpRequest(
        request({ authorization }),
      );
      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(response.headers.get("www-authenticate")).not.toContain("resource_metadata");
    }

    principal = await createPrincipal();
    const authenticated = await authenticateMcpRequest(
      request({ authorization: `Bearer ${principal.token}` }),
    );
    expect(authenticated).toMatchObject({
      userId: principal.userId,
      organizationId: principal.organizationId,
      role: "owner",
    });

    await revokeTokenByPlaintext(principal);
    const revoked = await authenticateMcpRequest(
      request({ authorization: `Bearer ${principal.token}` }),
    );
    expect(revoked).toBeInstanceOf(Response);
    expect((revoked as Response).status).toBe(401);
  });

  it("returns 403 when current organization membership was removed", async () => {
    principal = await createPrincipal();
    await db.delete(member).where(eq(member.userId, principal.userId));
    const result = await authenticateMcpRequest(
      request({ authorization: `Bearer ${principal.token}` }),
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
});

describe("MCP POST safety order", () => {
  it("rejects Host and Origin before auth or body parsing", async () => {
    const authenticate = vi.fn();
    const createHandler = vi.fn();
    const response = await handleMcpPost(
      request({
        host: "serve.kiosk.example",
        body: "deliberately invalid JSON",
      }),
      { config, authenticate, createHandler },
    );
    expect(response.status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
    expect(createHandler).not.toHaveBeenCalled();
  });

  it("returns a sanitized 503 when shared protection is unavailable", async () => {
    const response = await authenticateMcpRequest(request(), async () => {
      throw new ProtectionStoreError();
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect(await (response as Response).json()).toEqual({
      error: {
        code: "protection_unavailable",
        message: "Runtime protection is unavailable",
      },
    });
  });
});

async function revokeTokenByPlaintext(value: Principal): Promise<void> {
  const caller = await authenticateMcpRequest(
    request({ authorization: `Bearer ${value.token}` }),
  );
  if (caller instanceof Response) throw new Error("expected valid token");
  const { verifyToken } = await import("@/lib/token");
  const identity = await verifyToken(value.token);
  if (!identity) throw new Error("expected token identity");
  await revokeToken(identity.tokenId, value.organizationId);
}
