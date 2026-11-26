import { describe, expect, it } from "vitest";
import { extractClientIp, hashProtectionIdentifier } from "./identity";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("extractClientIp", () => {
  it("uses only the configured trusted headers in priority order", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.7, 10.0.0.1",
      "x-forwarded-for": "198.51.100.9",
    });
    expect(
      extractClientIp(headers, ["x-vercel-forwarded-for", "x-forwarded-for"]),
    ).toBe("203.0.113.7");
    expect(extractClientIp(headers, ["x-forwarded-for"])).toBe("198.51.100.9");
  });

  it("rejects malformed addresses and uses a shared unknown bucket", () => {
    expect(extractClientIp(new Headers({ "x-real-ip": "not-an-ip" }), ["x-real-ip"]))
      .toBe("unknown");
    expect(extractClientIp(new Headers(), ["x-real-ip"])).toBe("unknown");
  });
});

describe("hashProtectionIdentifier", () => {
  it("returns a stable domain-separated HMAC without exposing identifiers", () => {
    const first = hashProtectionIdentifier(KEY, "api", "user@example.com", "org-1");
    const again = hashProtectionIdentifier(KEY, "api", "user@example.com", "org-1");
    const otherDomain = hashProtectionIdentifier(
      KEY,
      "report",
      "user@example.com",
      "org-1",
    );

    expect(first).toBe(again);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("user@example.com");
    expect(otherDomain).not.toBe(first);
  });
});
