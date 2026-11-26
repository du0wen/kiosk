import { describe, expect, it } from "vitest";
import { InMemoryProtectionStore } from "./memory-store";
import { ProtectionStoreError } from "./errors";
import { createProtectionRuntime, PROTECTION_KEY_NAMESPACE } from "./runtime";

describe("createProtectionRuntime", () => {
  it("uses a stable namespace across rolling releases", () => {
    expect(PROTECTION_KEY_NAMESPACE).toBe("kiosk:protection:v1");
    expect(PROTECTION_KEY_NAMESPACE).not.toContain("release");
  });
  it("allows an isolated no-traffic store only during Next production build", () => {
    const runtime = createProtectionRuntime({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
    });
    expect(runtime.store).toBeInstanceOf(InMemoryProtectionStore);
  });

  it("fails closed for the same missing configuration at production runtime", () => {
    expect(() => createProtectionRuntime({ NODE_ENV: "production" })).toThrow(
      ProtectionStoreError,
    );
  });
});
