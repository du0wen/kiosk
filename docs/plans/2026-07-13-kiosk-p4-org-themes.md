# Kiosk P4 — Org Themes / Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org configure a theme color + export watermark; apply the brand (org name + color) to the `/v` shell and the watermark to exports.

**Architecture:** A new app-owned `org_settings` table + `src/lib/org-settings.ts` service. The `/v` shell reads the page-org's branding; export threads the org watermark to `renderRemote` (contract gains `watermark?`) and appends an HTML footer. `/settings` gets an owner/admin branding form.

**Tech Stack:** Drizzle/Neon, Next.js (server component + server action), Vitest.

> Spec: `docs/specs/2026-07-13-kiosk-p4-org-themes-design.md`. Consumes serving v2 (`/v`), P3 (`export.ts`/`renderRemote`), P2 (`can`, `resolveActiveOrg`, `roleInOrg`).

## Global Constraints

- Text + color only. **No logo/blob.** Brand name = `organization.name`.
- `themeColor` validated `^#[0-9a-fA-F]{6}$` before storage/use (only into a controlled inline style — no arbitrary CSS).
- Watermark: HTML export footer works now; PDF/PNG/JPEG pass `watermark` to the render service (effective when P3-2 exists); MD skips.
- Branding config gated by `can(role, "org.update")` (owner/admin).
- Commits carry **no AI attribution**.

---

### Task 1: `org_settings` table + service

**Files:**
- Create: `src/db/schema/org-settings.ts`, `src/lib/org-settings.ts`, `src/lib/org-settings.test.ts`
- Modify: `src/db/schema/index.ts` (barrel — already `export *`, confirm the new file is covered)
- Generate/migrate: `org_settings` table

**Interfaces:**
- Produces:
  - `orgSettings` Drizzle table + `OrgSettings` type.
  - `isHexColor(v: string): boolean`
  - `getOrgSettings(orgId: string): Promise<{ themeColor: string | null; exportWatermark: string | null }>`
  - `setOrgSettings(orgId: string, patch: { themeColor?: string | null; exportWatermark?: string | null }): Promise<void>` (throws `Error` on invalid hex)
  - `getOrgBranding(orgId: string): Promise<{ name: string | null; themeColor: string | null }>`

- [ ] **Step 1: Schema `src/db/schema/org-settings.ts`**

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const orgSettings = pgTable("org_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  themeColor: text("theme_color"),
  exportWatermark: text("export_watermark"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
```
Add `export * from "./org-settings";` to `src/db/schema/index.ts` if the barrel lists files explicitly (it uses `export *` per module — add the line).

- [ ] **Step 2: Migrate** — `pnpm db:generate` (creates `org_settings`; additions-only → no prompt) then `pnpm db:migrate`. Verify the table exists.

- [ ] **Step 3: Write failing test `src/lib/org-settings.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { isHexColor, getOrgSettings, setOrgSettings, getOrgBranding } from "./org-settings";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("isHexColor", () => {
  it("validates #rrggbb", () => {
    expect(isHexColor("#1a2b3c")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#12345g")).toBe(false);
  });
});

describe("org settings", () => {
  it("defaults to null, round-trips a patch, rejects bad hex", async () => {
    principal = await createPrincipal();
    const org = principal.organizationId;
    expect(await getOrgSettings(org)).toEqual({ themeColor: null, exportWatermark: null });
    await setOrgSettings(org, { themeColor: "#4f46e5", exportWatermark: "ACME confidential" });
    expect(await getOrgSettings(org)).toEqual({ themeColor: "#4f46e5", exportWatermark: "ACME confidential" });
    await expect(setOrgSettings(org, { themeColor: "notacolor" })).rejects.toThrow();
  });
  it("getOrgBranding joins the org name", async () => {
    principal = await createPrincipal();
    await setOrgSettings(principal.organizationId, { themeColor: "#000000" });
    const b = await getOrgBranding(principal.organizationId);
    expect(b.themeColor).toBe("#000000");
    expect(typeof b.name).toBe("string");
  });
});
```

> `cleanupPrincipal` deletes the org → `org_settings` row goes via FK cascade; no extra cleanup needed.

- [ ] **Step 4: Run to verify it fails** — `pnpm exec vitest run src/lib/org-settings.test.ts`.

- [ ] **Step 5: Implement `src/lib/org-settings.ts`**

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings, organization } from "@/db/schema";

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export async function getOrgSettings(
  organizationId: string,
): Promise<{ themeColor: string | null; exportWatermark: string | null }> {
  const [row] = await db
    .select({ themeColor: orgSettings.themeColor, exportWatermark: orgSettings.exportWatermark })
    .from(orgSettings)
    .where(eq(orgSettings.organizationId, organizationId))
    .limit(1);
  return { themeColor: row?.themeColor ?? null, exportWatermark: row?.exportWatermark ?? null };
}

export async function setOrgSettings(
  organizationId: string,
  patch: { themeColor?: string | null; exportWatermark?: string | null },
): Promise<void> {
  if (typeof patch.themeColor === "string" && !isHexColor(patch.themeColor)) {
    throw new Error("themeColor must be #rrggbb");
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ("themeColor" in patch) set.themeColor = patch.themeColor;
  if ("exportWatermark" in patch) set.exportWatermark = patch.exportWatermark;
  await db
    .insert(orgSettings)
    .values({
      organizationId,
      themeColor: patch.themeColor ?? null,
      exportWatermark: patch.exportWatermark ?? null,
    })
    .onConflictDoUpdate({ target: orgSettings.organizationId, set });
}

export async function getOrgBranding(
  organizationId: string,
): Promise<{ name: string | null; themeColor: string | null }> {
  const [row] = await db
    .select({ name: organization.name, themeColor: orgSettings.themeColor })
    .from(organization)
    .leftJoin(orgSettings, eq(orgSettings.organizationId, organization.id))
    .where(eq(organization.id, organizationId))
    .limit(1);
  return { name: row?.name ?? null, themeColor: row?.themeColor ?? null };
}
```

- [ ] **Step 6: Run to verify it passes.**

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/org-settings.ts src/db/schema/index.ts src/lib/org-settings.ts src/lib/org-settings.test.ts drizzle/
git commit -m "feat: org_settings table + service (theme color, export watermark)"
```

---

### Task 2: export watermark (HTML footer + render passthrough)

**Files:**
- Modify: `src/lib/export.ts` (`renderRemote`/`exportPage` gain `watermark`), `src/lib/export.test.ts`
- Modify: `src/app/api/v1/pages/[id]/export/route.ts`, `src/app/(console)/pages/[id]/export/route.ts` (fetch watermark, pass through)
- Modify: `render/README.md` (contract `+ watermark?`)

**Interfaces:**
- Produces: `exportPage(page, format, watermark?: string | null)`; render POST body `{ html, format, watermark? }`.

- [ ] **Step 1: Add failing cases to `src/lib/export.test.ts`**

```typescript
describe("watermark", () => {
  it("html appends an escaped footer when watermark set", async () => {
    const r = await exportPage(page, "html", "ACME <secret>");
    expect(String(r.body)).toContain(page.contentHtml);
    expect(String(r.body)).toContain("ACME &lt;secret&gt;");
  });
  it("html unchanged when no watermark", async () => {
    const r = await exportPage(page, "html", null);
    expect(r.body).toBe(page.contentHtml);
  });
  it("pdf forwards the watermark to the render service", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await exportPage(page, "pdf", "WM");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ format: "pdf", watermark: "WM" });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Update `src/lib/export.ts`**

Add an HTML escaper + thread `watermark`:
```typescript
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function renderRemote(
  html: string,
  format: "pdf" | "png" | "jpeg",
  watermark?: string | null,
): Promise<Buffer> {
  // ...unchanged setup...
  body: JSON.stringify({ html, format, ...(watermark ? { watermark } : {}) }),
  // ...unchanged...
}

export async function exportPage(
  page: { publicId: string; title: string | null; contentHtml: string },
  format: ExportFormat,
  watermark?: string | null,
): Promise<{ body: Buffer | string; contentType: string; ext: string }> {
  if (format === "md") {
    return { body: toMarkdown(page.contentHtml), contentType: "text/markdown; charset=utf-8", ext: "md" };
  }
  if (format === "html") {
    const footer = watermark
      ? `\n<footer style="position:fixed;bottom:8px;right:12px;font:12px sans-serif;color:#8888;opacity:.7">${escapeHtml(watermark)}</footer>`
      : "";
    return { body: page.contentHtml + footer, contentType: "text/html; charset=utf-8", ext: "html" };
  }
  const body = await renderRemote(page.contentHtml, format, watermark);
  return { body, contentType: RENDERED[format], ext: format };
}
```

- [ ] **Step 4: Thread watermark in both export routes**

In each route, after loading `page`, fetch the org watermark and pass it:
```typescript
import { getOrgSettings } from "@/lib/org-settings";
// ...
const { exportWatermark } = await getOrgSettings(page.organizationId);
const { body, contentType, ext } = await exportPage(page, format, exportWatermark);
```
(API route: `page.organizationId` = `organizationId` from `requireToken`; console route: same via `getPage`.)

- [ ] **Step 5: Update `render/README.md`** — contract body: `{ html, format, watermark?, viewport? }`; note the service overlays `watermark` when present.

- [ ] **Step 6: Run tests** — `pnpm exec vitest run src/lib/export.test.ts "src/app/api/v1/pages/[id]/export"` → green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts src/app/api/v1/pages/"[id]"/export "src/app/(console)/pages/[id]/export" render/README.md
git commit -m "feat: export watermark — HTML footer + render passthrough"
```

---

### Task 3: `/v` branding + `/settings` config UI + gate

**Files:**
- Modify: `src/app/v/[id]/page.tsx` (apply branding)
- Modify/Create: `src/app/(console)/settings/page.tsx` (branding form) — inspect; create if absent
- Modify: `messages/en.json`, `messages/zh.json`

**Interfaces:**
- Consumes: `getOrgBranding`, `getOrgSettings`/`setOrgSettings`, `getSession`, `resolveActiveOrg`, `roleInOrg`, `can`.

- [ ] **Step 1: Apply branding in `src/app/v/[id]/page.tsx`**

After loading `page`, fetch branding and use it in the header:
```tsx
import { getOrgBranding } from "@/lib/org-settings";
// ...
const brand = await getOrgBranding(page.organizationId);
const accent = brand.themeColor ?? "#4f46e5";
// header:
<header style={{ ...bar, borderBottomColor: accent }}>
  <strong style={{ color: accent }}>{brand.name ?? "Kiosk"}</strong>
  <span style={{ opacity: 0.8 }}>{page.title ?? id}</span>
  {/* ...open raw / report... */}
</header>
```
(`bar` gains nothing else; `borderBottomColor` overrides the default border.)

- [ ] **Step 2: Branding form in `src/app/(console)/settings/page.tsx`**

Inspect the file; if it exists add a "Branding" section, else create the page. Server component + server action:
```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { resolveActiveOrg, roleInOrg } from "@/lib/console";
import { getOrgSettings, setOrgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings");
  const org = await resolveActiveOrg(session);
  if (!org) redirect("/sign-in");
  const role = await roleInOrg(session.user.id, org);
  const canEdit = !!role && can(role, "org.update");
  const s = await getOrgSettings(org);

  async function save(formData: FormData) {
    "use server";
    const ss = await getSession();
    if (!ss) return;
    const o = await resolveActiveOrg(ss);
    if (!o) return;
    const r = await roleInOrg(ss.user.id, o);
    if (!r || !can(r, "org.update")) return;
    const color = String(formData.get("themeColor") || "");
    const wm = String(formData.get("exportWatermark") || "");
    try {
      await setOrgSettings(o, {
        themeColor: color ? color : null,
        exportWatermark: wm ? wm : null,
      });
    } catch {
      // invalid hex — ignore; UI shows current value
    }
    revalidatePath("/settings");
  }

  return (
    <main style={{ maxWidth: 560, margin: "4vh auto", padding: 16 }}>
      <h1>Settings</h1>
      <h2 style={{ fontSize: 16 }}>Branding</h2>
      {canEdit ? (
        <form action={save} style={{ display: "grid", gap: 10, maxWidth: 360 }}>
          <label>Theme color
            <input type="color" name="themeColor" defaultValue={s.themeColor ?? "#4f46e5"} />
          </label>
          <label>Export watermark
            <input name="exportWatermark" defaultValue={s.exportWatermark ?? ""} placeholder="e.g. ACME — confidential" />
          </label>
          <button type="submit">Save</button>
        </form>
      ) : (
        <p style={{ opacity: 0.7 }}>Only owners/admins can edit branding.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: i18n** — add nothing new is strictly required (labels above are literal for brevity); if the existing settings page uses `getTranslations`, follow it and add keys `settings.branding`, `settings.themeColor`, `settings.watermark`, `settings.save` to `messages/{en,zh}.json`. (If creating the page fresh, literals are acceptable for P4 — note it.)

- [ ] **Step 4: Full gate**

Run: `pnpm test && pnpm build && pnpm exec tsc -p cli/tsconfig.json --noEmit`. Expected: pass; `/settings` renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/v "src/app/(console)/settings" messages
git commit -m "feat: apply org branding to /v shell + settings branding form"
```

- [ ] **Step 6: Docs** — note P4 in `.claude/rules/console.md` (settings branding) + `CLAUDE.md` (P4 done). Commit `docs: P4 org themes`.

- [ ] **Step 7: Manual smoke** — `/settings` set a color + watermark (as owner) → open a page's `/v` → top-bar shows org name + color; export HTML → footer watermark present.

---

## Self-Review

**1. Spec coverage:** `org_settings` table + service (Task 1); `/v` brand name + color (Task 3); export watermark HTML footer + render passthrough + contract update (Task 2); `/settings` owner/admin form gated by `can("org.update")` (Task 3); hex validated (Task 1). MD skip; PDF/PNG/JPEG watermark effective when P3-2 exists (noted). No logo/blob. ✓

**2. Placeholder scan:** none blocking. Task 3 Step 2/3 "inspect the settings file; create if absent" + i18n-if-used are conditional inspect-then-act steps.

**3. Type consistency:** `getOrgSettings → {themeColor, exportWatermark}`, `getOrgBranding → {name, themeColor}`, `setOrgSettings(orgId, patch)`, `isHexColor` used identically across service/tests/routes/UI; `exportPage(page, format, watermark?)` + render body `{html, format, watermark?}` match the export routes + `render/README.md` contract.
