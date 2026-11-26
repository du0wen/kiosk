export const ALL_TOKEN_SCOPES = [
  "identity:read",
  "pages:read",
  "pages:write",
  "pages:export",
] as const;

export type TokenScope = (typeof ALL_TOKEN_SCOPES)[number];

const scopeSet = new Set<string>(ALL_TOKEN_SCOPES);

export class TokenScopeError extends Error {
  constructor() {
    super("Token scopes must be a unique non-empty set of supported scopes");
    this.name = "TokenScopeError";
  }
}

export function normalizeTokenScopes(input: readonly unknown[]): TokenScope[] {
  if (input.length === 0) throw new TokenScopeError();
  const values = input.map((scope) => {
    if (typeof scope !== "string" || !scopeSet.has(scope)) {
      throw new TokenScopeError();
    }
    return scope as TokenScope;
  });
  if (new Set(values).size !== values.length) throw new TokenScopeError();
  return ALL_TOKEN_SCOPES.filter((scope) => values.includes(scope));
}

export function effectiveTokenScopes(scopes: readonly string[] | null): TokenScope[] {
  return scopes === null ? [...ALL_TOKEN_SCOPES] : normalizeTokenScopes(scopes);
}

export function hasTokenScope(
  scopes: readonly string[] | null,
  required: TokenScope,
): boolean {
  return scopes === null || scopes.includes(required);
}
