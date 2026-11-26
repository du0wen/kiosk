import { describe, expect, it } from "vitest";
import {
  ALL_TOKEN_SCOPES,
  TokenScopeError,
  hasTokenScope,
  normalizeTokenScopes,
} from "./token-scopes";

describe("token scopes", () => {
  it("normalizes scopes into canonical order", () => {
    expect(normalizeTokenScopes(["pages:write", "identity:read"])).toEqual([
      "identity:read",
      "pages:write",
    ]);
  });

  it("rejects empty, unknown, and duplicate scope sets", () => {
    expect(() => normalizeTokenScopes([])).toThrow(TokenScopeError);
    expect(() => normalizeTokenScopes(["unknown"])).toThrow(TokenScopeError);
    expect(() => normalizeTokenScopes(["pages:read", "pages:read"])).toThrow(
      TokenScopeError,
    );
  });

  it("treats null legacy scopes as full access", () => {
    for (const scope of ALL_TOKEN_SCOPES) {
      expect(hasTokenScope(null, scope)).toBe(true);
    }
    expect(hasTokenScope(["pages:read"], "pages:write")).toBe(false);
  });
});
