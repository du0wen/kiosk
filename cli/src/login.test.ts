import { describe, it, expect } from "vitest";
import { appOriginFrom, buildAuthorizeUrl, parseCallback } from "./login";

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

describe("buildAuthorizeUrl", () => {
  it("encodes redirect_uri and state", () => {
    const u = new URL(
      buildAuthorizeUrl("https://app.x", "http://127.0.0.1:5000/callback", "st8"),
    );
    expect(u.pathname).toBe("/cli/authorize");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:5000/callback",
    );
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
