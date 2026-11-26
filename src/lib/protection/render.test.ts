import { describe, expect, it, vi } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";
import { DEFAULT_PROTECTION_POLICY } from "./policy";
import { protectRender } from "./render";

const KEY = Buffer.alloc(32, 4).toString("base64");

describe("protectRender", () => {
  it("consumes the org daily limit and releases its concurrency lease", async () => {
    const store = new InMemoryProtectionStore();
    const consume = vi.spyOn(store, "consumeFixedWindow");
    const acquire = vi.spyOn(store, "acquireLease");
    const release = vi.spyOn(store, "releaseLease");
    const result = await protectRender("org-secret", async () => "rendered", {
      store,
      policy: DEFAULT_PROTECTION_POLICY,
      keySecret: KEY,
      nowMs: () => 10_000,
      leaseId: () => "lease-1",
    });

    expect(result).toBe("rendered");
    expect(consume).toHaveBeenCalledOnce();
    expect(acquire).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2, ttlMs: 120_000, leaseId: "lease-1" }),
    );
    expect(release).toHaveBeenCalledOnce();
    expect(JSON.stringify([consume.mock.calls, acquire.mock.calls])).not.toContain(
      "org-secret",
    );
  });

  it("releases the lease after a render failure", async () => {
    const store = new InMemoryProtectionStore();
    const release = vi.spyOn(store, "releaseLease");
    await expect(
      protectRender("org", async () => {
        throw new Error("render failed");
      }, {
        store,
        policy: DEFAULT_PROTECTION_POLICY,
        keySecret: KEY,
        nowMs: () => 10_000,
        leaseId: () => "lease-2",
      }),
    ).rejects.toThrow("render failed");
    expect(release).toHaveBeenCalledOnce();
  });
});
