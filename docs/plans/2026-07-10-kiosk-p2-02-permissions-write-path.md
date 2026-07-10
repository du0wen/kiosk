# Kiosk P2 · Plan 2 — Permissions + Write-Path Authz & Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-based authorization (`can()`), make `requireToken` role-aware, and wire the write path so pages carry `visibility`/edit-delete attribution and every content change snapshots a `page_version`.

**Architecture:** A thin pure `permissions.ts` (`can(role, action, ctx)`) decides actions; `requireToken` resolves the caller's `member.role`. The pages service gains `visibility` + `userId` params, writes `page_version` snapshots, and sets `updated_by`/`deleted_by`. API routes enforce `can()` (member deletes/sets-visibility only on own pages) and accept an `X-Kiosk-Visibility` header + a new `PATCH` for visibility toggling.

**Tech Stack:** Drizzle ORM, Next.js route handlers, Vitest, Neon.

> Spec: `docs/specs/2026-07-10-kiosk-p2-orgs-permissions-design.md` §4, §8, §9. Consumes Plan 1 (`pages.visibility/updatedBy/deletedBy`, `pageVersion`).

## Global Constraints

- `:id` in routes = `public_id`. Auth = `Authorization: Bearer kiosk_live_*` (`verifyToken`, unchanged).
- Errors: `{ error: { code, message } }` + status (400/401/403/404/413). Reuse `ApiError`/`errorResponse`/`json`.
- Roles are org-internal (`owner`/`admin`/`member`); distinct from platform admin.
- Member may **edit any** org page but **delete / set-visibility only on own** pages; admin/owner any.
- Version snapshot on create + on **content-changed** update only (compare `content_hash`).
- Commits carry **no AI attribution**.

---

### Task 1: `permissions.ts` — pure `can()`

**Files:**
- Create: `src/lib/permissions.ts`, `src/lib/permissions.test.ts`

**Interfaces:**
- Produces:
  - `type Role = "owner" | "admin" | "member"`
  - `type Action = "page.edit" | "page.delete" | "page.setVisibility" | "member.invite" | "member.remove" | "member.setRole" | "org.update" | "org.delete" | "org.transfer"`
  - `can(role: Role, action: Action, ctx?: { isResourceOwner?: boolean }): boolean`

- [ ] **Step 1: Write the failing test `src/lib/permissions.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { can, type Role, type Action } from "./permissions";

const ROLES: Role[] = ["owner", "admin", "member"];

describe("can()", () => {
  it("everyone can edit any page", () => {
    for (const r of ROLES) expect(can(r, "page.edit")).toBe(true);
  });

  it("admin/owner delete any page; member only own", () => {
    for (const a of ["page.delete", "page.setVisibility"] as Action[]) {
      expect(can("owner", a)).toBe(true);
      expect(can("admin", a)).toBe(true);
      expect(can("member", a, { isResourceOwner: true })).toBe(true);
      expect(can("member", a, { isResourceOwner: false })).toBe(false);
      expect(can("member", a)).toBe(false); // no ctx → not owner
    }
  });

  it("member management + org settings: admin/owner only", () => {
    for (const a of ["member.invite", "member.remove", "member.setRole", "org.update"] as Action[]) {
      expect(can("owner", a)).toBe(true);
      expect(can("admin", a)).toBe(true);
      expect(can("member", a, { isResourceOwner: true })).toBe(false);
    }
  });

  it("delete org / transfer: owner only", () => {
    for (const a of ["org.delete", "org.transfer"] as Action[]) {
      expect(can("owner", a)).toBe(true);
      expect(can("admin", a)).toBe(false);
      expect(can("member", a)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm exec vitest run src/lib/permissions.test.ts` → module missing.

- [ ] **Step 3: Implement `src/lib/permissions.ts`**

```typescript
export type Role = "owner" | "admin" | "member";

export type Action =
  | "page.edit"
  | "page.delete"
  | "page.setVisibility"
  | "member.invite"
  | "member.remove"
  | "member.setRole"
  | "org.update"
  | "org.delete"
  | "org.transfer";

/**
 * Authorization decision for an org-internal action. Pure — no I/O.
 * `ctx.isResourceOwner` = caller created the page (for member's own-page rights).
 */
export function can(
  role: Role,
  action: Action,
  ctx?: { isResourceOwner?: boolean },
): boolean {
  switch (action) {
    case "page.edit":
      return true; // any member edits any org page (shared workspace)
    case "page.delete":
    case "page.setVisibility":
      return role === "owner" || role === "admin" || ctx?.isResourceOwner === true;
    case "member.invite":
    case "member.remove":
    case "member.setRole":
    case "org.update":
      return role === "owner" || role === "admin";
    case "org.delete":
    case "org.transfer":
      return role === "owner";
    default:
      return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — expect all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "feat: role-based can() permission function"
```

---

### Task 2: role-aware `requireToken` + test factory `addMember`

**Files:**
- Modify: `src/lib/api.ts` (`requireToken` returns `role`)
- Modify: `src/test/factories.ts` (add `addMember`)
- Modify: `src/lib/api.test.ts` (assert role)

**Interfaces:**
- Produces: `requireToken(req) => Promise<{ userId: string; organizationId: string; role: Role }>`; `addMember(organizationId, role) => Promise<{ userId: string; token: string }>`.

- [ ] **Step 1: Add the failing assertion to `src/lib/api.test.ts`**

Append this test (adjust imports at top: add `createPrincipal, cleanupPrincipal` from `@/test/factories` if not present):

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { requireToken } from "./api";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("requireToken role", () => {
  it("returns the caller's org role", async () => {
    principal = await createPrincipal();
    const id = await requireToken(
      new Request("http://localhost/api/v1/me", {
        headers: { authorization: `Bearer ${principal.token}` },
      }),
    );
    expect(id.userId).toBe(principal.userId);
    expect(id.organizationId).toBe(principal.organizationId);
    expect(id.role).toBe("owner");
  });
});
```

> If `api.test.ts` already imports these names/sets up `afterEach`, merge rather than duplicate.

- [ ] **Step 2: Run test to verify it fails** — `pnpm exec vitest run src/lib/api.test.ts` → `role` is `undefined`.

- [ ] **Step 3: Implement role in `src/lib/api.ts`**

Replace the `requireToken` function:

```typescript
import { verifyToken } from "@/lib/token";
import { db } from "@/db";
import { member } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { Role } from "@/lib/permissions";

// ... ApiError / errorResponse / json unchanged ...

/** Verify the Bearer token; return caller identity + org role, or throw ApiError. */
export async function requireToken(
  req: Request,
): Promise<{ userId: string; organizationId: string; role: Role }> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "unauthorized", "Missing Bearer token");
  const identity = await verifyToken(match[1]);
  if (!identity) throw new ApiError(401, "unauthorized", "Invalid or revoked token");
  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, identity.userId),
        eq(member.organizationId, identity.organizationId),
      ),
    )
    .limit(1);
  if (!m) throw new ApiError(403, "forbidden", "Not a member of this organization");
  return {
    userId: identity.userId,
    organizationId: identity.organizationId,
    role: m.role as Role,
  };
}
```

- [ ] **Step 4: Add `addMember` to `src/test/factories.ts`**

Add imports `createToken` (already imported) and append:

```typescript
/** Add an extra user with a given role to an existing org; returns a token for them. */
export async function addMember(
  organizationId: string,
  role: "owner" | "admin" | "member",
): Promise<{ userId: string; token: string }> {
  const userId = uuidv7();
  await db.insert(user).values({
    id: userId,
    name: `M ${userId}`,
    email: `${userId}@t.local`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(member).values({
    id: uuidv7(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
  const { plaintext } = await createToken({ userId, organizationId, name: "test" });
  return { userId, token: plaintext };
}
```

> `cleanupPrincipal` deletes members/tokens by org, so the extra member's membership + token go with the org; delete the extra **user** row explicitly in the test's `afterEach` (it is keyed by its own id).

- [ ] **Step 5: Run test to verify it passes** — expect green (role === "owner").

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts src/test/factories.ts
git commit -m "feat: requireToken resolves org role; addMember test factory"
```

---

### Task 3: pages service — visibility, attribution, version snapshots

**Files:**
- Modify: `src/lib/pages.ts` (`createPage`, `updatePage`, `softDeletePage` signatures; add `setPageVisibility`; version writes)
- Modify: `src/lib/pages.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `createPage({ organizationId, userId, html, title?, visibility? }) => Promise<Page>` (default `visibility:'org'`, writes first `page_version`)
  - `updatePage({ publicId, organizationId, userId, html, title?, visibility? }) => Promise<Page | null>` (sets `updatedBy`; snapshots on content change)
  - `softDeletePage({ publicId, organizationId, userId }) => Promise<boolean>` (sets `deletedBy`)
  - `setPageVisibility({ publicId, organizationId, userId, visibility }) => Promise<Page | null>`

- [ ] **Step 1: Write failing cases in `src/lib/pages.test.ts`**

Add (merge imports — `pageVersion`, `addMember` may be new):

```typescript
import { pageVersion } from "@/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  createPage,
  updatePage,
  softDeletePage,
  setPageVisibility,
} from "./pages";

describe("pages service P2", () => {
  it("createPage defaults org visibility and writes a first version", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({
        organizationId: p.organizationId,
        userId: p.userId,
        html: "<title>A</title><h1>A</h1>",
      });
      expect(page.visibility).toBe("org");
      const versions = await db.select().from(pageVersion).where(eq(pageVersion.pageId, page.id));
      expect(versions).toHaveLength(1);
      expect(versions[0].editedBy).toBe(p.userId);
    } finally {
      await cleanupPrincipal(p);
    }
  });

  it("updatePage snapshots only on content change and sets updated_by", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>v1</h1>" });
      await updatePage({ publicId: page.publicId, organizationId: p.organizationId, userId: p.userId, html: "<h1>v1</h1>" }); // same content
      let versions = await db.select().from(pageVersion).where(eq(pageVersion.pageId, page.id));
      expect(versions).toHaveLength(1); // unchanged → no new version
      const updated = await updatePage({ publicId: page.publicId, organizationId: p.organizationId, userId: p.userId, html: "<h1>v2</h1>" });
      expect(updated?.updatedBy).toBe(p.userId);
      versions = await db.select().from(pageVersion).where(eq(pageVersion.pageId, page.id));
      expect(versions).toHaveLength(2);
    } finally {
      await cleanupPrincipal(p);
    }
  });

  it("setPageVisibility flips visibility; softDeletePage records deleted_by", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>x</h1>" });
      const pub = await setPageVisibility({ publicId: page.publicId, organizationId: p.organizationId, userId: p.userId, visibility: "public" });
      expect(pub?.visibility).toBe("public");
      const ok = await softDeletePage({ publicId: page.publicId, organizationId: p.organizationId, userId: p.userId });
      expect(ok).toBe(true);
      const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
      expect(row.deletedBy).toBe(p.userId);
      expect(row.deletedAt).not.toBeNull();
    } finally {
      await cleanupPrincipal(p);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `setPageVisibility` missing / signatures reject `userId`.

- [ ] **Step 3: Update `src/lib/pages.ts`**

Add `pageVersion` to the schema import, then replace the four functions:

```typescript
import { pages, pageVersion, type Page } from "@/db/schema";

export async function createPage(params: {
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
  visibility?: "org" | "public";
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
      visibility: params.visibility ?? "org",
    })
    .returning();
  await db.insert(pageVersion).values({
    pageId: row.id,
    contentHtml: params.html,
    title: row.title,
    editedBy: params.userId,
  });
  return row;
}

export async function updatePage(params: {
  publicId: string;
  organizationId: string;
  userId: string;
  html: string;
  title?: string | null;
  visibility?: "org" | "public";
}): Promise<Page | null> {
  const size = sizeOf(params.html);
  if (size > MAX_BYTES) throw new PageTooLargeError();
  const newHash = hashOf(params.html);
  const existing = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!existing) return null;
  const [row] = await db
    .update(pages)
    .set({
      contentHtml: params.html,
      sizeBytes: size,
      contentHash: newHash,
      title: params.title ?? extractTitle(params.html),
      ...(params.visibility ? { visibility: params.visibility } : {}),
      updatedBy: params.userId,
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
  if (row && existing.contentHash !== newHash) {
    await db.insert(pageVersion).values({
      pageId: row.id,
      contentHtml: params.html,
      title: row.title,
      editedBy: params.userId,
    });
  }
  return row ?? null;
}

export async function softDeletePage(params: {
  publicId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ deletedAt: new Date(), deletedBy: params.userId })
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

export async function setPageVisibility(params: {
  publicId: string;
  organizationId: string;
  userId: string;
  visibility: "org" | "public";
}): Promise<Page | null> {
  const [row] = await db
    .update(pages)
    .set({
      visibility: params.visibility,
      updatedBy: params.userId,
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
```

- [ ] **Step 4: Run to verify it passes** — the three new cases green; existing pages tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages.ts src/lib/pages.test.ts
git commit -m "feat: pages service visibility, attribution, and version snapshots"
```

---

### Task 4: wire API routes (visibility header, ownership authz, PATCH) + gate

**Files:**
- Modify: `src/app/api/v1/pages/route.ts` (POST visibility header)
- Modify: `src/app/api/v1/pages/[id]/route.ts` (PUT visibility + userId; DELETE ownership; add PATCH)
- Modify: `src/app/api/v1/pages/[id]/route.test.ts` (authz + visibility cases)

**Interfaces:**
- Consumes: `can` (Task 1), `requireToken` role (Task 2), `updatePage`/`softDeletePage`/`setPageVisibility`/`getPage` (Task 3), `addMember` (Task 2).
- Produces: `POST`/`PUT` honor `X-Kiosk-Visibility: org|public`; `DELETE` 403 for member deleting others' pages; `PATCH /api/v1/pages/:id { visibility }`.

- [ ] **Step 1: Add a `parseVisibility` helper + failing route tests**

In `src/app/api/v1/pages/[id]/route.test.ts` add (merge with existing imports; import `addMember`, `createPage` from `@/lib/pages`, `db`, `user`, `eq`):

```typescript
import { PATCH, DELETE } from "./route";
import { addMember } from "@/test/factories";
import { createPage } from "@/lib/pages";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("page authz + visibility (member)", () => {
  it("member cannot delete another member's page (403), can delete own", async () => {
    const owner = await createPrincipal();
    const m = await addMember(owner.organizationId, "member");
    try {
      const ownersPage = await createPage({ organizationId: owner.organizationId, userId: owner.userId, html: "<h1>o</h1>" });
      const membersPage = await createPage({ organizationId: owner.organizationId, userId: m.userId, html: "<h1>m</h1>" });
      const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
      const bearer = (t: string) => new Request("http://localhost/x", { method: "DELETE", headers: { authorization: `Bearer ${t}` } });

      const forbidden = await DELETE(bearer(m.token), ctx(ownersPage.publicId));
      expect(forbidden.status).toBe(403);
      const ok = await DELETE(bearer(m.token), ctx(membersPage.publicId));
      expect(ok.status).toBe(204);
    } finally {
      await db.delete(user).where(eq(user.id, m.userId));
      await cleanupPrincipal(owner);
    }
  });

  it("PATCH sets visibility to public", async () => {
    const owner = await createPrincipal();
    try {
      const page = await createPage({ organizationId: owner.organizationId, userId: owner.userId, html: "<h1>x</h1>" });
      const res = await PATCH(
        new Request("http://localhost/x", {
          method: "PATCH",
          headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
          body: JSON.stringify({ visibility: "public" }),
        }),
        { params: Promise.resolve({ id: page.publicId }) },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).visibility).toBe("public");
    } finally {
      await cleanupPrincipal(owner);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `PATCH` not exported; member delete returns 204 not 403.

- [ ] **Step 3: Update `src/app/api/v1/pages/route.ts` (POST)**

Add a visibility helper + pass it. Replace the POST body's `createPage` call region:

```typescript
import { createPage, listPages, pageUrl, PageTooLargeError } from "@/lib/pages";

function parseVisibility(v: string | null): "org" | "public" | undefined {
  if (v === "org" || v === "public") return v;
  return undefined;
}

// inside POST, after reading title:
const visibility = parseVisibility(req.headers.get("x-kiosk-visibility"));
const page = await createPage({
  organizationId,
  userId,
  html,
  title: title ?? undefined,
  visibility,
});
return json(
  { id: page.publicId, url: pageUrl(page.publicId), visibility: page.visibility, createdAt: page.createdAt },
  201,
);
```

- [ ] **Step 4: Update `src/app/api/v1/pages/[id]/route.ts` (PUT userId+visibility; DELETE authz; add PATCH)**

```typescript
import { requireToken, errorResponse, json, ApiError } from "@/lib/api";
import {
  getPage,
  updatePage,
  softDeletePage,
  setPageVisibility,
  pageUrl,
  PageTooLargeError,
} from "@/lib/pages";
import { can } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

function parseVisibility(v: string | null): "org" | "public" | undefined {
  if (v === "org" || v === "public") return v;
  return undefined;
}

// GET unchanged except add `visibility: page.visibility` to the JSON (optional).

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, organizationId } = await requireToken(req);
    const { id } = await params;
    const html = await req.text();
    if (!html.trim()) throw new ApiError(400, "bad_request", "Empty body");
    const title = req.headers.get("x-kiosk-title");
    const visibility = parseVisibility(req.headers.get("x-kiosk-visibility"));
    try {
      const page = await updatePage({
        publicId: id,
        organizationId,
        userId,
        html,
        title: title ?? undefined,
        visibility,
      });
      if (!page) throw new ApiError(404, "not_found", "Page not found");
      return json({ id: page.publicId, url: pageUrl(page.publicId), visibility: page.visibility, updatedAt: page.updatedAt });
    } catch (e) {
      if (e instanceof PageTooLargeError) throw new ApiError(413, "too_large", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, organizationId, role } = await requireToken(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { visibility?: unknown };
    const visibility = parseVisibility(typeof body.visibility === "string" ? body.visibility : null);
    if (!visibility) throw new ApiError(400, "bad_request", "visibility must be 'org' or 'public'");
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    if (!can(role, "page.setVisibility", { isResourceOwner: page.createdBy === userId })) {
      throw new ApiError(403, "forbidden", "Not allowed to change this page");
    }
    const updated = await setPageVisibility({ publicId: id, organizationId, userId, visibility });
    return json({ id: updated!.publicId, url: pageUrl(updated!.publicId), visibility: updated!.visibility });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { userId, organizationId, role } = await requireToken(req);
    const { id } = await params;
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    if (!can(role, "page.delete", { isResourceOwner: page.createdBy === userId })) {
      throw new ApiError(403, "forbidden", "Not allowed to delete this page");
    }
    await softDeletePage({ publicId: id, organizationId, userId });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
```

> Keep the existing `GET` handler; optionally add `visibility: page.visibility` to its JSON.

- [ ] **Step 5: Run route tests** — `pnpm exec vitest run src/app/api/v1/pages` → all green (member 403 on others / 204 on own; PATCH → public).

- [ ] **Step 6: Full gate**

Run: `pnpm test && pnpm build`
Expected: all tests pass; build clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/pages
git commit -m "feat: API visibility (header + PATCH) and ownership-aware delete/visibility authz"
```

- [ ] **Step 8: Update the API rule doc**

In `.claude/rules/api.md`, note: `POST`/`PUT` accept `X-Kiosk-Visibility: org|public` (default `org`); `PATCH /pages/:id { visibility }` toggles; `DELETE`/`PATCH` require own-page for `member`. Commit:
```bash
git add .claude/rules/api.md
git commit -m "docs: api rule — visibility header, PATCH, ownership authz"
```

---

## Self-Review

**1. Spec coverage:** §4 role matrix → `can()` (Task 1) + route enforcement (Task 4); §4 requireToken role (Task 2); §8 version snapshots on create/content-change (Task 3); §9 default `org`, `X-Kiosk-Visibility`, `PATCH` visibility (Task 3/4); attribution `updated_by`/`deleted_by` (Task 3). ✓

**2. Placeholder scan:** none — all steps carry complete code + commands.

**3. Type consistency:** `Role` imported into `api.ts` from `permissions.ts`; `can(role, action, {isResourceOwner})` signature matches route calls; pages-service params add `userId` consistently across create/update/delete/setVisibility; `parseVisibility` returns `"org" | "public" | undefined` matching service `visibility?` params; `requireToken` return shape `{ userId, organizationId, role }` matches all route destructures.
