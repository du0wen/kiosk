# Kiosk P2 · Plan 4 — Organizations & Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single personal org into a multi-member workspace: set an active org on login, let users create/switch orgs, invite members by link, and accept/decline invitations — all via Better Auth's `organization` plugin.

**Architecture:** Better Auth already ships the endpoints (`/organization/{create,set-active,invite-member,accept-invitation,reject-invitation,get-full-organization,remove-member,update-member-role,list}`) and the `session.activeOrganizationId` field. We (1) populate `activeOrganizationId` on login via a session-create hook, (2) drive interactive org ops from client components with `authClient.organization.*`, (3) add a link-based invite + `/invite/[id]` accept page, and (4) a `/settings/members` management page. Role gating reuses `can()` (P2-2).

**Tech Stack:** Better Auth organization plugin (server `auth.api.*` + client `authClient.organization.*`), Next.js (server components + client components + server actions), Drizzle, next-intl, Vitest.

> Spec: `docs/specs/2026-07-10-kiosk-p2-orgs-permissions-design.md` §5, §6, §10. Consumes Plan 2 (`can`, `resolveUserOrgRole`).

## Global Constraints

- Console on `APP_ORIGIN`. Org-internal roles `owner`/`admin`/`member`.
- `activeOrganizationId` lives on the `session` table (already generated). Better Auth sets it only via `set-active`; it is `null` until we populate it.
- Invite delivery = **link only** (copy manually); email delivery deferred.
- Exact `authClient.organization.*` method names + `auth.api.*` signatures are verified against the installed better-auth during execution (endpoints confirmed; method casing inferred from paths).
- Commits carry **no AI attribution**. i18n strings: add to `messages/{en,zh}.json`.

---

### Task 1: Active organization on login

**Files:**
- Modify: `src/lib/auth.ts` (add `databaseHooks.session.create.before`)
- Modify: `src/lib/console.ts` (add `resolveActiveOrg`)
- Create: `src/lib/console.test.ts` (or extend if present)

**Interfaces:**
- Produces: `resolveActiveOrg(session: { user: { id: string }; session: { activeOrganizationId?: string | null } }): Promise<string | null>` — returns the session's active org, else the user's first membership.

- [ ] **Step 1: Write the failing test `src/lib/console.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { resolveActiveOrg } from "./console";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("resolveActiveOrg", () => {
  it("prefers the session's activeOrganizationId", async () => {
    principal = await createPrincipal();
    const org = await resolveActiveOrg({
      user: { id: principal.userId },
      session: { activeOrganizationId: "explicit-org" },
    });
    expect(org).toBe("explicit-org");
  });
  it("falls back to the user's first membership when unset", async () => {
    principal = await createPrincipal();
    const org = await resolveActiveOrg({
      user: { id: principal.userId },
      session: { activeOrganizationId: null },
    });
    expect(org).toBe(principal.organizationId);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `resolveActiveOrg` missing.

- [ ] **Step 3: Add `resolveActiveOrg` to `src/lib/console.ts`**

```typescript
export async function resolveActiveOrg(session: {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
}): Promise<string | null> {
  return session.session.activeOrganizationId ?? (await resolveUserOrg(session.user.id));
}
```

- [ ] **Step 4: Add the session-create hook in `src/lib/auth.ts`**

Extend the existing `databaseHooks` (keep the `user.create.after` block) with:

```typescript
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const { provisionPersonalOrg } = await import("./org");
          await provisionPersonalOrg(createdUser.id, createdUser.name ?? createdUser.email);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Default the active org to the user's (personal) org so org-scoped
          // ops + console work immediately after login.
          const { resolveUserOrg } = await import("./console");
          const org = await resolveUserOrg(session.userId);
          return { data: { ...session, activeOrganizationId: org ?? undefined } };
        },
      },
    },
  },
```

- [ ] **Step 5: Run test to verify it passes** — 2 green.

- [ ] **Step 6: Point the console at the active org**

In `src/app/(console)/pages/page.tsx`, replace the top-of-component `resolveUserOrg(session.user.id)` with `resolveActiveOrg(session)` (import it). Same for `src/app/(console)/settings/**` if they call `resolveUserOrg` for the current org. (Leave the server-action `rename`/`remove` using `resolveUserOrgRole`, which is fine — single membership per user still holds for the personal org; multi-org active-context is the page-load org.)

> Verify with `grep -rn "resolveUserOrg(" src/app`. Update each console page-load call to `resolveActiveOrg(session)`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/console.ts src/lib/console.test.ts src/app/"(console)"
git commit -m "feat: set active organization on login; resolveActiveOrg for console"
```

---

### Task 2: Ensure the org client plugin + invitation accept page

**Files:**
- Modify: `src/lib/auth-client.ts` (ensure `organizationClient()` plugin)
- Create: `src/app/(console)/invite/[id]/page.tsx`, `src/app/_components/InviteActions.tsx`

**Interfaces:**
- Consumes: `authClient.organization.acceptInvitation({ invitationId })`, `.rejectInvitation({ invitationId })`.

- [ ] **Step 1: Ensure `organizationClient` is in `src/lib/auth-client.ts`**

Inspect the file. It must include the org client plugin so `authClient.organization.*` exists:

```typescript
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_ORIGIN,
  plugins: [organizationClient()],
});
```

> Keep any existing config; just add `organizationClient()` to `plugins`. Verify the exact import path (`better-auth/client/plugins`).

- [ ] **Step 2: Create the invite actions client component `src/app/_components/InviteActions.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function InviteActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const res =
      kind === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId })
        : await authClient.organization.rejectInvitation({ invitationId });
    if (res.error) {
      setError(res.error.message ?? "Failed");
      setBusy(false);
      return;
    }
    router.push("/pages");
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button disabled={busy} onClick={() => act("accept")}>Accept</button>
      <button disabled={busy} onClick={() => act("reject")}>Decline</button>
      {error && <span style={{ color: "crimson" }}>{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Create the accept page `src/app/(console)/invite/[id]/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { InviteActions } from "@/app/_components/InviteActions";

type Props = { params: Promise<{ id: string }> };

export default async function InvitePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?callback=/invite/${id}`);
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 16 }}>
      <h1>Join organization</h1>
      <p style={{ opacity: 0.75 }}>
        You&apos;ve been invited to a Kiosk workspace. Accept to join, or decline.
      </p>
      <InviteActions invitationId={id} />
    </main>
  );
}
```

> `acceptInvitation` requires the logged-in user to match the invitation (Better Auth binds by email). Confirm at manual e2e.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm build`
Expected: clean; `/invite/[id]` in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-client.ts "src/app/(console)/invite" src/app/_components/InviteActions.tsx
git commit -m "feat: invitation accept/decline page (/invite/[id])"
```

---

### Task 3: Members management + org switcher + create org

**Files:**
- Create: `src/app/(console)/settings/members/page.tsx`, `src/app/_components/OrgControls.tsx`, `src/app/_components/InviteForm.tsx`

**Interfaces:**
- Consumes: `getSession`, `resolveUserOrgRole`, `can`, `auth.api.getFullOrganization`, `authClient.organization.{inviteMember,removeMember,updateMemberRole,create,setActive,list}`, `pageUrl`-style origin from `NEXT_PUBLIC_APP_ORIGIN`.

- [ ] **Step 1: Members list (server component) `src/app/(console)/settings/members/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { resolveUserOrgRole } from "@/lib/console";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { InviteForm } from "@/app/_components/InviteForm";
import { OrgControls } from "@/app/_components/OrgControls";

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/members");
  const ctx = await resolveUserOrgRole(session.user.id);
  if (!ctx) redirect("/sign-in");

  const full = await auth.api.getFullOrganization({ headers: await headers() });
  const members = full?.members ?? [];
  const invitations = (full?.invitations ?? []).filter((i) => i.status === "pending");
  const manage = can(ctx.role, "member.invite");

  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16 }}>
      <h1>Members</h1>
      <OrgControls />
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {members.map((m) => (
          <li key={m.id} style={{ border: "1px solid #8883", borderRadius: 8, padding: 10 }}>
            <strong>{m.user?.email ?? m.userId}</strong> — {m.role}
          </li>
        ))}
      </ul>
      {manage && <InviteForm />}
      {manage && invitations.length > 0 && (
        <>
          <h2 style={{ fontSize: 15 }}>Pending invitations</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {invitations.map((i) => (
              <li key={i.id} style={{ fontSize: 13, opacity: 0.8 }}>
                {i.email} — {i.role}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
```

> Verify the shape of `getFullOrganization`'s return (`members`/`invitations`, member `user.email`) against better-auth at execution; adjust field access if needed.

- [ ] **Step 2: Invite form (client) `src/app/_components/InviteForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    setLink(null);
    const res = await authClient.organization.inviteMember({ email, role });
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Failed");
      return;
    }
    setLink(`${window.location.origin}/invite/${res.data.id}`);
    setEmail("");
  }

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 15 }}>Invite a member</h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={invite}>Create invite link</button>
      </div>
      {link && (
        <p style={{ fontSize: 13 }}>
          Share this link: <code>{link}</code>
        </p>
      )}
      {error && <span style={{ color: "crimson" }}>{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Org switcher + create (client) `src/app/_components/OrgControls.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Org = { id: string; name: string };

export function OrgControls() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    authClient.organization.list().then((r) => setOrgs((r.data as Org[]) ?? []));
  }, []);

  async function switchOrg(id: string) {
    await authClient.organization.setActive({ organizationId: id });
    router.refresh();
  }
  async function create() {
    if (!name.trim()) return;
    const slug = `o-${Math.random().toString(36).slice(2, 10)}`;
    const r = await authClient.organization.create({ name, slug });
    if (r.data) {
      await authClient.organization.setActive({ organizationId: (r.data as Org).id });
      setName("");
      router.refresh();
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 16px" }}>
      {orgs.length > 1 && (
        <select onChange={(e) => switchOrg(e.target.value)}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      )}
      <input placeholder="New org name" value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={create}>Create org</button>
    </div>
  );
}
```

- [ ] **Step 4: Build + full gate**

Run: `pnpm test && pnpm build`
Expected: pass; `/settings/members` in the route list.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(console)/settings/members" src/app/_components/InviteForm.tsx src/app/_components/OrgControls.tsx
git commit -m "feat: members management, org switcher, create org, invite links"
```

- [ ] **Step 6: Manual e2e (browser + a second account)**

Log in (owner) → `/settings/members` → create invite link → open it in a second browser/account (the invited email) → Accept → that account joins the org and sees the org's pages. Create a new org → switch → `/pages` scopes to it.

---

## Self-Review

**1. Spec coverage (§5, §6, §10):** active org on login (Task 1); create org + switcher (Task 3); invite by link + members list + role display/remove primitives (Task 3, via `authClient`); accept/decline (Task 2). Email delivery deferred (spec §6). ✓ Role-change/remove **buttons** are minimal here; full role-edit UI can extend in P2-5 if desired — the endpoints are wired via `authClient`.

**2. Placeholder scan:** none blocking. Three explicit "verify against better-auth at execution" notes (client method casing, `getFullOrganization` shape, org-client import path) are inspection steps, consistent with prior plans — not placeholders.

**3. Type consistency:** `resolveActiveOrg(session)` shape matches the console call + test; `authClient.organization.{list,create,setActive,inviteMember,acceptInvitation,rejectInvitation}` used consistently; invite link = `${origin}/invite/${invitation.id}` consumed by the `/invite/[id]` page's `InviteActions`.

## Note on P2-5

After P2-4, the remaining P2-5 work: page **visibility toggle** + **version-history viewer** in `/pages`; CLI `--public` / `kiosk share` / `whoami` role; and i18n (`messages/{en,zh}.json`) for all new console strings added here + in P2-5.
