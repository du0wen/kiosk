import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "kiosk_live_";

/**
 * SHA-256 hex of a token's plaintext. Tokens are high-entropy random values
 * (not user passwords), so a fast hash is appropriate — no slow KDF needed.
 */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Generate a new token: `kiosk_live_` + 32 random bytes (base64url). */
export function generateToken(): {
  plaintext: string;
  hash: string;
  displayPrefix: string;
} {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${secret}`;
  return {
    plaintext,
    hash: hashToken(plaintext),
    // Shown in the console so a user can recognize a token: prefix + first 6 chars.
    displayPrefix: plaintext.slice(0, TOKEN_PREFIX.length + 6),
  };
}

/** Create + persist a token for a user/org. Returns the plaintext ONCE. */
export async function createToken(params: {
  userId: string;
  organizationId: string;
  name: string;
}): Promise<{ id: string; plaintext: string; displayPrefix: string }> {
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { plaintext, hash, displayPrefix } = generateToken();
  const [row] = await db
    .insert(apiToken)
    .values({
      organizationId: params.organizationId,
      createdBy: params.userId,
      name: params.name,
      tokenHash: hash,
      tokenPrefix: displayPrefix,
    })
    .returning({ id: apiToken.id });
  return { id: row.id, plaintext, displayPrefix };
}

/**
 * Verify an incoming Bearer token. Returns the owning user/org (and bumps
 * lastUsedAt) or null if unknown/revoked.
 */
export async function verifyToken(
  bearer: string,
): Promise<{ userId: string; organizationId: string; tokenId: string } | null> {
  if (!bearer.startsWith(TOKEN_PREFIX)) return null;
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const hash = hashToken(bearer);
  const [row] = await db
    .select()
    .from(apiToken)
    .where(eq(apiToken.tokenHash, hash))
    .limit(1);
  if (!row || row.revokedAt) return null;
  await db
    .update(apiToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiToken.id, row.id));
  return {
    userId: row.createdBy,
    organizationId: row.organizationId,
    tokenId: row.id,
  };
}
