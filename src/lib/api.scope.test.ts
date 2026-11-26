import { describe, expect, it } from "vitest";
import { ApiError, errorResponse, requireScope, type AuthenticatedCaller } from "./api";
import { QuotaExceededError } from "./quota";

const caller: AuthenticatedCaller = {
  userId: "user-1",
  organizationId: "org-1",
  role: "owner",
  tokenId: "token-1",
  scopes: ["pages:read"],
};

describe("requireScope", () => {
  it("returns the caller when the exact scope is present", () => {
    expect(requireScope(caller, "pages:read")).toBe(caller);
  });

  it("returns a stable Bearer insufficient-scope response", async () => {
    let error: unknown;
    try {
      requireScope(caller, "pages:write");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiError);
    const response = errorResponse(error);
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", scope="pages:write"',
    );
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "insufficient_scope",
        message: "Token does not grant the required scope",
      },
    });
  });
});

describe("quota error responses", () => {
  it("maps organization quota failures to a stable 409 payload", async () => {
    const response = errorResponse(
      new QuotaExceededError("activePages", 500, 500),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "quota_exceeded",
        message: "activePages quota exceeded (500/500)",
        quota: "activePages",
        current: 500,
        limit: 500,
      },
    });
  });
});
