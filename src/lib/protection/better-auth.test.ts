import { describe, expect, it, vi } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";
import { createBetterAuthRateLimitStorage } from "./better-auth";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("Better Auth rate-limit storage", () => {
  it("uses atomic consume and hashes Better Auth's raw key", async () => {
    const store = new InMemoryProtectionStore();
    const consume = vi.spyOn(store, "consumeFixedWindow");
    const storage = createBetterAuthRateLimitStorage(store, KEY, () => 5_000);
    const rule = { max: 2, window: 60 };

    await expect(storage.consume("203.0.113.7:/sign-in/social", rule)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
    await storage.consume("203.0.113.7:/sign-in/social", rule);
    await expect(storage.consume("203.0.113.7:/sign-in/social", rule)).resolves.toEqual({
      allowed: false,
      retryAfter: 60,
    });
    expect(JSON.stringify(consume.mock.calls)).not.toContain("203.0.113.7");
  });
});
