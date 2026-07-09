import { describe, it, expect } from "vitest";
import { hashToken, generateToken } from "./token";

describe("hashToken", () => {
  it("is deterministic sha256 hex (64 chars)", () => {
    const h = hashToken("kiosk_live_abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("kiosk_live_abc")).toBe(h);
  });
  it("differs for different input", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("generateToken", () => {
  it("has kiosk_live_ prefix, a matching 64-char hash, and a display prefix", () => {
    const t = generateToken();
    expect(t.plaintext.startsWith("kiosk_live_")).toBe(true);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.hash).toBe(hashToken(t.plaintext));
    expect(t.displayPrefix.startsWith("kiosk_live_")).toBe(true);
    expect(t.displayPrefix.length).toBe("kiosk_live_".length + 6);
  });
  it("is unique per call", () => {
    expect(generateToken().plaintext).not.toBe(generateToken().plaintext);
  });
});
