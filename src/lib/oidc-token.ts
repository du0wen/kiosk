import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken } from "@/db/schema";

/**
 * Validate an OIDC access token (the opaque value Better Auth's oidcProvider
 * issues and stores in oauth_access_token). Returns the owning user, or null if
 * the token is unknown or expired. Mirrors the checks Better Auth's /oauth2/userinfo
 * performs — a single DB lookup, no HTTP round-trip.
 */
export async function resolveOidcAccessToken(
  bearer: string,
): Promise<{ userId: string } | null> {
  const [row] = await db
    .select({ userId: oauthAccessToken.userId })
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.accessToken, bearer),
        gt(oauthAccessToken.accessTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.userId ? { userId: row.userId } : null;
}
