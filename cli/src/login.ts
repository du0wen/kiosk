import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

export function appOriginFrom(apiBase: string): string {
  return apiBase.replace(/\/api\/v1\/?$/, "");
}

export function buildAuthorizeUrl(
  appOrigin: string,
  redirectUri: string,
  state: string,
): string {
  const u = new URL(`${appOrigin}/cli/authorize`);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
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

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // browser could not be opened automatically; the URL is printed for the user
  }
}

/** Loopback browser login. Resolves to the minted token. */
export async function browserLogin(apiBase: string): Promise<string> {
  const appOrigin = appOriginFrom(apiBase);
  const state = randomBytes(16).toString("hex");

  return new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = req.url ?? "/";
      if (!url.startsWith("/callback")) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>Kiosk</h1><p>Login complete — you can close this tab.</p>");
      server.close();
      (async () => {
        const { code } = parseCallback(url, state);
        const r = await fetch(`${appOrigin}/api/cli/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code,
            device: `CLI on ${process.env.HOSTNAME ?? "device"}`,
          }),
        });
        if (!r.ok) throw new Error(`exchange failed: HTTP ${r.status}`);
        const { token } = (await r.json()) as { token: string };
        resolve(token);
      })().catch(reject);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = buildAuthorizeUrl(appOrigin, redirectUri, state);
      process.stdout.write(`Opening your browser to log in:\n  ${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}
