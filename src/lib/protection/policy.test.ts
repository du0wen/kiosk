import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROTECTION_POLICY,
  ProtectionPolicyError,
  loadProtectionPolicy,
} from "./policy";

describe("loadProtectionPolicy", () => {
  it("provides one immutable default policy for every protection surface", () => {
    expect(DEFAULT_PROTECTION_POLICY.rateLimits.apiWrite).toEqual({
      limit: 30,
      windowSeconds: 60,
    });
    expect(DEFAULT_PROTECTION_POLICY.rateLimits.renderDaily).toEqual({
      limit: 100,
      windowSeconds: 86_400,
    });
    expect(DEFAULT_PROTECTION_POLICY.quotas).toEqual({
      activePages: 500,
      retainedBytes: 1024 ** 3,
      activeTokens: 25,
      members: 25,
      invitations: 25,
      renderConcurrency: 2,
    });
    expect(Object.isFrozen(DEFAULT_PROTECTION_POLICY)).toBe(true);
  });

  it("applies typed positive integer environment overrides", () => {
    const policy = loadProtectionPolicy({
      KIOSK_RATE_API_WRITE_LIMIT: "12",
      KIOSK_RATE_API_WRITE_WINDOW_SECONDS: "90",
      KIOSK_QUOTA_ACTIVE_PAGES: "42",
    });

    expect(policy.rateLimits.apiWrite).toEqual({ limit: 12, windowSeconds: 90 });
    expect(policy.quotas.activePages).toBe(42);
    expect(DEFAULT_PROTECTION_POLICY.rateLimits.apiWrite.limit).toBe(30);
  });

  it.each(["0", "-1", "1.5", "NaN", "  "])(
    "rejects invalid numeric override %j without echoing its value",
    (invalid) => {
      let error: unknown;
      try {
        loadProtectionPolicy({ KIOSK_RATE_API_WRITE_LIMIT: invalid });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ProtectionPolicyError);
      expect(String(error)).toContain("KIOSK_RATE_API_WRITE_LIMIT");
      expect(String(error)).not.toContain(`=${invalid}`);
    },
  );
});
