import { describe, expect, it } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";
import { ProtectionStoreError } from "./errors";
import { createProtectionStore } from "./store-factory";

describe("createProtectionStore", () => {
  it("uses memory only when a non-production environment has no Redis config", () => {
    expect(
      createProtectionStore({ nodeEnv: "development", redisRestUrl: null }),
    ).toBeInstanceOf(InMemoryProtectionStore);
  });

  it("fails closed instead of selecting memory in production", () => {
    expect(() =>
      createProtectionStore({ nodeEnv: "production", redisRestUrl: null }),
    ).toThrow(ProtectionStoreError);
  });
});
