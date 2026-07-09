# Kiosk P1 · Plan 2 — Publish API (REST v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the token-authenticated REST API (`/api/v1`) the CLI and curl use to create, update, list, fetch, and delete pages, plus `GET /me`.

**Architecture:** Thin Next.js App Router route handlers over two plumbing modules — `src/lib/api.ts` (Bearer-token auth + `ApiError` + JSON/error responses) and `src/lib/pages.ts` (page business logic + DB). Handlers parse the request, call a service function, and format the response; all errors funnel through one envelope. Integration tests exercise handlers against the real Neon DB, which also covers the `createToken`/`verifyToken` round-trip from Plan 1.

**Tech Stack:** Next.js 16 App Router route handlers (Web `Request`/`Response`), Drizzle ORM, Neon, Vitest.

> Plan **2 of 6** for P1. Consumes Plan 1: `db`, `pages`/`apiToken`/`user`/`organization` schema, `publicId`, `verifyToken`/`createToken`, `provisionPersonalOrg`.

## Global Constraints

Copied from `docs/specs/2026-07-08-kiosk-p1-publish-core-design.md`. Every task implicitly includes these.

- API prefix `/api/v1`; auth `Authorization: Bearer kiosk_live_*` → `verifyToken()` → `{ userId, organizationId }`.
- **API `:id` is the `public_id`** (never expose the internal uuid).
- Request/response body for content is **raw `text/html`**; title via `X-Kiosk-Title` header, else derived from `<title>`.
- **Single page ≤ 2 MB** → `413`.
- Error envelope **`{ error: { code, message } }`** with correct HTTP status (400/401/404/413/500).
- All page queries filter `deleted_at is null` (soft delete).
- Every action scoped to caller's org: `page.organization_id === callerOrgId`.
- Commits carry **no AI attribution**.
- **Deferred (NOT this plan):** per-token rate limiting (spec §7.1 — needs a rate-limit store; hardening item), host separation (Plan 3), serving (Plan 3).

---

## File Structure

- `src/lib/api.ts` — API plumbing: `ApiError`, `errorResponse()`, `json()`, `requireToken()`. One responsibility: HTTP auth + response shaping.
- `src/lib/pages.ts` — page operations: `createPage`, `updatePage`, `getPage`, `listPages`, `softDeletePage`, `pageUrl`, `extractTitle`, `PageTooLargeError`. One responsibility: page business logic + DB.
- `src/app/api/v1/pages/route.ts` — `POST` (create) + `GET` (list).
- `src/app/api/v1/pages/[id]/route.ts` — `GET` (one) + `PUT` (update) + `DELETE` (soft delete).
- `src/app/api/v1/me/route.ts` — `GET` (token check + identity).
- `src/test/factories.ts` — `createPrincipal()` / `cleanupPrincipal()` test helpers (user + personal org + token). Shared by all API integration tests.
- Tests: `src/lib/api.test.ts`, `src/lib/pages.test.ts`, `src/app/api/v1/pages/route.test.ts`, `src/app/api/v1/pages/[id]/route.test.ts`, `src/app/api/v1/me/route.test.ts`.

Integration tests hit the real Neon DB (`.env` `DATABASE_URL`, loaded by `vitest.config.ts`) and clean up after themselves. `*.test.ts` files under `app/` are ignored by Next routing (only `route.ts`/`page.tsx` etc. are route files).

---

### Task 1: API plumbing + test factories

**Files:**
- Create: `src/lib/api.ts`, `src/test/factories.ts`, `src/lib/api.test.ts`

**Interfaces:**
- Consumes: `verifyToken` (Plan 1, `src/lib/token.ts`: `(bearer: string) => Promise<{ userId, organizationId, tokenId } | null>`); `createToken`, `provisionPersonalOrg`, `uuidv7`, schema `user`/`organization`/`member`/`apiToken`/`pages`.
- Produces:
  - `class ApiError extends Error { status: number; code: string }`.
  - `errorResponse(err: unknown): Response` — `ApiError` → its envelope+status; else logs + 500.
  - `json(data: unknown, status?: number): Response`.
  - `requireToken(req: Request): Promise<{ userId: string; organizationId: string }>` — throws `ApiError(401)` if missing/invalid.
  - `createPrincipal(): Promise<{ userId: string; organizationId: string; token: string }>` and `cleanupPrincipal(p): Promise<void>`.

- [ ] **Step 1: Write `src/test/factories.ts`**

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, organization, member, apiToken, pages } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { provisionPersonalOrg } from "@/lib/org";
import { createToken } from "@/lib/token";

/** Create a throwaway user + personal org + API token for integration tests. */
export async function createPrincipal() {
  const userId = uuidv7();
  await db.insert(user).values({
    id: userId,
    name: `T ${userId}`,
    email: `${userId}@t.local`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const organizationId = await provisionPersonalOrg(userId, `T ${userId}`);
  const { plaintext } = await createToken({ userId, organizationId, name: "test" });
  return { userId, organizationId, token: plaintext };
}

/** Remove everything created by createPrincipal (pages → tokens → member → org → user). */
export async function cleanupPrincipal(p: { userId: string; organizationId: string }) {
  await db.delete(pages).where(eq(pages.organizationId, p.organizationId));
  await db.delete(apiToken).where(eq(apiToken.organizationId, p.organizationId));
  await db.delete(member).where(eq(member.organizationId, p.organizationId));
  await db.delete(organization).where(eq(organization.id, p.organizationId));
  await db.delete(user).where(eq(user.id, p.userId));
}
```

- [ ] **Step 2: Write the failing test `src/lib/api.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { requireToken, ApiError } from "./api";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

function reqWithAuth(token?: string): Request {
  return new Request("http://localhost/api/v1/me", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("requireToken", () => {
  it("resolves the org/user for a valid token", async () => {
    principal = await createPrincipal();
    const id = await requireToken(reqWithAuth(principal.token));
    expect(id.organizationId).toBe(principal.organizationId);
    expect(id.userId).toBe(principal.userId);
  });
  it("throws ApiError 401 when the header is missing", async () => {
    await expect(requireToken(reqWithAuth())).rejects.toMatchObject({ status: 401 });
  });
  it("throws ApiError 401 for an unknown token", async () => {
    await expect(requireToken(reqWithAuth("kiosk_live_nope"))).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/api.test.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 4: Implement `src/lib/api.ts`**

```typescript
import { verifyToken } from "@/lib/token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }
  console.error("Unhandled API error:", err);
  return Response.json(
    { error: { code: "internal", message: "Internal server error" } },
    { status: 500 },
  );
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Verify the Bearer token; return caller identity or throw ApiError(401). */
export async function requireToken(
  req: Request,
): Promise<{ userId: string; organizationId: string }> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "unauthorized", "Missing Bearer token");
  const identity = await verifyToken(match[1]);
  if (!identity) throw new ApiError(401, "unauthorized", "Invalid or revoked token");
  return { userId: identity.userId, organizationId: identity.organizationId };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/api.test.ts`
Expected: PASS (3 tests). This also confirms Plan 1's `createToken` → `verifyToken` round-trip against Neon.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts src/test/factories.ts
git commit -m "feat: add API auth plumbing (requireToken, ApiError, response helpers)"
```

---

### Task 2: Page service

**Files:**
- Create: `src/lib/pages.ts`, `src/lib/pages.test.ts`

**Interfaces:**
- Consumes: `db`, `pages` schema, `publicId` (Plan 1), `SERVE_ORIGIN` env.
- Produces:
  - `pageUrl(publicId: string): string`.
  - `extractTitle(html: string): string | null`.
  - `class PageTooLargeError extends Error`.
  - `createPage({ organizationId, userId, html, title? }): Promise<Page>` (throws `PageTooLargeError`).
  - `updatePage({ publicId, organizationId, html, title? }): Promise<Page | null>` (null if not found/owned).
  - `getPage({ publicId, organizationId }): Promise<Page | null>`.
  - `softDeletePage({ publicId, organizationId }): Promise<boolean>`.
  - `listPages({ organizationId, cursor?, limit? }): Promise<{ items: Page[]; nextCursor: string | null }>`.

- [ ] **Step 1: Write the failing test `src/lib/pages.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import {
  extractTitle,
  pageUrl,
  createPage,
  updatePage,
  getPage,
  softDeletePage,
  listPages,
  PageTooLargeError,
} from "./pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("extractTitle", () => {
  it("pulls the <title>", () => {
    expect(extractTitle("<html><head><title> Hi </title></head></html>")).toBe("Hi");
  });
  it("returns null when absent", () => {
    expect(extractTitle("<div>no title</div>")).toBeNull();
  });
});

describe("pageUrl", () => {
  it("joins SERVE_ORIGIN and /p/<id>", () => {
    expect(pageUrl("abc123")).toBe(`${process.env.SERVE_ORIGIN}/p/abc123`);
  });
});

describe("page CRUD", () => {
  it("creates, reads, updates, lists, and soft-deletes within the org", async () => {
    principal = await createPrincipal();
    const org = principal.organizationId;

    const created = await createPage({
      organizationId: org,
      userId: principal.userId,
      html: "<html><title>First</title></html>",
    });
    expect(created.publicId).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(created.title).toBe("First");

    const fetched = await getPage({ publicId: created.publicId, organizationId: org });
    expect(fetched?.contentHtml).toContain("First");

    const updated = await updatePage({
      publicId: created.publicId,
      organizationId: org,
      html: "<html><title>Second</title></html>",
    });
    expect(updated?.title).toBe("Second");

    const list = await listPages({ organizationId: org });
    expect(list.items).toHaveLength(1);

    expect(await softDeletePage({ publicId: created.publicId, organizationId: org })).toBe(true);
    expect(await getPage({ publicId: created.publicId, organizationId: org })).toBeNull();
  });

  it("does not touch pages from another org", async () => {
    principal = await createPrincipal();
    const created = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>Mine</title></html>",
    });
    const otherOrg = "org-does-not-exist";
    expect(await getPage({ publicId: created.publicId, organizationId: otherOrg })).toBeNull();
    expect(await updatePage({ publicId: created.publicId, organizationId: otherOrg, html: "x" })).toBeNull();
    expect(await softDeletePage({ publicId: created.publicId, organizationId: otherOrg })).toBe(false);
  });

  it("rejects pages over 2MB", async () => {
    principal = await createPrincipal();
    const big = "<html>" + "a".repeat(2 * 1024 * 1024 + 1) + "</html>";
    await expect(
      createPage({ organizationId: principal.organizationId, userId: principal.userId, html: big }),
    ).rejects.toBeInstanceOf(PageTooLargeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pages.test.ts`
Expected: FAIL — `Cannot find module './pages'`.

- [ ] **Step 3: Implement `src/lib/pages.ts`**

```typescript
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { pages, type Page } from "@/db/schema";
import { publicId } from "@/lib/id";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export class PageTooLargeError extends Error {
  constructor() {
    super("Page exceeds 2MB limit");
    this.name = "PageTooLargeError";
  }
}

export function pageUrl(pid: string): string {
  return `${process.env.SERVE_ORIGIN}/p/${pid}`;
}

/** First <title> text, trimmed and capped, else null. */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].trim().slice(0, 300);
  return t.length ? t : null;
}

function sizeOf(html: string): number {
  return Buffer.byteLength(html, "utf8");
}
function hashOf(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export async function createPage(params: {
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
}): Promise<Page> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const [row] = await db
    .insert(pages)
    .values({
      publicId: publicId(),
      organizationId: params.organizationId,
      createdBy: params.userId,
      title: params.title ?? extractTitle(params.html),
      contentHtml: params.html,
      sizeBytes: size,
      contentHash: hashOf(params.html),
    })
    .returning();
  return row;
}

export async function updatePage(params: {
  publicId: string;
  organizationId: string;
  html: string;
  title?: string | null;
}): Promise<Page | null> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const [row] = await db
    .update(pages)
    .set({
      contentHtml: params.html,
      sizeBytes: size,
      contentHash: hashOf(params.html),
      title: params.title ?? extractTitle(params.html),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getPage(params: {
  publicId: string;
  organizationId: string;
}): Promise<Page | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function softDeletePage(params: {
  publicId: string;
  organizationId: string;
}): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(pages.publicId, params.publicId),
        eq(pages.organizationId, params.organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning({ id: pages.id });
  return !!row;
}

export async function listPages(params: {
  organizationId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ items: Page[]; nextCursor: string | null }> {
  const limit = Math.min(params.limit ?? 20, 100);
  const conds = [
    eq(pages.organizationId, params.organizationId),
    isNull(pages.deletedAt),
  ];
  if (params.cursor) conds.push(lt(pages.createdAt, new Date(params.cursor)));
  const rows = await db
    .select()
    .from(pages)
    .where(and(...conds))
    .orderBy(desc(pages.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return { items, nextCursor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pages.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages.ts src/lib/pages.test.ts
git commit -m "feat: add page service (create/update/get/list/soft-delete + title/size)"
```

---

### Task 3: `POST /api/v1/pages` + `GET /api/v1/pages`

**Files:**
- Create: `src/app/api/v1/pages/route.ts`, `src/app/api/v1/pages/route.test.ts`

**Interfaces:**
- Consumes: `requireToken`, `errorResponse`, `json`, `ApiError` (Task 1); `createPage`, `listPages`, `pageUrl`, `PageTooLargeError` (Task 2).
- Produces: HTTP `POST` (create → 201 `{ id, url, createdAt }`) and `GET` (list → `{ pages: [...], nextCursor }`) at `/api/v1/pages`.

- [ ] **Step 1: Write the failing test `src/app/api/v1/pages/route.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { POST, GET } from "./route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

function post(token: string | null, body: string, title?: string): Request {
  return new Request("http://localhost/api/v1/pages", {
    method: "POST",
    headers: {
      "content-type": "text/html",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(title ? { "x-kiosk-title": title } : {}),
    },
    body,
  });
}

describe("POST /api/v1/pages", () => {
  it("401 without a token", async () => {
    const res = await POST(post(null, "<html></html>"));
    expect(res.status).toBe(401);
  });
  it("creates a page and returns its url", async () => {
    principal = await createPrincipal();
    const res = await POST(post(principal.token, "<html><title>Hi</title></html>"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toContain("/p/");
    expect(body.id).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it("413 when body exceeds 2MB", async () => {
    principal = await createPrincipal();
    const res = await POST(post(principal.token, "a".repeat(2 * 1024 * 1024 + 10)));
    expect(res.status).toBe(413);
  });
});

describe("GET /api/v1/pages", () => {
  it("lists the caller's pages", async () => {
    principal = await createPrincipal();
    await POST(post(principal.token, "<html><title>One</title></html>"));
    const res = await GET(
      new Request("http://localhost/api/v1/pages", {
        headers: { authorization: `Bearer ${principal.token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0].url).toContain("/p/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/api/v1/pages/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement `src/app/api/v1/pages/route.ts`**

```typescript
import { requireToken, errorResponse, json, ApiError } from "@/lib/api";
import { createPage, listPages, pageUrl, PageTooLargeError } from "@/lib/pages";

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId, organizationId } = await requireToken(req);
    const html = await req.text();
    if (!html.trim()) throw new ApiError(400, "bad_request", "Empty body");
    const title = req.headers.get("x-kiosk-title");
    try {
      const page = await createPage({ organizationId, userId, html, title: title ?? undefined });
      return json({ id: page.publicId, url: pageUrl(page.publicId), createdAt: page.createdAt }, 201);
    } catch (e) {
      if (e instanceof PageTooLargeError) throw new ApiError(413, "too_large", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const cursor = new URL(req.url).searchParams.get("cursor");
    const { items, nextCursor } = await listPages({ organizationId, cursor });
    return json({
      pages: items.map((p) => ({
        id: p.publicId,
        url: pageUrl(p.publicId),
        title: p.title,
        sizeBytes: p.sizeBytes,
        viewCount: p.viewCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      nextCursor,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/api/v1/pages/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/pages/route.ts src/app/api/v1/pages/route.test.ts
git commit -m "feat: POST/GET /api/v1/pages (create + list)"
```

---

### Task 4: `GET/PUT/DELETE /api/v1/pages/[id]`

**Files:**
- Create: `src/app/api/v1/pages/[id]/route.ts`, `src/app/api/v1/pages/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireToken`, `errorResponse`, `json`, `ApiError` (Task 1); `getPage`, `updatePage`, `softDeletePage`, `pageUrl`, `PageTooLargeError` (Task 2).
- Produces: `GET` (one → metadata), `PUT` (update → `{ id, url, updatedAt }`), `DELETE` (soft delete → 204) at `/api/v1/pages/:id`. `404` when the page is absent or in another org.

> Next 16 passes route params as a Promise: the handler signature is `(req: Request, ctx: { params: Promise<{ id: string }> })`.

- [ ] **Step 1: Write the failing test `src/app/api/v1/pages/[id]/route.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { GET, PUT, DELETE } from "./route";
import { POST } from "../route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const authGet = (t: string, id: string) =>
  new Request(`http://localhost/api/v1/pages/${id}`, { headers: { authorization: `Bearer ${t}` } });

async function createOne(token: string): Promise<string> {
  const res = await POST(
    new Request("http://localhost/api/v1/pages", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/html" },
      body: "<html><title>Orig</title></html>",
    }),
  );
  return (await res.json()).id as string;
}

describe("/api/v1/pages/[id]", () => {
  it("GET returns the page; PUT updates; DELETE soft-deletes; then 404", async () => {
    principal = await createPrincipal();
    const id = await createOne(principal.token);

    const g = await GET(authGet(principal.token, id), ctx(id));
    expect(g.status).toBe(200);
    expect((await g.json()).title).toBe("Orig");

    const p = await PUT(
      new Request(`http://localhost/api/v1/pages/${id}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${principal.token}`, "content-type": "text/html" },
        body: "<html><title>New</title></html>",
      }),
      ctx(id),
    );
    expect(p.status).toBe(200);

    const d = await DELETE(authGet(principal.token, id), ctx(id));
    expect(d.status).toBe(204);

    const after = await GET(authGet(principal.token, id), ctx(id));
    expect(after.status).toBe(404);
  });

  it("404 for an id in another org", async () => {
    principal = await createPrincipal();
    const id = await createOne(principal.token);
    // A second principal must not see the first's page.
    const other = await createPrincipal();
    const res = await GET(authGet(other.token, id), ctx(id));
    expect(res.status).toBe(404);
    await cleanupPrincipal(other);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run "src/app/api/v1/pages/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement `src/app/api/v1/pages/[id]/route.ts`**

```typescript
import { requireToken, errorResponse, json, ApiError } from "@/lib/api";
import { getPage, updatePage, softDeletePage, pageUrl, PageTooLargeError } from "@/lib/pages";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    return json({
      id: page.publicId,
      url: pageUrl(page.publicId),
      title: page.title,
      sizeBytes: page.sizeBytes,
      viewCount: page.viewCount,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const html = await req.text();
    if (!html.trim()) throw new ApiError(400, "bad_request", "Empty body");
    const title = req.headers.get("x-kiosk-title");
    try {
      const page = await updatePage({ publicId: id, organizationId, html, title: title ?? undefined });
      if (!page) throw new ApiError(404, "not_found", "Page not found");
      return json({ id: page.publicId, url: pageUrl(page.publicId), updatedAt: page.updatedAt });
    } catch (e) {
      if (e instanceof PageTooLargeError) throw new ApiError(413, "too_large", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const ok = await softDeletePage({ publicId: id, organizationId });
    if (!ok) throw new ApiError(404, "not_found", "Page not found");
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run "src/app/api/v1/pages/[id]/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/v1/pages/[id]/route.ts" "src/app/api/v1/pages/[id]/route.test.ts"
git commit -m "feat: GET/PUT/DELETE /api/v1/pages/:id"
```

---

### Task 5: `GET /api/v1/me`

**Files:**
- Create: `src/app/api/v1/me/route.ts`, `src/app/api/v1/me/route.test.ts`

**Interfaces:**
- Consumes: `requireToken`, `errorResponse`, `json` (Task 1); schema `user`/`organization`.
- Produces: `GET /api/v1/me` → `{ user: { id, name, email }, organization: { id, name, slug } }`. Used by `kiosk login` to validate a token.

- [ ] **Step 1: Write the failing test `src/app/api/v1/me/route.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { GET } from "./route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("GET /api/v1/me", () => {
  it("401 without a token", async () => {
    const res = await GET(new Request("http://localhost/api/v1/me"));
    expect(res.status).toBe(401);
  });
  it("returns the user and org for a valid token", async () => {
    principal = await createPrincipal();
    const res = await GET(
      new Request("http://localhost/api/v1/me", {
        headers: { authorization: `Bearer ${principal.token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(principal.userId);
    expect(body.organization.id).toBe(principal.organizationId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/api/v1/me/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement `src/app/api/v1/me/route.ts`**

```typescript
import { eq } from "drizzle-orm";
import { requireToken, errorResponse, json } from "@/lib/api";
import { db } from "@/db";
import { user, organization } from "@/db/schema";

export async function GET(req: Request): Promise<Response> {
  try {
    const { userId, organizationId } = await requireToken(req);
    const [u] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const [org] = await db
      .select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return json({ user: u ?? null, organization: org ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/api/v1/me/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full test + build gate**

Run: `pnpm test && pnpm build`
Expected: all vitest files pass (Plan 1 + Plan 2); `next build` shows routes `ƒ /api/v1/pages`, `ƒ /api/v1/pages/[id]`, `ƒ /api/v1/me`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/me/route.ts src/app/api/v1/me/route.test.ts
git commit -m "feat: GET /api/v1/me (token check + identity)"
```

---

## Self-Review

**1. Spec coverage (spec §2.3 endpoints, §4.2 token, §7.1–7.3 limits/errors):**
- `POST /pages` (raw html, X-Kiosk-Title, 201, 413) → Task 3. ✓
- `PUT /pages/:id` (update, 404) → Task 4. ✓
- `GET /pages` (cursor pagination) → Task 3. ✓
- `GET /pages/:id` (metadata) → Task 4. ✓
- `DELETE /pages/:id` (soft delete, 204) → Task 4. ✓
- `GET /me` → Task 5. ✓
- Bearer `verifyToken` auth, `:id`=public_id, org-scoping → Tasks 1–5. ✓
- Error envelope `{ error: { code, message } }` + statuses → Task 1 (`errorResponse`/`ApiError`). ✓
- 2 MB cap → Task 2 + surfaced as 413 in Tasks 3/4. ✓
- **Gap (intentional, flagged):** per-token rate limiting (spec §7.1) deferred — needs a rate-limit store; not in this plan. curl-usage docs live with the CLI (Plan 5). Serving/host-separation = Plan 3.

**2. Placeholder scan:** none — every step has complete code and exact run commands.

**3. Type consistency:** `requireToken → { userId, organizationId }` used identically in every route. `Page` type (Plan 1 `pages.$inferSelect`) returned by service, consumed by routes via `.publicId/.title/.sizeBytes/.viewCount/.createdAt/.updatedAt`. `createPrincipal(): { userId, organizationId, token }` used verbatim in all test files. `PageTooLargeError` thrown in Task 2, mapped to 413 in Tasks 3/4. Handler param type `{ params: Promise<{ id: string }> }` consistent in Task 4.
