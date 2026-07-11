# Kiosk P2 · Plan 3 — Serving Visibility Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `org`-visibility pages on the cookieless `SERVE_ORIGIN` via a short-lived HMAC token that the cookie'd `APP_ORIGIN` issues after checking session + org membership. `public` pages keep serving directly.

**Architecture:** A stateless signed-token lib (HMAC-SHA256, ~2 min TTL). `GET /p/<id>`: `public` → serve; `org` → require a valid `?k=` token whose `orgId` matches the page, else 302 to `APP_ORIGIN/serve-auth`. `GET /serve-auth` (app origin, has session) verifies membership and 302s back to `SERVE_ORIGIN/p/<id>?k=<token>`. No cookie is ever set on the serve origin.

**Tech Stack:** Node `crypto` (HMAC), Next.js route handlers, Drizzle, Vitest.

> Spec: `docs/specs/2026-07-10-kiosk-p2-orgs-permissions-design.md` §7, §11. Consumes Plan 1 (`pages.visibility`).

## Global Constraints

- Two origins: `APP_ORIGIN` (session cookie) and `SERVE_ORIGIN` (**no cookie ever**). All user HTML — public and org — serves from `SERVE_ORIGIN`.
- Token secret = `process.env.BETTER_AUTH_SECRET` (shared by both origins, same env). TTL ≈ 120s.
- Token payload = `{ o: orgId, u: userId, e: expMs }`; serve verifies signature + expiry + `o === page.organizationId`.
- Served page headers/CSP unchanged (`servedPageHeaders()`), stays embeddable + noindex.
- No middleware change: `/serve-auth` is non-`/p/`, so it is app-origin-only under existing host rules.
- Commits carry **no AI attribution**.

---

### Task 1: signed serve-token lib

**Files:**
- Create: `src/lib/serve-token.ts`, `src/lib/serve-token.test.ts`

**Interfaces:**
- Produces:
  - `signServeToken(orgId: string, userId: string, ttlMs?: number): string`
  - `verifyServeToken(token: string): { orgId: string; userId: string } | null`

- [ ] **Step 1: Write the failing test `src/lib/serve-token.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { signServeToken, verifyServeToken } from "./serve-token";

describe("serve-token", () => {
  it("round-trips org + user", () => {
    const t = signServeToken("org_1", "user_1");
    expect(verifyServeToken(t)).toEqual({ orgId: "org_1", userId: "user_1" });
  });
  it("rejects a tampered signature", () => {
    const t = signServeToken("org_1", "user_1");
    expect(verifyServeToken(t.slice(0, -2) + "xy")).toBeNull();
  });
  it("rejects an expired token", () => {
    const t = signServeToken("org_1", "user_1", -1000); // already expired
    expect(verifyServeToken(t)).toBeNull();
  });
  it("rejects garbage", () => {
    expect(verifyServeToken("nonsense")).toBeNull();
    expect(verifyServeToken("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run src/lib/serve-token.test.ts` → module missing.

- [ ] **Step 3: Implement `src/lib/serve-token.ts`**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 120_000; // ~2 min

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? "";
}

/** Short-lived signed grant that the serve origin trusts (issued by the app origin). */
export function signServeToken(
  orgId: string,
  userId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const payload = { o: orgId, u: userId, e: Date.now() + ttlMs };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyServeToken(
  token: string,
): { orgId: string; userId: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let obj: { o?: unknown; u?: unknown; e?: unknown };
  try {
    obj = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof obj.o !== "string" ||
    typeof obj.u !== "string" ||
    typeof obj.e !== "number" ||
    Date.now() > obj.e
  ) {
    return null;
  }
  return { orgId: obj.o, userId: obj.u };
}
```

- [ ] **Step 4: Run to verify it passes** — expect 4 green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/serve-token.ts src/lib/serve-token.test.ts
git commit -m "feat: short-lived HMAC serve-token for org-only page access"
```

---

### Task 2: `/p/[publicId]` visibility gate

**Files:**
- Modify: `src/app/p/[publicId]/route.ts`
- Modify: `src/app/p/[publicId]/route.test.ts`

**Interfaces:**
- Consumes: `verifyServeToken` (Task 1), `getPublicPage` (has `visibility`, `organizationId`).
- Behavior: `public` → serve; `org` + valid `?k` (matching org) → serve; `org` + missing/invalid `k` → 302 to `${APP_ORIGIN}/serve-auth?next=<publicId>`.

- [ ] **Step 1: Add failing cases to `src/app/p/[publicId]/route.test.ts`**

Merge these (import `signServeToken` from `@/lib/serve-token`, `createPage`/`setPageVisibility` from `@/lib/pages`, `createPrincipal`/`cleanupPrincipal`):

```typescript
import { signServeToken } from "@/lib/serve-token";
import { createPage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

const pctx = (id: string) => ({ params: Promise.resolve({ publicId: id }) });

describe("/p gate (org visibility)", () => {
  it("org page without a token redirects to serve-auth", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>secret</h1>" }); // default org
      const res = await GET(new Request(`http://serve/p/${page.publicId}`), pctx(page.publicId));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/serve-auth?next=" + page.publicId);
    } finally { await cleanupPrincipal(p); }
  });

  it("org page with a valid matching token serves", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>secret</h1>" });
      const k = signServeToken(p.organizationId, p.userId);
      const res = await GET(new Request(`http://serve/p/${page.publicId}?k=${k}`), pctx(page.publicId));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("secret");
    } finally { await cleanupPrincipal(p); }
  });

  it("org page with a token for another org redirects", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>secret</h1>" });
      const k = signServeToken("some-other-org", p.userId);
      const res = await GET(new Request(`http://serve/p/${page.publicId}?k=${k}`), pctx(page.publicId));
      expect(res.status).toBe(302);
    } finally { await cleanupPrincipal(p); }
  });
});
```

> Existing tests publish via the API (default now `org`) then GET `/p/:id` expecting 200 — those will now 302. **Update any existing serve-route test** that expects a public 200 to first flip the page to `public` (call `setPageVisibility(...,'public')` or publish with `X-Kiosk-Visibility: public`) before asserting 200. Inspect the file and adjust.

- [ ] **Step 2: Run to verify it fails** — org-without-token still 200 (no gate yet).

- [ ] **Step 3: Implement the gate in `src/app/p/[publicId]/route.ts`**

```typescript
import { getPublicPage, incrementViewCount } from "@/lib/pages";
import { servedPageHeaders, notFoundResponse } from "@/lib/serving";
import { verifyServeToken } from "@/lib/serve-token";

type Ctx = { params: Promise<{ publicId: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { publicId } = await params;
  const page = await getPublicPage(publicId);
  if (!page) return notFoundResponse();

  if (page.visibility !== "public") {
    // org-only: require a valid, unexpired token minted for this page's org.
    const k = new URL(req.url).searchParams.get("k") ?? "";
    const grant = verifyServeToken(k);
    if (!grant || grant.orgId !== page.organizationId) {
      const url = `${process.env.APP_ORIGIN}/serve-auth?next=${encodeURIComponent(publicId)}`;
      return Response.redirect(url, 302);
    }
  }

  void incrementViewCount(page.id).catch(() => {});
  return new Response(page.contentHtml, { headers: servedPageHeaders() });
}
```

- [ ] **Step 4: Run to verify it passes** — new gate cases green; existing (now-public) cases green.

- [ ] **Step 5: Commit**

```bash
git add src/app/p/[publicId]
git commit -m "feat: gate org-visibility pages behind a signed serve-token"
```

---

### Task 3: `/serve-auth` endpoint (app origin) + gate the full flow

**Files:**
- Create: `src/app/serve-auth/route.ts`, `src/app/serve-auth/route.test.ts`
- Modify: `src/lib/console.ts` (add `isOrgMember`)

**Interfaces:**
- Consumes: `getSession`, `getPublicPage`, `signServeToken`, `isOrgMember`.
- Produces: `GET /serve-auth?next=<publicId>` → 302 to `SERVE_ORIGIN/p/<id>?k=<token>` (member) / `/sign-in?callback=...` (no session) / 403 (not a member); `isOrgMember(userId, orgId) => Promise<boolean>`.

- [ ] **Step 1: Add `isOrgMember` to `src/lib/console.ts`**

```typescript
import { and } from "drizzle-orm"; // add to existing "drizzle-orm" import ({ and, eq })

/** True if the user is a member of the given org. */
export async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return !!m;
}
```

- [ ] **Step 2: Write the failing test `src/app/serve-auth/route.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /serve-auth", () => {
  it("redirects to sign-in when there is no session", async () => {
    const res = await GET(
      new Request("http://app.local/serve-auth?next=abc123"),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/sign-in");
    expect(res.headers.get("location")).toContain("serve-auth");
  });
  it("400s without next", async () => {
    const res = await GET(new Request("http://app.local/serve-auth"));
    expect(res.status).toBe(400);
  });
});
```

> The member→token happy path needs a real session cookie; it is covered by the manual e2e in Step 6 (like the OAuth flow).

- [ ] **Step 3: Run to verify it fails** — module missing.

- [ ] **Step 4: Implement `src/app/serve-auth/route.ts`**

```typescript
import { getSession } from "@/lib/session";
import { getPublicPage } from "@/lib/pages";
import { isOrgMember } from "@/lib/console";
import { signServeToken } from "@/lib/serve-token";

/**
 * App-origin gate for org-only pages. The serve origin (cookieless) bounces
 * unauthenticated /p requests here; we check session + membership and hand back
 * a short-lived signed token to the serve origin. No cookie is set on serve.
 */
export async function GET(req: Request): Promise<Response> {
  const next = new URL(req.url).searchParams.get("next");
  if (!next) return new Response("Missing next", { status: 400 });

  const session = await getSession();
  if (!session) {
    const callback = `/serve-auth?next=${encodeURIComponent(next)}`;
    return Response.redirect(
      `${process.env.APP_ORIGIN}/sign-in?callback=${encodeURIComponent(callback)}`,
      302,
    );
  }

  const page = await getPublicPage(next);
  if (!page) return new Response("Not found", { status: 404 });

  if (page.visibility === "public") {
    return Response.redirect(`${process.env.SERVE_ORIGIN}/p/${next}`, 302);
  }

  if (!(await isOrgMember(session.user.id, page.organizationId))) {
    return new Response("You do not have access to this page.", { status: 403 });
  }

  const k = signServeToken(page.organizationId, session.user.id);
  return Response.redirect(
    `${process.env.SERVE_ORIGIN}/p/${next}?k=${encodeURIComponent(k)}`,
    302,
  );
}
```

- [ ] **Step 5: Run tests + full gate**

Run: `pnpm exec vitest run src/app/serve-auth src/lib/serve-token src/app/p && pnpm test && pnpm build`
Expected: all pass; build clean; `/serve-auth` in the route list.

- [ ] **Step 6: Commit**

```bash
git add src/app/serve-auth src/lib/console.ts
git commit -m "feat: /serve-auth issues serve-tokens for org members"
```

- [ ] **Step 7: Manual e2e note (needs browser + login)**

With dev on :58671 and hosts set (`serve.kiosk.test`): publish a page (default org), open `http://serve.kiosk.test:58671/p/<id>` while logged in as an org member → bounces through `/serve-auth` → renders. Logged-out / non-member → sign-in / 403. Flip to public (`PATCH`) → renders with no bounce.

---

## Self-Review

**1. Spec coverage (§7, §11):** public direct-serve ✓; org → cookieless signed-token gate (serve→app→serve) ✓ (Task 2 + 3); token = orgId+userId+exp, HMAC, ~2 min ✓ (Task 1); serve verifies signature + expiry + org match, sets no cookie ✓; non-member 403 / unauth → sign-in ✓ (Task 3). ✓

**2. Placeholder scan:** none. Step 1/Task 2 flags an inspect-and-adjust for pre-existing serve tests (concrete action, not a placeholder).

**3. Type consistency:** `signServeToken(orgId, userId, ttlMs?) → string` / `verifyServeToken(token) → {orgId,userId}|null` used identically in the `/p` gate and tests; `isOrgMember(userId, organizationId) → Promise<boolean>` matches the `/serve-auth` call; env names `APP_ORIGIN`/`SERVE_ORIGIN`/`BETTER_AUTH_SECRET` consistent with `.env` and existing code.
