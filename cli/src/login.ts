import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { openBrowser } from "./browser.js";

const CLIENT_ID = "kiosk-cli";
// Better Auth matches redirect_uri exactly (no RFC 8252 port flexibility), so the
// CLI must use pre-registered loopback URLs. It binds the first free candidate.
const REDIRECT_PORTS = [8976, 8977, 8978];

export function appOriginFrom(apiBase: string): string {
  return apiBase.replace(/\/api\/v1\/?$/, "");
}

/** PKCE (RFC 7636) S256 pair: verifier is base64url(32 bytes); challenge is its SHA-256. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  appOrigin: string,
  p: { clientId: string; redirectUri: string; state: string; challenge: string },
): string {
  const u = new URL(`${appOrigin}/api/auth/oauth2/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export function parseCallback(
  reqUrl: string,
  expectedState: string,
): { code: string } {
  const u = new URL(reqUrl, "http://127.0.0.1");
  if (u.searchParams.get("state") !== expectedState) {
    throw new Error("state mismatch");
  }
  const code = u.searchParams.get("code");
  if (!code) throw new Error("missing code");
  return { code };
}

/** Bind the first free candidate loopback port. */
function listenOnCandidatePort(): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
}> {
  return new Promise((resolve, reject) => {
    const tryPort = (i: number): void => {
      if (i >= REDIRECT_PORTS.length) {
        reject(
          new Error(
            `No free loopback port among ${REDIRECT_PORTS.join(", ")} for the login callback`,
          ),
        );
        return;
      }
      const server = createServer();
      server.once("error", () => {
        server.close();
        tryPort(i + 1);
      });
      server.listen(REDIRECT_PORTS[i], "127.0.0.1", () =>
        resolve({ server, port: REDIRECT_PORTS[i] }),
      );
    };
    tryPort(0);
  });
}

/** Exchange the authorization code for an OIDC access token (PKCE public client). */
async function exchangeCode(
  appOrigin: string,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<string> {
  const res = await fetch(`${appOrigin}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error("token exchange returned no access_token");
  return access_token;
}

/** Trade a valid OIDC access token for a durable kiosk_live_ API token. */
async function mintApiToken(
  appOrigin: string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${appOrigin}/api/cli/token`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`token mint failed: HTTP ${res.status}`);
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error("mint returned no token");
  return token;
}

/**
 * Standard OAuth login: authorization-code + PKCE + loopback (like `gh`/`claude`).
 * Opens the browser to Better Auth's oidcProvider, catches the redirect on a
 * loopback server, exchanges the code for an OIDC access token, then mints a
 * durable API token. Resolves to that token.
 */
export async function browserLogin(apiBase: string): Promise<string> {
  const appOrigin = appOriginFrom(apiBase);
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(16).toString("hex");
  const { server, port } = await listenOnCandidatePort();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const code = await new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = req.url ?? "/";
      if (!url.startsWith("/callback")) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>Kiosk</h1><p>Login complete — you can close this tab.</p>");
      server.close();
      try {
        resolve(parseCallback(url, state).code);
      } catch (e) {
        reject(e as Error);
      }
    });
    server.on("error", reject);
    const authUrl = buildAuthorizeUrl(appOrigin, {
      clientId: CLIENT_ID,
      redirectUri,
      state,
      challenge,
    });
    process.stdout.write(`Opening your browser to log in:\n  ${authUrl}\n`);
    openBrowser(authUrl);
  });

  const accessToken = await exchangeCode(appOrigin, code, redirectUri, verifier);
  return mintApiToken(appOrigin, accessToken);
}
