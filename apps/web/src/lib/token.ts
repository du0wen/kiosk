import { createHash, randomBytes } from "node:crypto";
import {
  ALL_TOKEN_SCOPES,
  effectiveTokenScopes,
  normalizeTokenScopes,
  type TokenScope,
} from "@/lib/token-scopes";
import type { ProtectionPolicy } from "@/lib/protection/policy";

export const API_TOKEN_PREFIX = "kiosk_api_";
export const LEGACY_API_TOKEN_PREFIXES = ["kiosk_live_"] as const;

export function isSupportedApiToken(value: string): boolean {
  return [API_TOKEN_PREFIX, ...LEGACY_API_TOKEN_PREFIXES].some((prefix) =>
    value.startsWith(prefix),
  );
}

/**
 * SHA-256 hex of a token's plaintext. Tokens are high-entropy random values
 * (not user passwords), so a fast hash is appropriate — no slow KDF needed.
 */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Short, non-secret identifier derived from a persisted SHA-256 token hash. */
export function fingerprintFromHash(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Invalid token hash");
  }
  return hash.slice(0, 12);
}

/** Generate a new token: `kiosk_api_` + 32 random bytes (base64url). */
export function generateToken(): {
  plaintext: string;
  hash: string;
  fingerprint: string;
} {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${API_TOKEN_PREFIX}${secret}`;
  const hash = hashToken(plaintext);
  return {
    plaintext,
    hash,
    fingerprint: fingerprintFromHash(hash),
  };
}

export function tokenExpiresAt(days: number | null, now = new Date()): Date | null {
  if (days === null) return null;
  if (!Number.isInteger(days) || days <= 0) throw new Error("Invalid token expiry");
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);
}

/** Create + persist a token for a user/org. Returns the plaintext ONCE. */
export async function createToken(params: {
  userId: string;
  organizationId: string;
  name: string;
  scopes?: readonly TokenScope[];
  expiresAt?: Date | null;
}, dependencies: {
  quotaPolicy?: Readonly<ProtectionPolicy>;
} = {}): Promise<{ id: string; plaintext: string; fingerprint: string }> {
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { assertTokenCreateQuota } = await import("@/lib/quota");
  const { plaintext, hash, fingerprint } = generateToken();
  const scopes = normalizeTokenScopes(params.scopes ?? ALL_TOKEN_SCOPES);
  const expiresAt = params.expiresAt === undefined ? tokenExpiresAt(90) : params.expiresAt;
  const row = await db.transaction(async (tx) => {
    await assertTokenCreateQuota(
      tx,
      params.organizationId,
      dependencies.quotaPolicy,
    );
    const [inserted] = await tx
      .insert(apiToken)
      .values({
        organizationId: params.organizationId,
        createdBy: params.userId,
        name: params.name,
        tokenHash: hash,
        tokenFingerprint: fingerprint,
        scopes,
        expiresAt,
      })
      .returning({ id: apiToken.id });
    return inserted;
  });
  return { id: row.id, plaintext, fingerprint };
}

/**
 * Verify an incoming Bearer token. Returns the owning user/org (and bumps
 * lastUsedAt) or null if unknown/revoked.
 */
export async function verifyToken(
  bearer: string,
): Promise<{
  userId: string;
  organizationId: string;
  tokenId: string;
  scopes: TokenScope[];
  expiresAt: Date | null;
} | null> {
  if (!isSupportedApiToken(bearer)) return null;
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const hash = hashToken(bearer);
  const [row] = await db
    .select()
    .from(apiToken)
    .where(eq(apiToken.tokenHash, hash))
    .limit(1);
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= new Date())) return null;
  let scopes: TokenScope[];
  try {
    scopes = effectiveTokenScopes(row.scopes);
  } catch {
    return null;
  }
  await db
    .update(apiToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiToken.id, row.id));
  return {
    userId: row.createdBy,
    organizationId: row.organizationId,
    tokenId: row.id,
    scopes,
    expiresAt: row.expiresAt,
  };
}

/** List an org's tokens (never returns the hash). */
export async function listTokens(organizationId: string) {
  const { db } = await import("@/db");
  const { apiToken, user } = await import("@/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db
    .select({
      id: apiToken.id,
      name: apiToken.name,
      tokenFingerprint: apiToken.tokenFingerprint,
      lastUsedAt: apiToken.lastUsedAt,
      scopes: apiToken.scopes,
      expiresAt: apiToken.expiresAt,
      createdAt: apiToken.createdAt,
      revokedAt: apiToken.revokedAt,
      createdBy: apiToken.createdBy,
      creatorName: user.name,
      creatorEmail: user.email,
    })
    .from(apiToken)
    .leftJoin(user, eq(apiToken.createdBy, user.id))
    .where(eq(apiToken.organizationId, organizationId))
    .orderBy(desc(apiToken.createdAt));
}

/** Revoke a token owned by the org. Returns false if not found / not owned. */
export async function revokeToken(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");
  const [row] = await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiToken.id, id),
        eq(apiToken.organizationId, organizationId),
        isNull(apiToken.revokedAt),
      ),
    )
    .returning({ id: apiToken.id });
  return !!row;
}
