import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedCaller } from "@/lib/api";
import { InMemoryProtectionStore } from "./memory-store";
import { DEFAULT_PROTECTION_POLICY } from "./policy";
import { RateLimitExceededError } from "./limiter";
import { requireApiAccess } from "./api-access";

const KEY = Buffer.alloc(32, 7).toString("base64");
const caller: AuthenticatedCaller = {
  userId: "user-1",
  organizationId: "org-1",
  role: "owner",
  tokenId: "token-1",
  scopes: ["pages:read", "pages:write"],
};

function request() {
  return new Request("https://app.example/api/v1/pages", {
    headers: {
      authorization: "Bearer kiosk_api_secret",
      "x-real-ip": "203.0.113.7",
    },
  });
}

describe("requireApiAccess", () => {
  it("applies pre-auth, general, and route policy before returning the scoped caller", async () => {
    const store = new InMemoryProtectionStore();
    const consume = vi.spyOn(store, "consumeFixedWindow");
    const authenticate = vi.fn(async () => caller);

    await expect(
      requireApiAccess(request(), { scope: "pages:write", policy: "apiWrite" }, {
        store,
        policy: DEFAULT_PROTECTION_POLICY,
        keySecret: KEY,
        trustedClientIpHeaders: ["x-real-ip"],
        authenticate,
        nowMs: () => 5_000,
      }),
    ).resolves.toBe(caller);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(consume.mock.calls)).not.toContain("203.0.113.7");
    expect(JSON.stringify(consume.mock.calls)).not.toContain("kiosk_api_secret");
  });

  it("stops before authentication when the pre-auth IP bucket is exhausted", async () => {
    const store = new InMemoryProtectionStore();
    const authenticate = vi.fn(async () => caller);
    const policy = structuredClone(DEFAULT_PROTECTION_POLICY);
    policy.rateLimits.apiPreAuth = { limit: 1, windowSeconds: 60 };
    const dependencies = {
      store,
      policy,
      keySecret: KEY,
      trustedClientIpHeaders: ["x-real-ip"],
      authenticate,
      nowMs: () => 5_000,
    };
    await requireApiAccess(request(), { scope: "pages:read" }, dependencies);
    authenticate.mockClear();

    await expect(
      requireApiAccess(request(), { scope: "pages:read" }, dependencies),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("checks scope before callers can look up a resource", async () => {
    await expect(
      requireApiAccess(request(), { scope: "pages:export" }, {
        store: new InMemoryProtectionStore(),
        policy: DEFAULT_PROTECTION_POLICY,
        keySecret: KEY,
        trustedClientIpHeaders: ["x-real-ip"],
        authenticate: async () => caller,
        nowMs: () => 5_000,
      }),
    ).rejects.toMatchObject({ status: 403, code: "insufficient_scope" });
  });
});
