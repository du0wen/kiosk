import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  appOriginFrom,
  pkcePair,
  buildAuthorizeUrl,
  parseCallback,
} from "./login";

describe("appOriginFrom", () => {
  it("strips /api/v1", () => {
    expect(appOriginFrom("https://app.example.com/api/v1")).toBe(
      "https://app.example.com",
    );
    expect(appOriginFrom("http://localhost:3000/api/v1")).toBe(
      "http://localhost:3000",
    );
  });
});

describe("pkcePair", () => {
  it("challenge is base64url(sha256(verifier))", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });
  it("generates a fresh verifier each call", () => {
    expect(pkcePair().verifier).not.toBe(pkcePair().verifier);
  });
});

describe("buildAuthorizeUrl", () => {
  it("targets the oidcProvider endpoint with oauth2 + PKCE params", () => {
    const u = new URL(
      buildAuthorizeUrl("https://app.x", {
        clientId: "kiosk-cli",
        redirectUri: "http://127.0.0.1:8976/callback",
        state: "st8",
        challenge: "chal",
      }),
    );
    expect(u.pathname).toBe("/api/auth/oauth2/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("kiosk-cli");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:8976/callback",
    );
    expect(u.searchParams.get("code_challenge")).toBe("chal");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("st8");
  });
});

describe("parseCallback", () => {
  it("returns the code when state matches", () => {
    expect(parseCallback("/callback?code=abc&state=st8", "st8")).toEqual({
      code: "abc",
    });
  });
  it("throws on state mismatch", () => {
    expect(() => parseCallback("/callback?code=abc&state=bad", "st8")).toThrow();
  });
  it("throws when code is missing", () => {
    expect(() => parseCallback("/callback?state=st8", "st8")).toThrow();
  });
});
