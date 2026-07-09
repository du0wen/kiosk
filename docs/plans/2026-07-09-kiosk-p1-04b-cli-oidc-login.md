# Kiosk P1 · Plan 4b′ — CLI Login via Better Auth oidcProvider (supersedes custom cli-auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled CLI auth (`/cli/authorize` + `/api/cli/exchange` + `cli_auth_code`) with Better Auth's standard **`oidcProvider`** (authorization-code + PKCE + loopback, like Claude Code), then mint a durable `kiosk_live_` api_token at the end so the REST API is unchanged.

**Architecture:** Kiosk becomes an OIDC provider (Better Auth `oidcProvider`). The `kiosk-cli` is a **trusted public client** (PKCE, `skipConsent`, fixed candidate loopback redirect URIs). `kiosk login` runs the standard code+PKCE+loopback flow → gets an opaque oidc access token → calls one app endpoint that validates that token via the `oauthAccessToken` table and mints a durable `kiosk_live_` api_token. `/api/v1/*` keeps using api_tokens (`verifyToken`, unchanged). `KIOSK_TOKEN` stays the headless path.

**Tech Stack:** Better Auth `oidcProvider`, Next.js route handler, Node `http`/`crypto` in the CLI (raw OAuth HTTP, still zero-dep), Drizzle/Neon, Vitest.

> Supersedes `2026-07-09-kiosk-p1-04b-cli-browser-login.md`. Consumes Plan 1 (`createToken`, `resolveUserOrg`), Plan 6 (`resolveUserOrg`).

## Global Constraints (from spec §4.4, revised)

- CLI login = Better Auth `oidcProvider` **authorization-code + PKCE (S256) + loopback**. No custom OAuth endpoints.
- `kiosk-cli` = **trusted public client** (`skipConsent: true`, no secret); `loginPage: "/sign-in"` (plugin auto-continues after OAuth login).
- **Fixed candidate loopback ports** (Better Auth matches `redirect_uri` by `===`, no RFC 8252 port exception — verified in source): register `http://127.0.0.1:{8976,8977,8978}/callback`; CLI binds the first free one.
- **Mint step:** after the oidc flow, mint a durable `kiosk_live_` api_token (oidc tokens expire; agents need durability). Validate the oidc access token by a direct `oauthAccessToken` table lookup (fast, no userinfo HTTP hop).
- `/api/v1/*` auth is **unchanged** (`verifyToken` on api_token). `KIOSK_TOKEN`/`--token` remain the headless path.
- Commits carry **no AI attribution**.
- **Execution-time verifications (inspect the installed better-auth, then implement — not placeholders):** ① exact trusted-client field for a public/none client; ② `oauthAccessToken` column names (accessToken/userId/expiresAt); ③ that `loginPage` continuation works end-to-end (manual smoke).

---

### Task 1: Swap custom cli-auth → oidcProvider

**Files:**
- Delete: `src/lib/cli-auth.ts`, `src/lib/cli-auth.test.ts`, `src/app/cli/authorize/page.tsx`, `src/app/api/cli/exchange/route.ts`, `src/app/api/cli/exchange/route.test.ts`
- Modify: `src/lib/auth.ts` (add `oidcProvider` + trusted `kiosk-cli`), `src/db/schema/tokens.ts` (remove `cliAuthCode`)
- Generate/migrate: oidc tables in `src/db/schema/auth.ts`; drop `cli_auth_code`

- [ ] **Step 1: Remove the custom cli-auth pieces**

```bash
git rm src/lib/cli-auth.ts src/lib/cli-auth.test.ts \
  src/app/cli/authorize/page.tsx \
  src/app/api/cli/exchange/route.ts src/app/api/cli/exchange/route.test.ts
```
Remove the `cliAuthCode` table + `CliAuthCode` type block from `src/db/schema/tokens.ts` (leave `apiToken`).

- [ ] **Step 2: Add `oidcProvider` to `src/lib/auth.ts`**

Add the import and plugin (verify the public-client field against `oidc-provider/types.d.mts` `Client` — set the auth method to `none`/omit secret):
```typescript
import { organization, oidcProvider } from "better-auth/plugins";
// ...
  plugins: [
    organization(),
    oidcProvider({
      loginPage: "/sign-in",
      trustedClients: [
        {
          clientId: "kiosk-cli",
          // public client (PKCE, no secret) — confirm exact field name from the Client type
          type: "public",
          skipConsent: true,
          name: "Kiosk CLI",
          redirectUrls: [
            "http://127.0.0.1:8976/callback",
            "http://127.0.0.1:8977/callback",
            "http://127.0.0.1:8978/callback",
          ],
        },
      ],
    }),
  ],
```
> Keep the `databaseHooks` (personal-org provisioning) and `advanced` cookie config as-is.

- [ ] **Step 3: Regenerate the Better Auth schema + migrate**

```bash
pnpm auth:generate   # adds oauthApplication / oauthAccessToken / oauthConsent to src/db/schema/auth.ts
pnpm db:generate     # creates the new oidc tables + DROPS cli_auth_code
pnpm db:migrate
```

- [ ] **Step 4: Verify tables + build**

```bash
pnpm exec tsx -e "require('dotenv').config();import('./src/db/index.ts').then(async({db})=>{const {sql}=await import('drizzle-orm');const r=await db.execute(sql\`select table_name from information_schema.tables where table_schema='public' order by 1\`);console.log((r.rows??r).map(x=>x.table_name).join(', '));process.exit(0)})"
pnpm build
```
Expected: tables include `oauthapplication, oauthaccesstoken, oauthconsent`, and **no** `cli_auth_code`; build lists `ƒ /oauth2/...` routes (or they are handled under `/api/auth`), and no `/cli/authorize` or `/api/cli/exchange`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace custom cli-auth with better-auth oidcProvider (trusted kiosk-cli client)"
```

---

### Task 2: Mint endpoint (`POST /api/cli/token`)

**Files:**
- Create: `src/lib/oidc-token.ts`, `src/lib/oidc-token.test.ts`, `src/app/api/cli/token/route.ts`

**Interfaces:**
- Produces:
  - `resolveOidcAccessToken(bearer: string): Promise<{ userId: string } | null>` — looks up `oauthAccessToken` (unexpired) → userId.
  - `POST /api/cli/token` → validates the Bearer oidc access token, resolves org, mints a `kiosk_live_` api_token → `{ token }`.

- [ ] **Step 1: Write the failing test `src/lib/oidc-token.test.ts`**

> Seeds an `oauthAccessToken` row directly (column names confirmed in Task-1's generated `auth.ts`) and asserts resolution. Adjust the `.values()` to the generated columns.

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { resolveOidcAccessToken } from "./oidc-token";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
let at: string | null = null;
afterEach(async () => {
  if (at) { await db.delete(oauthAccessToken).where(eq(oauthAccessToken.accessToken, at)); at = null; }
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("resolveOidcAccessToken", () => {
  it("resolves an unexpired access token to its user", async () => {
    principal = await createPrincipal();
    at = "oidc_" + uuidv7();
    await db.insert(oauthAccessToken).values({
      id: uuidv7(),
      accessToken: at,
      clientId: "kiosk-cli",
      userId: principal.userId,
      scopes: "openid",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await resolveOidcAccessToken(at))?.userId).toBe(principal.userId);
  });
  it("returns null for an unknown token", async () => {
    expect(await resolveOidcAccessToken("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm exec vitest run src/lib/oidc-token.test.ts` → module missing.

- [ ] **Step 3: Implement `src/lib/oidc-token.ts`** (adjust column names to the generated schema)

```typescript
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccessToken } from "@/db/schema";

export async function resolveOidcAccessToken(
  bearer: string,
): Promise<{ userId: string } | null> {
  const [row] = await db
    .select()
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.accessToken, bearer),
        gt(oauthAccessToken.accessTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ? { userId: row.userId } : null;
}
```

- [ ] **Step 4: Run test to verify it passes** — expect 2 passing.

- [ ] **Step 5: Implement `src/app/api/cli/token/route.ts`**

```typescript
import { resolveOidcAccessToken } from "@/lib/oidc-token";
import { resolveUserOrg } from "@/lib/console";
import { createToken } from "@/lib/token";

export async function POST(req: Request): Promise<Response> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const id = m && (await resolveOidcAccessToken(m[1]));
  if (!id) {
    return Response.json({ error: { code: "unauthorized", message: "Invalid OIDC token" } }, { status: 401 });
  }
  const org = await resolveUserOrg(id.userId);
  if (!org) {
    return Response.json({ error: { code: "no_org", message: "No organization" } }, { status: 400 });
  }
  const { plaintext } = await createToken({ userId: id.userId, organizationId: org, name: "CLI" });
  return Response.json({ token: plaintext });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/oidc-token.ts src/lib/oidc-token.test.ts src/app/api/cli/token
git commit -m "feat: mint durable api_token from a valid oidc access token"
```

---

### Task 3: Rewrite CLI `login` to the oidc code+PKCE+loopback flow

**Files:**
- Rewrite: `cli/src/login.ts`, `cli/src/login.test.ts`
- Modify: `cli/src/cli.ts` (login stays wired to `browserLogin`; token/env fallback kept)

**Interfaces:**
- Produces (pure, unit-tested): `pkcePair()` → `{ verifier, challenge }` (S256); `buildAuthorizeUrl(appOrigin, { clientId, redirectUri, state, challenge })`; `parseCallback(reqUrl, state)` → `{ code }`; `pickRedirect(candidates)` (first bindable). `browserLogin(apiBase)` → durable api_token.

- [ ] **Step 1: Write the failing test `cli/src/login.test.ts`** (pure pieces)

```typescript
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { appOriginFrom, pkcePair, buildAuthorizeUrl, parseCallback } from "./login";

describe("pkcePair", () => {
  it("challenge is base64url(sha256(verifier))", () => {
    const { verifier, challenge } = pkcePair();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });
});
describe("buildAuthorizeUrl", () => {
  it("sets oauth2 params", () => {
    const u = new URL(buildAuthorizeUrl("https://app.x", { clientId: "kiosk-cli", redirectUri: "http://127.0.0.1:8976/callback", state: "s", challenge: "c" }));
    expect(u.pathname).toBe("/oauth2/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("kiosk-cli");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe("c");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8976/callback");
  });
});
describe("parseCallback", () => {
  it("returns code when state matches; throws otherwise", () => {
    expect(parseCallback("/callback?code=abc&state=s", "s")).toEqual({ code: "abc" });
    expect(() => parseCallback("/callback?code=abc&state=x", "s")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

- [ ] **Step 3: Rewrite `cli/src/login.ts`**

```typescript
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { openBrowser } from "./browser.js";

const CLIENT_ID = "kiosk-cli";
const REDIRECT_PORTS = [8976, 8977, 8978];

export function appOriginFrom(apiBase: string): string {
  return apiBase.replace(/\/api\/v1\/?$/, "");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  appOrigin: string,
  p: { clientId: string; redirectUri: string; state: string; challenge: string },
): string {
  const u = new URL(`${appOrigin}/oauth2/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export function parseCallback(reqUrl: string, expectedState: string): { code: string } {
  const u = new URL(reqUrl, "http://127.0.0.1");
  if (u.searchParams.get("state") !== expectedState) throw new Error("state mismatch");
  const code = u.searchParams.get("code");
  if (!code) throw new Error("missing code");
  return { code };
}

/** Bind the first free candidate loopback port; returns { server, port } (listening). */
function listenOnCandidate(handler: Parameters<typeof createServer>[1]): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (i: number) => {
      if (i >= REDIRECT_PORTS.length) return reject(new Error(`No free port among ${REDIRECT_PORTS.join(", ")} for the login callback`));
      const server = createServer(handler);
      server.once("error", () => tryPort(i + 1));
      server.listen(REDIRECT_PORTS[i], "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port }));
    };
    tryPort(0);
  });
}

/** oidc auth-code + PKCE + loopback → exchange for oidc token → mint durable api_token. */
export async function browserLogin(apiBase: string): Promise<string> {
  const appOrigin = appOriginFrom(apiBase);
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(16).toString("hex");

  const code = await new Promise<string>((resolve, reject) => {
    listenOnCandidate((req, res) => {
      const url = req.url ?? "/";
      if (!url.startsWith("/callback")) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>Kiosk</h1><p>Login complete — you can close this tab.</p>");
      resolvedServer?.close();
      try { resolve(parseCallback(url, state).code); } catch (e) { reject(e as Error); }
    })
      .then(({ server, port }) => {
        resolvedServer = server;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const authUrl = buildAuthorizeUrl(appOrigin, { clientId: CLIENT_ID, redirectUri, state, challenge });
        // stash the redirectUri used, for the token exchange
        chosenRedirect = redirectUri;
        process.stdout.write(`Opening your browser to log in:\n  ${authUrl}\n`);
        openBrowser(authUrl);
      })
      .catch(reject);
  });

  // Exchange code -> oidc access token (PKCE)
  const tokenRes = await fetch(`${appOrigin}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: chosenRedirect,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed: HTTP ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Mint a durable api_token
  const mintRes = await fetch(`${appOrigin}/api/cli/token`, {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!mintRes.ok) throw new Error(`token mint failed: HTTP ${mintRes.status}`);
  return ((await mintRes.json()) as { token: string }).token;
}

let resolvedServer: ReturnType<typeof createServer> | undefined;
let chosenRedirect = "";
```
> Note the module-level `resolvedServer`/`chosenRedirect` are a pragmatic single-flight stash for one interactive login; acceptable for a one-shot CLI process. If a reviewer dislikes it, refactor `browserLogin` to close over locals (see execution note).

- [ ] **Step 4: Run test to verify it passes** (pure pieces: pkce, authorize URL, callback parse).

- [ ] **Step 5: Confirm `cli/src/cli.ts` login wiring** — the `login` case still: if `--token`/`KIOSK_TOKEN` → validate + save (headless); else `await browserLogin(cfg.apiBase)` → save the returned api_token. (No change from Plan 4b except `browserLogin` now returns the minted api_token — same shape.)

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm exec tsc -p cli/tsconfig.json --noEmit
git add cli/src/login.ts cli/src/login.test.ts cli/src/cli.ts
git commit -m "feat(cli): oidc auth-code + PKCE + loopback login, mint durable api_token"
```

---

### Task 4: Full gate + manual smoke

- [ ] **Step 1: Full test + build**

Run: `pnpm test && pnpm build && pnpm exec tsc -p cli/tsconfig.json --noEmit`
Expected: all pass; routes list `/api/cli/token` + oidc endpoints; no `/cli/authorize`, `/api/cli/exchange`, or `cli_auth_code`.

- [ ] **Step 2: Manual smoke (needs OAuth creds + browser, dev on the aligned port)**

`KIOSK_API_BASE=http://localhost:<port>/api/v1 pnpm -C /Users/kevin/Code/kiosk exec tsx cli/src/cli.ts login`
Expected: browser opens `/oauth2/authorize` → (OAuth login if needed, no consent) → loopback "Login complete" → terminal prints "Logged in." → `~/.config/kiosk/config.json` has a `kiosk_live_` token → `kiosk publish` works with it.

- [ ] **Step 3: Commit any fixes.**

---

## Self-Review

**1. Spec coverage (§4.4 revised):** standard oidcProvider auth-code+PKCE+loopback (Task 1, 3); trusted public `kiosk-cli` + skipConsent + fixed candidate ports (Task 1, 3); mint durable api_token via oauthAccessToken lookup (Task 2); `/api/v1` unchanged; KIOSK_TOKEN fallback kept (Task 3). Custom cli-auth removed (Task 1). ✓

**2. Placeholder scan:** none. Three items are explicit **verify-then-implement** steps (trusted-client public field, `oauthAccessToken` columns, loginPage continuation) — inspected against installed source during execution, exactly as the redirect-matching was verified.

**3. Type consistency:** `browserLogin(apiBase) → Promise<string>` (durable api_token) — same return shape the `login` command already consumes. `resolveOidcAccessToken(bearer) → { userId } | null` used by the mint route. `createToken`/`resolveUserOrg` reused with existing signatures. `pkcePair`/`buildAuthorizeUrl`/`parseCallback` defined + unit-tested in Task 3.
