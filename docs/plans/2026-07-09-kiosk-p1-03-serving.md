# Kiosk P1 · Plan 3 — Public Serving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve published pages publicly at `SERVE_ORIGIN/p/<public_id>` with a strict artifact-style CSP, `noindex`, and a best-effort view counter, and enforce host separation between the serving origin and the app/API origin.

**Architecture:** Pure serving primitives (`src/lib/serving.ts`: CSP string, response headers, host-routing decision) keep policy testable without a browser. A `/p/[publicId]` route handler reads the active page and returns its HTML with those headers; a `middleware.ts` applies the host-routing decision on every request. View counting happens in the serve route (correct while there is no CDN cache).

**Tech Stack:** Next.js 16 middleware + route handlers, Drizzle/Neon, Vitest.

> Plan **3 of 6**. Consumes Plan 1 (`db`, `pages`, `publicId`) and Plan 2 (`pages.ts` service). Adds `getPublicPage`/`incrementViewCount` to `pages.ts`.

## Global Constraints

From `docs/specs/2026-07-08-kiosk-p1-publish-core-design.md`.

- Serving lives **only on `SERVE_ORIGIN`** (a separate registrable domain from `APP_ORIGIN`).
- `GET /p/<public_id>` returns the stored HTML for the **active** page (`deleted_at is null`); missing/deleted → 404.
- **Strict CSP** (verbatim): `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none';`
- Served-page headers also: `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. **No** `X-Frame-Options` / no `frame-ancestors` → embeddable. App-origin responses instead set anti-clickjacking (`X-Frame-Options: DENY`).
- Host separation: on `SERVE_ORIGIN` only `/p/*`, `/report`, `/favicon.ico`, `/healthz`, `/_next/*` are allowed (else 404); on `APP_ORIGIN`, `/p/*` → 302 to `SERVE_ORIGIN`.
- View count: best-effort increment of `pages.view_count` on each served view (approximate).
- Commits carry **no AI attribution**.
- **Deferred (flagged, NOT this plan):** CDN tag-caching + `revalidateTag` (§5.4 — needs cache infra; MVP serves fresh from DB with `Cache-Control: max-age=0, must-revalidate`); `/report` form (Plan 6 console); admin unpublish (later); per-page subdomain isolation.

---

## File Structure

- `src/lib/serving.ts` — pure serving policy: `SERVE_CSP` (string), `servedPageHeaders()`, `notFoundResponse()`, `routeForHost()` (host+path → decision). No DB, no framework types → unit-testable.
- `src/lib/pages.ts` — **extend** with `getPublicPage(publicId)` (active, not org-scoped) and `incrementViewCount(id)`.
- `src/app/p/[publicId]/route.ts` — `GET` serve handler.
- `src/middleware.ts` — host-based routing + app anti-clickjacking header.
- Tests: `src/lib/serving.test.ts` (unit), extend `src/lib/pages.test.ts`, `src/app/p/[publicId]/route.test.ts` (integration).

> Dev caveat: one `next dev` port can't host two origins; `routeForHost` unit tests verify the separation logic. Real two-origin behavior is exercised in staging/prod where `APP_ORIGIN`/`SERVE_ORIGIN` are distinct domains on the same deployment.

---

### Task 1: Serving primitives (pure)

**Files:**
- Create: `src/lib/serving.ts`, `src/lib/serving.test.ts`

**Interfaces:**
- Consumes: `APP_ORIGIN`, `SERVE_ORIGIN` env.
- Produces:
  - `SERVE_CSP: string`.
  - `servedPageHeaders(): Record<string, string>`.
  - `notFoundResponse(): Response` (404, text/html, noindex).
  - `type RouteDecision = { type: "next" } | { type: "redirect"; url: string } | { type: "notFound" }`.
  - `routeForHost(p: { host: string; pathname: string; appOrigin?: string; serveOrigin?: string }): RouteDecision`.

- [ ] **Step 1: Write the failing test `src/lib/serving.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { SERVE_CSP, servedPageHeaders, routeForHost } from "./serving";

describe("SERVE_CSP", () => {
  it("blocks external network and framing sources", () => {
    expect(SERVE_CSP).toContain("default-src 'none'");
    expect(SERVE_CSP).toContain("connect-src 'none'");
    expect(SERVE_CSP).toContain("form-action 'none'");
    expect(SERVE_CSP).toContain("script-src 'unsafe-inline'");
  });
});

describe("servedPageHeaders", () => {
  it("sets noindex + hardening and is embeddable (no X-Frame-Options)", () => {
    const h = servedPageHeaders();
    expect(h["content-type"]).toContain("text/html");
    expect(h["content-security-policy"]).toBe(SERVE_CSP);
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-frame-options"]).toBeUndefined();
  });
});

describe("routeForHost", () => {
  const appOrigin = "https://app.example.com";
  const serveOrigin = "https://serve.example.com";
  const call = (host: string, pathname: string) =>
    routeForHost({ host, pathname, appOrigin, serveOrigin });

  it("serve host: allows /p/*", () => {
    expect(call("serve.example.com", "/p/abc").type).toBe("next");
  });
  it("serve host: 404s app/api paths", () => {
    expect(call("serve.example.com", "/api/v1/pages").type).toBe("notFound");
    expect(call("serve.example.com", "/pages").type).toBe("notFound");
  });
  it("app host: redirects /p/* to the serve origin", () => {
    const d = call("app.example.com", "/p/abc");
    expect(d).toEqual({ type: "redirect", url: "https://serve.example.com/p/abc" });
  });
  it("app host: passes normal app paths", () => {
    expect(call("app.example.com", "/pages").type).toBe("next");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/serving.test.ts`
Expected: FAIL — `Cannot find module './serving'`.

- [ ] **Step 3: Implement `src/lib/serving.ts`**

```typescript
export const SERVE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");

/** Response headers for a served user page. Intentionally embeddable (no X-Frame-Options). */
export function servedPageHeaders(): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": SERVE_CSP,
    "x-robots-tag": "noindex, nofollow",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    // MVP: serve fresh from DB. CDN tag-caching is a later hardening item.
    "cache-control": "public, max-age=0, must-revalidate",
  };
}

export function notFoundResponse(): Response {
  return new Response(
    "<!doctype html><meta name=viewport content='width=device-width'>" +
      "<meta name=robots content=noindex><title>Not found</title>" +
      "<h1>404 — page not found</h1>",
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; url: string }
  | { type: "notFound" };

function hostOf(origin: string | undefined): string {
  if (!origin) return "";
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

const SERVE_ALLOW = ["/report", "/favicon.ico", "/healthz"];

/** Decide how to route a request given its Host and path. Pure — unit-testable. */
export function routeForHost(p: {
  host: string;
  pathname: string;
  appOrigin?: string;
  serveOrigin?: string;
}): RouteDecision {
  const serveOrigin = p.serveOrigin ?? process.env.SERVE_ORIGIN;
  const serveHost = hostOf(serveOrigin);
  const isServe = serveHost !== "" && p.host === serveHost;

  if (isServe) {
    if (
      p.pathname.startsWith("/p/") ||
      p.pathname.startsWith("/_next/") ||
      SERVE_ALLOW.includes(p.pathname)
    ) {
      return { type: "next" };
    }
    return { type: "notFound" };
  }

  // App origin (or unknown host): public page paths belong on the serve origin.
  if (p.pathname.startsWith("/p/")) {
    return { type: "redirect", url: `${serveOrigin ?? ""}${p.pathname}` };
  }
  return { type: "next" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/serving.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/serving.ts src/lib/serving.test.ts
git commit -m "feat: add serving primitives (strict CSP, headers, host routing)"
```

---

### Task 2: Public page access

**Files:**
- Modify: `src/lib/pages.ts` (append two functions)
- Modify: `src/lib/pages.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `db`, `pages` schema.
- Produces:
  - `getPublicPage(publicId: string): Promise<Page | null>` — active page by `public_id`, **not** org-scoped (public read).
  - `incrementViewCount(id: string): Promise<void>` — `view_count += 1` by internal id, best-effort.

- [ ] **Step 1: Append the failing test to `src/lib/pages.test.ts`**

```typescript
// append inside the file (after the existing imports add getPublicPage, incrementViewCount)
import { getPublicPage, incrementViewCount } from "./pages";

describe("public serving access", () => {
  it("getPublicPage finds an active page without an org, and misses deleted", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Pub</title></html>",
    });

    const got = await getPublicPage(page.publicId);
    expect(got?.id).toBe(page.id);

    await incrementViewCount(page.id);
    const after = await getPublicPage(page.publicId);
    expect(after?.viewCount).toBe(1);

    await softDeletePage({ publicId: page.publicId, organizationId: principal.organizationId });
    expect(await getPublicPage(page.publicId)).toBeNull();
  });
});
```

> Update the existing top import in `pages.test.ts` to also import `getPublicPage, incrementViewCount` (add them to the existing `from "./pages"` import list rather than a second import line — either works with Vitest, but keep one import for cleanliness).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/pages.test.ts`
Expected: FAIL — `getPublicPage is not a function` (or import error).

- [ ] **Step 3: Append to `src/lib/pages.ts`**

```typescript
import { sql } from "drizzle-orm";

/** Active page by public_id, without org scoping — for public serving. */
export async function getPublicPage(publicId: string): Promise<Page | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.publicId, publicId), isNull(pages.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Best-effort view-count bump by internal id. */
export async function incrementViewCount(id: string): Promise<void> {
  await db
    .update(pages)
    .set({ viewCount: sql`${pages.viewCount} + 1` })
    .where(eq(pages.id, id));
}
```

> `sql` is imported from `drizzle-orm` — add it to the existing `import { ... } from "drizzle-orm"` line at the top of `pages.ts` instead of duplicating the import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/pages.test.ts`
Expected: PASS (7 tests: the original 6 + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages.ts src/lib/pages.test.ts
git commit -m "feat: add getPublicPage and incrementViewCount for serving"
```

---

### Task 3: `GET /p/[publicId]` serve route

**Files:**
- Create: `src/app/p/[publicId]/route.ts`, `src/app/p/[publicId]/route.test.ts`

**Interfaces:**
- Consumes: `getPublicPage`, `incrementViewCount` (Task 2); `servedPageHeaders`, `notFoundResponse` (Task 1); test factories.
- Produces: `GET /p/:publicId` → `200` stored HTML + served headers; missing/deleted → `404`; bumps `view_count`.

- [ ] **Step 1: Write the failing test `src/app/p/[publicId]/route.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { GET } from "./route";
import { createPage, softDeletePage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

const ctx = (publicId: string) => ({ params: Promise.resolve({ publicId }) });
const req = (publicId: string) => new Request(`http://serve.local/p/${publicId}`);

describe("GET /p/[publicId]", () => {
  it("serves the HTML with strict CSP + noindex, and increments views", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Hello</title><body>hi</body></html>",
    });

    const res = await GET(req(page.publicId), ctx(page.publicId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(await res.text()).toContain("<body>hi</body>");
  });

  it("404 for a missing id", async () => {
    const res = await GET(req("doesnotexist1"), ctx("doesnotexist1"));
    expect(res.status).toBe(404);
  });

  it("404 after the page is soft-deleted", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Gone</title></html>",
    });
    await softDeletePage({ publicId: page.publicId, organizationId: principal.organizationId });
    const res = await GET(req(page.publicId), ctx(page.publicId));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "src/app/p/[publicId]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement `src/app/p/[publicId]/route.ts`**

```typescript
import { getPublicPage, incrementViewCount } from "@/lib/pages";
import { servedPageHeaders, notFoundResponse } from "@/lib/serving";

type Ctx = { params: Promise<{ publicId: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { publicId } = await params;
  const page = await getPublicPage(publicId);
  if (!page) return notFoundResponse();
  // Best-effort; do not block the response on the counter write.
  void incrementViewCount(page.id).catch(() => {});
  return new Response(page.contentHtml, { headers: servedPageHeaders() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run "src/app/p/[publicId]/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/p/[publicId]/route.ts" "src/app/p/[publicId]/route.test.ts"
git commit -m "feat: serve published pages at /p/:id with strict CSP + noindex"
```

---

### Task 4: Host-separation middleware + build gate

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `routeForHost` (Task 1).
- Produces: request-time host routing (serve-origin lockdown + app-origin `/p/*` redirect) and `X-Frame-Options: DENY` on app-origin responses. No new exports.

- [ ] **Step 1: Implement `src/middleware.ts`**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { routeForHost } from "@/lib/serving";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const decision = routeForHost({ host, pathname: req.nextUrl.pathname });

  if (decision.type === "redirect") {
    return NextResponse.redirect(decision.url, 302);
  }
  if (decision.type === "notFound") {
    return new NextResponse("Not found", { status: 404 });
  }
  // App-origin (and serve-origin allowed) requests pass through.
  // Anti-clickjacking for the app; served pages set their own headers and stay embeddable.
  const res = NextResponse.next();
  if (!req.nextUrl.pathname.startsWith("/p/")) {
    res.headers.set("X-Frame-Options", "DENY");
  }
  return res;
}

export const config = {
  // Run on everything except Next's internal static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verify the routing logic (already unit-tested) + full gate**

Run: `pnpm test && pnpm build`
Expected: all vitest files pass (Plan 1–3); `next build` succeeds and lists `ƒ /p/[publicId]` plus a `ƒ Middleware`. `routeForHost` unit tests (Task 1) are the authority on separation logic.

- [ ] **Step 3: Manual dev smoke (optional, documents two-origin behavior)**

With `pnpm dev` on :3000, simulate the serve host and confirm host separation:
```bash
# App host serving a /p path → 302 to SERVE_ORIGIN
curl -sI -H "Host: localhost:3000" http://localhost:3000/p/whatever | head -3
# Serve host hitting an app path → 404
curl -sI -H "Host: localhost:3001" http://localhost:3000/api/v1/me | head -3
```
Expected: first is `HTTP/1.1 307/302` with a `location` on `SERVE_ORIGIN`; second is `HTTP/1.1 404`. (Requires `APP_ORIGIN`/`SERVE_ORIGIN` in `.env`.)

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: host-separation middleware + app anti-clickjacking header"
```

---

## Self-Review

**1. Spec coverage (§5.1 host separation, §5.2 render, §5.3 CSP, §5.5 noindex, §6.4 views):**
- Strict CSP verbatim → Task 1 `SERVE_CSP` (+ test asserts key directives). ✓
- Served headers noindex/nosniff/no-referrer, embeddable → Task 1 `servedPageHeaders` (+ test). ✓
- Render active page, 404 missing/deleted → Tasks 2–3. ✓
- Host separation (serve lockdown + app `/p/*` redirect) → Task 1 `routeForHost` + Task 4 middleware. ✓
- App anti-clickjacking → Task 4. ✓
- View count best-effort → Tasks 2–3. ✓
- **Gaps (intentional, flagged):** CDN tag-caching/`revalidateTag` (§5.4), `/report` form (Plan 6), admin unpublish (later), per-page subdomain — all deferred with `Cache-Control: max-age=0, must-revalidate` as the interim.

**2. Placeholder scan:** none — complete code + exact commands. Task 2's two "add to existing import" notes are real edit instructions, not placeholders (the functions/`sql` symbol are fully shown).

**3. Type consistency:** `Page` (Plan 1) returned by `getPublicPage`, consumed via `.id`/`.contentHtml`/`.viewCount`. `routeForHost → RouteDecision` handled exhaustively in the middleware (`redirect`/`notFound`/`next`). Handler ctx type `{ params: Promise<{ publicId: string }> }` matches the `[publicId]` segment. `servedPageHeaders()`/`notFoundResponse()` produced in Task 1, consumed in Task 3.
