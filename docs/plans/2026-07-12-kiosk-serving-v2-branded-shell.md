# Kiosk Serving v2 — Branded Shell + Cross-Origin Iframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap published pages in a Kiosk-branded shell (`APP_ORIGIN/v/<id>`) that embeds the raw content from the separate `SERVE_ORIGIN` in a sandboxed iframe — branded/non-isolated pages without weakening the two-origin security model.

**Architecture:** A trusted shell page on the app origin renders Kiosk chrome + `<iframe sandbox="allow-scripts" src="SERVE_ORIGIN/p/<id>[?k=token]">`. Public pages embed directly; org pages have the shell (which holds the session) mint a short-lived serve-token and pass it in the iframe src — no serve→app→serve redirect. The raw serve URL is unchanged (still the iframe src + an embeddable link). Publish now returns the shell URL as `url` plus a `rawUrl`.

**Tech Stack:** Next.js (server component page + route handlers), Drizzle, `signServeToken`/`isOrgMember` (P2-3/P2-4), Vitest.

> Spec: `docs/specs/2026-07-12-kiosk-serving-v2-branded-shell-design.md`. Consumes P2-3 (`signServeToken`), P2-4 (`isOrgMember`).

## Global Constraints

- Two origins stay: `APP_ORIGIN` (shell + session cookie) and `SERVE_ORIGIN` (raw content, cookieless). Untrusted HTML only ever runs in a **cross-origin, sandboxed** iframe.
- iframe: `sandbox="allow-scripts"` — **never** `allow-same-origin`.
- Shareable/publish URL = **shell** `APP_ORIGIN/v/<id>`; `rawUrl` = `SERVE_ORIGIN/p/<id>` (iframe src + embed).
- serve-token: minted by the shell for org pages; `/serve-auth` redirect stays as the direct-serve fallback (P2-3, unchanged).
- Commits carry **no AI attribution**.

---

### Task 1: URL helpers (`pageShellUrl`/`pageRawUrl`) + API response shape

**Files:**
- Modify: `src/lib/pages.ts` (rename `pageUrl`→`pageRawUrl`, add `pageShellUrl`)
- Modify: `src/lib/pages.test.ts` (update url test)
- Modify: `src/app/api/v1/pages/route.ts`, `src/app/api/v1/pages/[id]/route.ts` (return `url`=shell, `rawUrl`=raw)

**Interfaces:**
- Produces: `pageShellUrl(pid) => ${APP_ORIGIN}/v/${pid}`; `pageRawUrl(pid) => ${SERVE_ORIGIN}/p/${pid}`. API page JSON: `{ id, url: shell, rawUrl: raw, visibility, ... }`.

- [ ] **Step 1: Update the url test in `src/lib/pages.test.ts`**

Replace the `pageUrl` describe with:
```typescript
import { pageShellUrl, pageRawUrl } from "./pages";

describe("page urls", () => {
  it("rawUrl joins SERVE_ORIGIN /p/", () => {
    expect(pageRawUrl("abc123")).toBe(`${process.env.SERVE_ORIGIN}/p/abc123`);
  });
  it("shellUrl joins APP_ORIGIN /v/", () => {
    expect(pageShellUrl("abc123")).toBe(`${process.env.APP_ORIGIN}/v/abc123`);
  });
});
```
Remove the old `pageUrl` import + its describe block.

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run src/lib/pages.test.ts` → `pageShellUrl`/`pageRawUrl` missing.

- [ ] **Step 3: Update `src/lib/pages.ts`**

Replace the `pageUrl` function:
```typescript
export function pageRawUrl(pid: string): string {
  return `${process.env.SERVE_ORIGIN}/p/${pid}`;
}

export function pageShellUrl(pid: string): string {
  return `${process.env.APP_ORIGIN}/v/${pid}`;
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Update the API routes to return both urls**

In `src/app/api/v1/pages/route.ts`: import `pageShellUrl, pageRawUrl` (drop `pageUrl`). POST 201 body → `{ id: page.publicId, url: pageShellUrl(page.publicId), rawUrl: pageRawUrl(page.publicId), visibility: page.visibility, createdAt: page.createdAt }`. GET list items → each `{ ..., url: pageShellUrl(p.publicId), rawUrl: pageRawUrl(p.publicId), ... }` (replace the `url: pageUrl(...)`).

In `src/app/api/v1/pages/[id]/route.ts`: import `pageShellUrl, pageRawUrl` (drop `pageUrl`). GET/PUT/PATCH JSON → `url: pageShellUrl(...)`, add `rawUrl: pageRawUrl(...)`.

- [ ] **Step 6: Run the pages route tests** — `pnpm exec vitest run "src/app/api/v1/pages"`. If any test asserts `body.url` equals a `/p/` URL, update it to expect the `/v/` shell URL (or assert `body.rawUrl` for the raw). Fix + rerun.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pages.ts src/lib/pages.test.ts src/app/api/v1/pages
git commit -m "feat: split page urls into shell (/v) + raw (/p); API returns both"
```

---

### Task 2: `/v/[id]` branded shell page

**Files:**
- Create: `src/app/v/[id]/page.tsx`

**Interfaces:**
- Consumes: `getPublicPage`, `getSession`, `isOrgMember`, `signServeToken`, `pageRawUrl`.
- Behavior: public → shell + iframe(raw, no token); org no session → redirect to sign-in; org non-member → 403 shell; org member → shell + iframe(raw?k=token). Top-level route (NOT in the `(console)` group) so logged-out visitors can view public pages.

- [ ] **Step 1: Create `src/app/v/[id]/page.tsx`**

```tsx
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPublicPage, pageRawUrl } from "@/lib/pages";
import { isOrgMember } from "@/lib/console";
import { signServeToken } from "@/lib/serve-token";

type Props = { params: Promise<{ id: string }> };

const shell: React.CSSProperties = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  margin: 0,
};
const bar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 14px",
  borderBottom: "1px solid #8883",
  font: "14px system-ui, sans-serif",
};

export default async function ViewerPage({ params }: Props) {
  const { id } = await params;
  const page = await getPublicPage(id);
  if (!page) notFound();

  let src = pageRawUrl(id);
  if (page.visibility !== "public") {
    const session = await getSession();
    if (!session) redirect(`/sign-in?callback=/v/${id}`);
    if (!(await isOrgMember(session.user.id, page.organizationId))) {
      return (
        <main style={{ maxWidth: 420, margin: "12vh auto", padding: 16, font: "15px system-ui" }}>
          <h1>No access</h1>
          <p style={{ opacity: 0.7 }}>This page is private to another organization.</p>
        </main>
      );
    }
    const k = signServeToken(page.organizationId, session.user.id);
    src = `${pageRawUrl(id)}?k=${encodeURIComponent(k)}`;
  }

  return (
    <div style={shell}>
      <header style={bar}>
        <strong style={{ color: "#4f46e5" }}>Kiosk</strong>
        <span style={{ opacity: 0.8 }}>{page.title ?? id}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12, opacity: 0.7 }}>
          <a href={pageRawUrl(id)} target="_blank" rel="noreferrer">open raw</a>
          <a href={`/report?url=${encodeURIComponent(pageRawUrl(id))}`}>report</a>
        </span>
      </header>
      <iframe
        src={src}
        sandbox="allow-scripts"
        title={page.title ?? "page"}
        style={{ flex: 1, border: 0, width: "100%" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build** — `pnpm build`. Expected: clean; `/v/[id]` in the route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/v
git commit -m "feat: branded viewer shell /v/[id] embedding sandboxed serve iframe"
```

---

### Task 3: CLI + console links use the shell URL; gate

**Files:**
- Modify: `src/app/(console)/pages/page.tsx` (link → shell url)
- Verify: `cli/src/commands.ts` returns `result.url` (now shell) — already correct; `kiosk open` uses the stored mapping url (now shell)

**Interfaces:**
- Consumes: `pageShellUrl` (Task 1) for the console link; CLI already prints/stores `result.url`.

- [ ] **Step 1: Console page list link → shell URL**

In `src/app/(console)/pages/page.tsx`: replace the `pageUrl` import with `pageShellUrl` and `const url = pageUrl(p.publicId)` with `const url = pageShellUrl(p.publicId)`. (The Copy/Open buttons now share the shell URL. Keep the raw open in the shell chrome.)

> Verify no other `pageUrl` references remain: `grep -rn "pageUrl" src` → only the (now-removed) name; fix any stragglers to `pageShellUrl`/`pageRawUrl`.

- [ ] **Step 2: CLI stays correct (verify)**

`publishCommand` returns `result.url` (now the shell URL from Task 1) and stores it in `.kiosk/pages.json`; `kiosk open` opens the stored url. No code change expected — confirm by reading `cli/src/commands.ts` + `cli/src/open.ts`. If `open.ts` reconstructs a `/p/` URL from apiBase instead of using the stored url, update it to prefer the stored shell url.

- [ ] **Step 3: Full gate**

Run: `pnpm test && pnpm build && pnpm exec tsc -p cli/tsconfig.json --noEmit`. Expected: all pass; `/v/[id]` in routes.

- [ ] **Step 4: Rebuild CLI dist** — `pnpm -C cli build` (so the installed `kiosk` binary is current).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(console)/pages/page.tsx" cli
git commit -m "feat: console + CLI share the branded shell URL"
```

- [ ] **Step 6: Docs**

Update `.claude/rules/serving.md` (shell `/v/<id>` = branded viewer embedding sandboxed `SERVE_ORIGIN/p/<id>`; publish returns shell url + rawUrl) + `CLAUDE.md` (serving v2 note). Commit `docs: serving v2`.

- [ ] **Step 7: Manual smoke** (browser + hosts `serve.kiosk.test`): `kiosk publish foo.html` → returns `APP_ORIGIN/v/<id>`; open it → Kiosk header + page rendered in iframe. Logged-out on a public page → renders; org page logged-out → sign-in; org member → renders (iframe src has `?k=`). View-source the shell → iframe has `sandbox="allow-scripts"`, no `allow-same-origin`.

---

## Self-Review

**1. Spec coverage:** shell `/v/<id>` + cross-origin sandboxed iframe (Task 2); separate origin kept (raw `/p` unchanged); org gate via shell-minted token, no redirect bounce (Task 2); publish returns shell `url` + `rawUrl` (Task 1); console + CLI use shell url (Task 3). Public standalone raw still available (`rawUrl`). ✓ `/serve-auth` direct-serve fallback untouched.

**2. Placeholder scan:** none. Steps 6 (Task 1) and 2 (Task 3) are conditional "inspect-and-fix" verifications, not placeholders.

**3. Type consistency:** `pageShellUrl`/`pageRawUrl` replace `pageUrl` everywhere (Task 1 grep gate in Task 3 Step 1); iframe `sandbox="allow-scripts"` with no `allow-same-origin` (spec §5); `signServeToken(orgId, userId)` + `isOrgMember(userId, orgId)` reused with existing signatures.
