import { describe, it, expect } from "vitest";
import { fingerprintFromHash, generateToken, hashToken, isSupportedApiToken } from "./token";
import { tokenExpiresAt } from "./token";

describe("hashToken", () => {
  it("is deterministic sha256 hex (64 chars)", () => {
    const h = hashToken("kiosk_api_abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("kiosk_api_abc")).toBe(h);
  });
  it("differs for different input", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("fingerprintFromHash", () => {
  it("derives a stable 12-character identifier from the hash", () => {
    const hash = hashToken("kiosk_api_originalSecretCharacters");
    expect(fingerprintFromHash(hash)).toBe(hash.slice(0, 12));
    expect(fingerprintFromHash(hash)).toMatch(/^[0-9a-f]{12}$/);
    expect(() => fingerprintFromHash("not-a-hash")).toThrow("hash");
  });
});

describe("generateToken", () => {
  it("has kiosk_api_ prefix, a matching 64-char hash, and a hash fingerprint", () => {
    const t = generateToken();
    expect(t.plaintext.startsWith("kiosk_api_")).toBe(true);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).toBe(hashToken(t.plaintext));
    expect(t.fingerprint).toBe(t.hash.slice(0, 12));
    expect(t.plaintext).not.toContain(t.fingerprint);
  });
  it("is unique per call", () => {
    expect(generateToken().plaintext).not.toBe(generateToken().plaintext);
  });
});

describe("isSupportedApiToken", () => {
  it("accepts current and legacy API tokens only", () => {
    expect(isSupportedApiToken("kiosk_api_abc")).toBe(true);
    expect(isSupportedApiToken("kiosk_live_abc")).toBe(true);
    expect(isSupportedApiToken("kiosk_mcp_abc")).toBe(false);
    expect(isSupportedApiToken("oidc_abc")).toBe(false);
  });
});

describe("tokenExpiresAt", () => {
  it("uses a deterministic day-based expiry and permits explicit never", () => {
    const now = new Date("2026-09-19T00:00:00.000Z");
    expect(tokenExpiresAt(90, now)?.toISOString()).toBe("2026-12-18T00:00:00.000Z");
    expect(tokenExpiresAt(null, now)).toBeNull();
  });
});
