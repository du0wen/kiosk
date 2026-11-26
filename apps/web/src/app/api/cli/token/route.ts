import { ApiError, errorResponse, json } from "@/lib/api";
import { resolveOidcAccessToken } from "@/lib/oidc-token";
import { resolveUserOrg } from "@/lib/console";
import {
  enforceIdentifierLimit,
  enforceRequestIpLimit,
} from "@/lib/protection/guard";
import { createToken } from "@/lib/token";

/**
 * Exchange a Better Auth OIDC access token (obtained by `kiosk login`) for a
 * durable `kiosk_api_` API token. OIDC access tokens expire; long-running agents
 * need a token that doesn't, so login mints one here right after the OAuth dance.
 * The REST API (/api/v1) is unchanged — it keeps validating api_tokens.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await enforceRequestIpLimit(
      req,
      "cliMintPreAuth",
      "cli-token-pre-auth",
    );
    const match = (req.headers.get("authorization") ?? "").match(
      /^Bearer\s+(.+)$/i,
    );
    if (!match) throw new ApiError(401, "unauthorized", "Missing Bearer token");
    const identity = await resolveOidcAccessToken(match[1]);
    if (!identity) {
      throw new ApiError(401, "unauthorized", "Invalid or expired OIDC token");
    }
    const organizationId = await resolveUserOrg(identity.userId);
    if (!organizationId) {
      throw new ApiError(400, "no_org", "No organization for this user");
    }
    await enforceIdentifierLimit(
      "cliMintPostAuth",
      "cli-token-caller",
      [identity.userId, organizationId],
    );
    const { plaintext } = await createToken({
      userId: identity.userId,
      organizationId,
      name: "CLI",
    });
    return json({ token: plaintext });
  } catch (err) {
    return errorResponse(err);
  }
}
