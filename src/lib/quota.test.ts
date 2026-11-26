import { describe, expect, it } from "vitest";
import { QuotaExceededError, assertQuotaAvailable, type OrganizationUsage } from "./quota";

const usage: OrganizationUsage = {
  activePages: 499,
  retainedBytes: 1_000,
  activeTokens: 24,
  members: 2,
  invitations: 1,
};

describe("organization quotas", () => {
  it("allows a mutation exactly at the limit", () => {
    expect(() => assertQuotaAvailable("activePages", usage, 1, 500)).not.toThrow();
    expect(() => assertQuotaAvailable("activeTokens", usage, 1, 25)).not.toThrow();
  });

  it("reports current and limit without tenant data when one over", () => {
    expect(() => assertQuotaAvailable("retainedBytes", usage, 25, 1_024)).toThrow(
      expect.objectContaining({
        code: "quota_exceeded",
        quota: "retainedBytes",
        current: 1_000,
        limit: 1_024,
      }) satisfies Partial<QuotaExceededError>,
    );
  });
});
