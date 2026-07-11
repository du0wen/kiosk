# Kiosk P2 · Plan 5 — Console visibility/history UI + CLI + i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface P2 in the product edges: CLI `--public` / `kiosk share` / `whoami` role, a per-page visibility toggle + version-history view in the console, and EN/ZH strings for the new UI.

**Architecture:** CLI gains a visibility header on publish + a `share` command hitting `PATCH /pages/:id`; `/me` returns `role`. The console `/pages` list gets a visibility toggle (server action → `setPageVisibility`, role+ownership gated) and a per-page History link to a new `/pages/[id]/history` view backed by a `listPageVersions` service. New console strings go through next-intl.

**Tech Stack:** Node CLI (fetch), Next.js console (server components + server actions), Drizzle, next-intl, Vitest.

> Spec: `docs/specs/2026-07-10-kiosk-p2-orgs-permissions-design.md` §8, §9, §10. Consumes P2-2 (`setPageVisibility`, `can`, `roleInOrg`) and P2-1 (`pageVersion`).

## Global Constraints

- `:id` = `public_id`. CLI default publish stays private (`org`); `--public` opts in.
- Visibility toggle in the console is role+ownership gated (`member` only on own pages).
- Version history is **view-only** (list of edits; content view is fine, rollback deferred).
- i18n: add keys to BOTH `messages/en.json` and `messages/zh.json`; console only.
- Commits carry **no AI attribution**.

---

### Task 1: CLI visibility (`--public`, `share`, `whoami` role) + `/me` role

**Files:**
- Modify: `cli/src/client.ts` (visibility header + `setVisibility`), `cli/src/commands.ts` (`visibility` arg), `cli/src/cli.ts` (`--public`, `share`, whoami role)
- Modify: `src/app/api/v1/me/route.ts` (include `role`)
- Modify: `cli/src/commands.test.ts` or `cli/src/client.test.ts` (add a case), `src/app/api/v1/me/route.test.ts` (assert role)

**Interfaces:**
- Produces: `KioskClient.publish(html, title?, visibility?)`, `.update(id, html, title?, visibility?)`, `.setVisibility(id, visibility)`; `publishCommand(deps, {..., visibility?})`; CLI `publish --public`, `share <id> --public|--private`, `whoami` prints role; `GET /me` → `{ user, organization, role }`.

- [ ] **Step 1: `/me` returns role** — edit `src/app/api/v1/me/route.ts`

Add `role` from `requireToken` to the JSON. Inspect the file; change the destructure to `const { userId, organizationId, role } = await requireToken(req);` and add `role` to the returned object (e.g. `return json({ user: {...}, organization: {...}, role });`). Update `src/app/api/v1/me/route.test.ts` to assert `body.role === "owner"` for a fresh principal.

- [ ] **Step 2: Extend `cli/src/client.ts`**

```typescript
  private async req(
    method: string,
    path: string,
    opts: { html?: string; title?: string; visibility?: "org" | "public" } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
    };
    if (opts.html !== undefined) headers["content-type"] = "text/html";
    if (opts.title) headers["x-kiosk-title"] = opts.title;
    if (opts.visibility) headers["x-kiosk-visibility"] = opts.visibility;
    return fetch(`${this.apiBase}${path}`, { method, headers, body: opts.html });
  }

  async publish(html: string, title?: string, visibility?: "org" | "public"): Promise<PageResult> {
    return (await this.parse(
      await this.req("POST", "/pages", { html, title, visibility }),
    )) as PageResult;
  }
  async update(id: string, html: string, title?: string, visibility?: "org" | "public"): Promise<PageResult> {
    return (await this.parse(
      await this.req("PUT", `/pages/${id}`, { html, title, visibility }),
    )) as PageResult;
  }
  async setVisibility(id: string, visibility: "org" | "public"): Promise<PageResult> {
    const res = await fetch(`${this.apiBase}/pages/${id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ visibility }),
    });
    return (await this.parse(res)) as PageResult;
  }
```

- [ ] **Step 3: Thread visibility through `cli/src/commands.ts`**

Add `visibility?: "org" | "public"` to `PublishArgs`, and pass it:
```typescript
  const result =
    identity.mode === "update"
      ? await deps.client.update(identity.id, html, title, args.visibility)
      : await deps.client.publish(html, title, args.visibility);
```

- [ ] **Step 4: Wire `cli/src/cli.ts`**

- `publish`: add `public: { type: "boolean" }` to options; pass `visibility: values.public ? "public" : undefined` into `publishCommand`; after printing the URL, if not `--public` and not `--json`, also print `"(private to your org — add --public or use the console to share publicly)"` to stderr.
- New `share` case:
```typescript
      case "share": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: { public: { type: "boolean" }, private: { type: "boolean" } },
        });
        const id = positionals[0];
        if (!id) throw new CliError("Usage: kiosk share <id> --public | --private");
        if (values.public === values.private) {
          throw new CliError("Specify exactly one of --public or --private");
        }
        const { apiBase, token } = requireToken();
        const r = await new KioskClient(apiBase, token).setVisibility(
          id,
          values.public ? "public" : "org",
        );
        process.stdout.write(`${r.url} (${r.visibility})\n`);
        return 0;
      }
```
- `whoami`: after fetching `me()`, the JSON now includes `role` (printed as-is by the existing `JSON.stringify`). No change needed beyond `/me` returning role.
- Add `share` + the `--public` flag to the `USAGE` text.

- [ ] **Step 5: Add a client test** in `cli/src/client.test.ts` (create if absent) — stub `fetch` and assert `setVisibility` sends `PATCH` with a JSON `{visibility}` body, and `publish(html, title, "public")` sends the `x-kiosk-visibility: public` header. Example:

```typescript
import { describe, it, expect, vi } from "vitest";
import { KioskClient } from "./client";

function stub(status = 200, body: unknown = { id: "x", url: "u", visibility: "public" }) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("KioskClient visibility", () => {
  it("publish --public sends the visibility header", async () => {
    const f = stub();
    vi.stubGlobal("fetch", f);
    await new KioskClient("http://x/api/v1", "t").publish("<h1>a</h1>", "t", "public");
    const [, init] = f.mock.calls[0];
    expect((init.headers as Record<string, string>)["x-kiosk-visibility"]).toBe("public");
    vi.unstubAllGlobals();
  });
  it("setVisibility PATCHes JSON", async () => {
    const f = stub();
    vi.stubGlobal("fetch", f);
    await new KioskClient("http://x/api/v1", "t").setVisibility("id1", "org");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("/pages/id1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ visibility: "org" });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 6: Run + typecheck** — `pnpm exec vitest run src/app/api/v1/me cli/src/client.test.ts && pnpm exec tsc -p cli/tsconfig.json --noEmit` → green.

- [ ] **Step 7: Commit**

```bash
git add cli/src src/app/api/v1/me
git commit -m "feat(cli): --public publish, share command, whoami role; /me returns role"
```

---

### Task 2: Console visibility toggle + version history

**Files:**
- Modify: `src/lib/pages.ts` (add `listPageVersions`), `src/lib/pages.test.ts` (case)
- Modify: `src/app/(console)/pages/page.tsx` (visibility toggle + History link)
- Create: `src/app/(console)/pages/[id]/history/page.tsx`

**Interfaces:**
- Produces: `listPageVersions({ publicId, organizationId }) => Promise<{ id: string; createdAt: Date; editedByEmail: string | null }[]>`.

- [ ] **Step 1: Failing test in `src/lib/pages.test.ts`**

```typescript
import { listPageVersions } from "./pages";

describe("listPageVersions", () => {
  it("returns versions newest-first with editor email", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>1</h1>" });
      await updatePage({ publicId: page.publicId, organizationId: p.organizationId, userId: p.userId, html: "<h1>2</h1>" });
      const versions = await listPageVersions({ publicId: page.publicId, organizationId: p.organizationId });
      expect(versions).toHaveLength(2);
      expect(versions[0].editedByEmail).toContain("@");
    } finally { await cleanupPrincipal(p); }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `listPageVersions` in `src/lib/pages.ts`**

Add `user` to the schema import (`import { pages, pageVersion, type Page } from "@/db/schema";` → also `user`). Then:
```typescript
export async function listPageVersions(params: {
  publicId: string;
  organizationId: string;
}): Promise<{ id: string; createdAt: Date; editedByEmail: string | null }[]> {
  const page = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!page) return [];
  const { user } = await import("@/db/schema");
  return db
    .select({
      id: pageVersion.id,
      createdAt: pageVersion.createdAt,
      editedByEmail: user.email,
    })
    .from(pageVersion)
    .leftJoin(user, eq(pageVersion.editedBy, user.id))
    .where(eq(pageVersion.pageId, page.id))
    .orderBy(desc(pageVersion.createdAt));
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: History view `src/app/(console)/pages/[id]/history/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
import { listPageVersions } from "@/lib/pages";

type Props = { params: Promise<{ id: string }> };

export default async function HistoryPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/pages/${id}/history`);
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const versions = await listPageVersions({ publicId: id, organizationId: org });
  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16 }}>
      <h1>Version history</h1>
      <a href="/pages">← Back</a>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6, marginTop: 12 }}>
        {versions.map((v) => (
          <li key={v.id} style={{ border: "1px solid #8883", borderRadius: 8, padding: 10, fontSize: 14 }}>
            {new Date(v.createdAt).toLocaleString()} — {v.editedByEmail ?? "unknown"}
          </li>
        ))}
        {versions.length === 0 && <li style={{ opacity: 0.6 }}>No versions.</li>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Visibility toggle + History link in `src/app/(console)/pages/page.tsx`**

Add a `setVis` server action (mirrors `remove`'s auth: `resolveActiveOrg` + `roleInOrg` + `getPage` + `can(role, "page.setVisibility", {isResourceOwner})` + `setPageVisibility`). Import `setPageVisibility`. In the per-page action row, add a form that toggles to the opposite of `p.visibility`, plus a History link:
```tsx
  async function setVis(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) return;
    const org = await resolveActiveOrg(s);
    if (!org) return;
    const role = await roleInOrg(s.user.id, org);
    if (!role) return;
    const page = await getPage({ publicId: String(formData.get("id")), organizationId: org });
    if (!page) return;
    if (!can(role, "page.setVisibility", { isResourceOwner: page.createdBy === s.user.id })) return;
    await setPageVisibility({
      publicId: page.publicId,
      organizationId: org,
      userId: s.user.id,
      visibility: String(formData.get("to")) === "public" ? "public" : "org",
    });
    revalidatePath("/pages");
  }
```
In the row (near the rename/delete forms), using `t()` keys added in Task 3:
```tsx
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {p.visibility === "public" ? t("public") : t("private")}
                  </span>
                  <form action={setVis}>
                    <input type="hidden" name="id" value={p.publicId} />
                    <input type="hidden" name="to" value={p.visibility === "public" ? "org" : "public"} />
                    <button type="submit">
                      {p.visibility === "public" ? t("makePrivate") : t("makePublic")}
                    </button>
                  </form>
                  <a href={`/pages/${p.publicId}/history`}>
                    <button type="button">{t("history")}</button>
                  </a>
```

- [ ] **Step 7: Run pages service test + build** — `pnpm exec vitest run src/lib/pages.test.ts && pnpm build`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pages.ts src/lib/pages.test.ts "src/app/(console)/pages"
git commit -m "feat: console page visibility toggle + version history view"
```

---

### Task 3: i18n strings + full gate

**Files:**
- Modify: `messages/en.json`, `messages/zh.json`

- [ ] **Step 1: Add the new `pages` keys** to both files (under the existing `pages` namespace): `public`, `private`, `makePublic`, `makePrivate`, `history`.

`messages/en.json` (merge into `"pages"`):
```json
"public": "Public",
"private": "Private",
"makePublic": "Make public",
"makePrivate": "Make private",
"history": "History"
```
`messages/zh.json` (merge into `"pages"`):
```json
"public": "公开",
"private": "私有",
"makePublic": "设为公开",
"makePrivate": "转为私有",
"history": "历史"
```

> Inspect both files first; add keys inside the existing `"pages": { ... }` object (mind trailing commas).

- [ ] **Step 2: Full gate** — `pnpm test && pnpm build && pnpm exec tsc -p cli/tsconfig.json --noEmit`. Expected: all pass; routes include `/pages/[id]/history`.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: page visibility + history strings (en/zh)"
```

- [ ] **Step 4: Update CLAUDE.md status + rules**

Mark P2 complete in `CLAUDE.md` (状态) and note in `.claude/rules/console.md` the visibility toggle + history view + members page. Commit `docs: P2 complete`.

- [ ] **Step 5: Manual smoke** (browser): publish default (private) → `/pages` shows Private + Make public; toggle → Public; History → version list. `kiosk publish --public` returns a public URL; `kiosk share <id> --private` flips it back.

---

## Self-Review

**1. Spec coverage (§8, §9, §10):** CLI `--public` + `share` + `whoami` role (Task 1); `/me` role (Task 1); console visibility toggle (Task 2); version-history view (Task 2, `listPageVersions`); i18n EN/ZH (Task 3). Rollback UI intentionally omitted (spec defers). ✓

**2. Placeholder scan:** none. Step 1/Task 1 and Step 1/Task 3 are "inspect then merge" edits to existing files (concrete), not placeholders.

**3. Type consistency:** `visibility?: "org" | "public"` consistent across `client.req/publish/update/setVisibility`, `PublishArgs`, and the service; `listPageVersions` return shape matches the history view + test; `setVis`/`remove` server actions share the `resolveActiveOrg` + `roleInOrg` + `can` pattern; `t()` keys (`public`/`private`/`makePublic`/`makePrivate`/`history`) added in Task 3 match their use in Task 2.
