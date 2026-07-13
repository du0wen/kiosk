# Kiosk P2 Polish — Member management UI + version rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the two P2 UI gaps whose backends already exist — remove-member / change-role controls on the members page, and rollback-to-a-version on the page history view.

**Architecture:** Version rollback = a new `getPageVersionContent` service + a console server action that re-`updatePage`s with the old content (which appends a fresh version). Member controls = a client `MemberRow` calling `authClient.organization.removeMember/updateMemberRole`, shown only to owner/admin.

**Tech Stack:** Drizzle, Next.js (server component + server action + client component), `authClient.organization.*`, Vitest.

> Consumes: P2-1 (`pageVersion`), P2-2 (`can`, `roleInOrg`), P2-4 (members page, `authClient.organization`), P2-5 (`listPageVersions`, history page). Spec: P2 §8, §10.

## Global Constraints

- Rollback is an **edit** → allowed for any member (matrix: edit any page); it appends a new `page_version` (the restored content becomes latest) — no destructive overwrite of history.
- Member remove/role controls shown only when `can(role, "member.remove")` (owner/admin); Better Auth enforces the finer rules (can't remove/demote owner) server-side.
- Out of scope (flagged, not built here): version content preview/diff (needs a sandboxed render path); email invite delivery (needs an email provider — pending user's choice).
- Commits carry **no AI attribution**.

---

### Task 1: version rollback

**Files:**
- Modify: `src/lib/pages.ts` (add `getPageVersionContent`), `src/lib/pages.test.ts`
- Modify: `src/app/(console)/pages/[id]/history/page.tsx` (Restore button + server action)

**Interfaces:**
- Produces: `getPageVersionContent({ publicId, organizationId, versionId }) => Promise<string | null>`.

- [ ] **Step 1: Failing test in `src/lib/pages.test.ts`**

```typescript
import { getPageVersionContent } from "./pages";

describe("getPageVersionContent", () => {
  it("returns a version's html (org-scoped)", async () => {
    const p = await createPrincipal();
    try {
      const page = await createPage({ organizationId: p.organizationId, userId: p.userId, html: "<h1>v1</h1>" });
      const versions = await listPageVersions({ publicId: page.publicId, organizationId: p.organizationId });
      const html = await getPageVersionContent({
        publicId: page.publicId,
        organizationId: p.organizationId,
        versionId: versions[0].id,
      });
      expect(html).toBe("<h1>v1</h1>");
      // wrong org → null
      expect(
        await getPageVersionContent({ publicId: page.publicId, organizationId: "nope", versionId: versions[0].id }),
      ).toBeNull();
    } finally { await cleanupPrincipal(p); }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `getPageVersionContent` in `src/lib/pages.ts`**

```typescript
export async function getPageVersionContent(params: {
  publicId: string;
  organizationId: string;
  versionId: string;
}): Promise<string | null> {
  const page = await getPage({
    publicId: params.publicId,
    organizationId: params.organizationId,
  });
  if (!page) return null;
  const [v] = await db
    .select({ html: pageVersion.contentHtml })
    .from(pageVersion)
    .where(and(eq(pageVersion.id, params.versionId), eq(pageVersion.pageId, page.id)))
    .limit(1);
  return v?.html ?? null;
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Add Restore to `src/app/(console)/pages/[id]/history/page.tsx`**

Add imports (`revalidatePath` from `next/cache`; `roleInOrg` from `@/lib/console`; `getPageVersionContent`, `updatePage`, `getPage` from `@/lib/pages`; `can` from `@/lib/permissions`). Add a server action + a Restore button per version:

```tsx
  async function restore(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) return;
    const o = await resolveActiveOrg(s);
    if (!o) return;
    const role = await roleInOrg(s.user.id, o);
    if (!role || !can(role, "page.edit")) return;
    const html = await getPageVersionContent({
      publicId: id,
      organizationId: o,
      versionId: String(formData.get("versionId")),
    });
    if (html == null) return;
    await updatePage({ publicId: id, organizationId: o, userId: s.user.id, html });
    revalidatePath(`/pages/${id}/history`);
    revalidatePath("/pages");
  }
```
In the version `<li>`, add:
```tsx
            <form action={restore} style={{ display: "inline" }}>
              <input type="hidden" name="versionId" value={v.id} />
              <button type="submit" style={{ marginLeft: 8 }}>Restore</button>
            </form>
```

- [ ] **Step 6: Build + run pages test** — `pnpm exec vitest run src/lib/pages.test.ts && pnpm build`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pages.ts src/lib/pages.test.ts "src/app/(console)/pages"
git commit -m "feat: roll back a page to a previous version"
```

---

### Task 2: member remove / change-role controls

**Files:**
- Create: `src/app/_components/MemberRow.tsx`
- Modify: `src/app/(console)/settings/members/page.tsx`

**Interfaces:**
- Consumes: `authClient.organization.removeMember`, `authClient.organization.updateMemberRole` (verify exact body shapes vs installed better-auth at execution — endpoints `/organization/remove-member`, `/organization/update-member-role`).

- [ ] **Step 1: `MemberRow` client component `src/app/_components/MemberRow.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Props = {
  memberId: string;
  email: string;
  role: string;
  manage: boolean;
  isSelf: boolean;
};

export function MemberRow({ memberId, email, role, manage, isSelf }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setRole(next: string) {
    setBusy(true);
    await authClient.organization.updateMemberRole({ memberId, role: next });
    setBusy(false);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    setBusy(false);
    router.refresh();
  }

  return (
    <li style={{ border: "1px solid #8883", borderRadius: 8, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
      <strong>{email}</strong>
      {manage && role !== "owner" && !isSelf ? (
        <>
          <select value={role} disabled={busy} onChange={(e) => setRole(e.target.value)}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button disabled={busy} onClick={remove} style={{ marginLeft: "auto" }}>Remove</button>
        </>
      ) : (
        <span style={{ opacity: 0.7 }}>{role}</span>
      )}
    </li>
  );
}
```

> Verify at execution: `updateMemberRole` param key (`memberId` + `role`) and `removeMember` param (`memberIdOrEmail`) against the installed better-auth client types; adjust if they differ.

- [ ] **Step 2: Use `MemberRow` in the members page**

In `src/app/(console)/settings/members/page.tsx`, replace the plain member `<li>` map with `MemberRow`, passing `manage` (already computed) + `isSelf` (`m.userId === session.user.id`):
```tsx
import { MemberRow } from "@/app/_components/MemberRow";
// ...
        {members.map((m) => (
          <MemberRow
            key={m.id}
            memberId={m.id}
            email={m.user?.email ?? m.userId}
            role={m.role}
            manage={manage}
            isSelf={m.userId === session.user.id}
          />
        ))}
```

- [ ] **Step 3: Build** — `pnpm build`. Expected clean; `/settings/members` still lists.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/MemberRow.tsx "src/app/(console)/settings/members"
git commit -m "feat: members page remove + change-role controls (owner/admin)"
```

---

### Task 3: gate + docs

- [ ] **Step 1: Full gate** — `pnpm test && pnpm build && pnpm exec tsc -p cli/tsconfig.json --noEmit`.
- [ ] **Step 2: Docs** — note in `.claude/rules/console.md`: members page supports remove/role-change (owner/admin); history view supports Restore. Commit `docs: p2 polish`.
- [ ] **Step 3: Manual smoke** — history page → Restore an older version → `/pages` shows restored content + a new version row. Members page (as owner) → change a member's role / remove them.

---

## Self-Review

**1. Coverage:** members remove + role-change UI (Task 2, backends from P2-4); version rollback (Task 1, un-defers P2 spec §8's deferred rollback per user request). Version content preview/diff + email delivery explicitly out of scope (flagged).

**2. Placeholder scan:** none. The `authClient` param-shape verification (Task 2 Step 1) is an inspect-then-adjust step, consistent with prior plans.

**3. Type consistency:** `getPageVersionContent({publicId, organizationId, versionId}) => string | null` matches the test + the restore action; `updatePage(...html)` reused with its existing signature (appends a version on content change); `MemberRow` props (`memberId/email/role/manage/isSelf`) match the members-page call site.
