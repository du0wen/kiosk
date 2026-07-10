# Kiosk P2 · Plan 1 — Data Model (visibility + page versions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the P2 data model — page `visibility`, edit/delete attribution, and an append-only `page_version` snapshot table — with a migration that backfills existing pages to `public`.

**Architecture:** Extend the existing `pages` table (Drizzle/Neon) with three columns and add a `page_version` table in the same schema file (pages domain). One generated schema migration + one custom backfill migration. Verified by an integration test against Neon.

**Tech Stack:** Drizzle ORM, `drizzle-kit generate/migrate`, Neon Postgres, Vitest, uuidv7.

> Spec: `docs/specs/2026-07-10-kiosk-p2-orgs-permissions-design.md` §3, §12.

## Global Constraints

- `pages.id` = uuidv7 (app-side, `$defaultFn(() => uuidv7())`); auth-table ids stay Better Auth text. FK columns referencing auth tables are `text`.
- Relative imports in `src/db/schema/*` (drizzle-kit's loader ignores the `@/` alias).
- Migrations: edit schema → `pnpm db:generate` → `pnpm db:migrate`. Backfill via a `drizzle-kit generate --custom` migration (never hand-edit generated schema migrations).
- Soft-delete semantics unchanged (`deleted_at is null` = active).
- Commits carry **no AI attribution**.

---

### Task 1: pages columns + page_version table + migration + backfill

**Files:**
- Modify: `src/db/schema/pages.ts` (add `visibility`, `updatedBy`, `deletedBy`; add `pageVersion` table)
- Create: `src/db/schema/pages.test.ts`
- Generate: one schema migration (`pnpm db:generate`) + one custom backfill migration

**Interfaces:**
- Produces:
  - `pages.visibility: 'org' | 'public'` (NOT NULL, default `'org'`), `pages.updatedBy: string | null`, `pages.deletedBy: string | null`.
  - `pageVersion` table + `PageVersion` type: `{ id, pageId, contentHtml, title, editedBy, createdAt }`.

- [ ] **Step 1: Write the failing test `src/db/schema/pages.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pages, pageVersion } from "@/db/schema";
import { uuidv7, publicId } from "@/lib/id";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string } | null = null;
const pageIds: string[] = [];

afterEach(async () => {
  for (const id of pageIds.splice(0)) {
    await db.delete(pageVersion).where(eq(pageVersion.pageId, id));
    await db.delete(pages).where(eq(pages.id, id));
  }
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
});

describe("pages P2 columns", () => {
  it("defaults visibility to 'org' and leaves updated_by/deleted_by null", async () => {
    principal = await createPrincipal();
    const id = uuidv7();
    pageIds.push(id);
    await db.insert(pages).values({
      id,
      publicId: publicId(),
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>hi</h1>",
      sizeBytes: 11,
    });
    const [row] = await db.select().from(pages).where(eq(pages.id, id));
    expect(row.visibility).toBe("org");
    expect(row.updatedBy).toBeNull();
    expect(row.deletedBy).toBeNull();
  });
});

describe("page_version", () => {
  it("stores a snapshot linked to a page", async () => {
    principal = await createPrincipal();
    const id = uuidv7();
    pageIds.push(id);
    await db.insert(pages).values({
      id,
      publicId: publicId(),
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: "<h1>v1</h1>",
      sizeBytes: 11,
    });
    await db.insert(pageVersion).values({
      pageId: id,
      contentHtml: "<h1>v1</h1>",
      title: "V1",
      editedBy: principal.userId,
    });
    const rows = await db
      .select()
      .from(pageVersion)
      .where(eq(pageVersion.pageId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].contentHtml).toBe("<h1>v1</h1>");
    expect(rows[0].editedBy).toBe(principal.userId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/db/schema/pages.test.ts`
Expected: FAIL — `pageVersion` is not exported / `visibility` missing.

- [ ] **Step 3: Edit `src/db/schema/pages.ts`**

Add the three columns to the `pages` table (after `deletedAt`, before the index closure) and the new table + types. Full new file:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./auth";
// Relative import: drizzle-kit's schema loader does not resolve the "@/" alias.
import { uuidv7 } from "../../lib/id";

export const pages = pgTable(
  "pages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    publicId: text("public_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    title: text("title"),
    contentHtml: text("content_html").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentHash: text("content_hash"),
    viewCount: integer("view_count").notNull().default(0),
    // P2: 'org' (private, default) | 'public'. Backfilled to 'public' for P1 rows.
    visibility: text("visibility").notNull().default("org"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => user.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => user.id),
  },
  (t) => [
    uniqueIndex("pages_public_id_uq").on(t.publicId),
    index("pages_org_active_idx")
      .on(t.organizationId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;

/**
 * Append-only snapshot of a page's content on each create / content-changing
 * update. Current content stays on `pages.content_html` (fast serving); this
 * table is view-only history (rollback UI deferred). See spec §8.
 */
export const pageVersion = pgTable(
  "page_version",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    contentHtml: text("content_html").notNull(),
    title: text("title"),
    editedBy: text("edited_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("page_version_page_idx").on(t.pageId)],
);

export type PageVersion = typeof pageVersion.$inferSelect;
```

> The barrel `src/db/schema/index.ts` uses `export * from "./pages"`, so `pageVersion` is exported automatically.

- [ ] **Step 4: Generate the schema migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/NNNN_*.sql` adding columns `visibility`/`updated_by`/`deleted_by` to `pages` (visibility `DEFAULT 'org' NOT NULL`) and `CREATE TABLE "page_version"` with its FK + index. Confirm no unrelated drops (no interactive prompt — only additions).

- [ ] **Step 5: Create the backfill migration**

Run: `pnpm exec drizzle-kit generate --custom --name=backfill_visibility_public`
Then write into the created `drizzle/NNNN_backfill_visibility_public.sql`:

```sql
-- P1 pages were public and their links may already be shared. Preserve that:
-- flip all pre-existing rows to 'public'. New rows keep the 'org' default.
UPDATE "pages" SET "visibility" = 'public';
```

- [ ] **Step 6: Apply migrations**

Run: `pnpm db:migrate`
Expected: `migrations applied successfully`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm exec vitest run src/db/schema/pages.test.ts`
Expected: PASS (2 tests). A freshly inserted page defaults `visibility='org'`; `page_version` insert/select works.

- [ ] **Step 8: Verify the backfill hit the existing page**

Run:
```bash
pnpm exec tsx -e "
import 'dotenv/config';
import { db } from './src/db/index.ts';
import { sql } from 'drizzle-orm';
(async () => {
  const r = await db.execute(sql\`select visibility, count(*) from pages group by visibility\`);
  console.log((r.rows ?? r));
  process.exit(0);
})();
" 2>&1 | grep -v "Warning\|websocket\|can only"
```
Expected: existing page(s) show `visibility = public` (backfill worked).

- [ ] **Step 9: Commit**

```bash
git add src/db/schema/pages.ts src/db/schema/pages.test.ts drizzle/
git commit -m "feat: page visibility + edit/delete attribution + page_version table"
```

---

## Self-Review

**1. Spec coverage (§3, §12):** `visibility` default `'org'` ✓ (Step 3); `updated_by`/`deleted_by` ✓; `page_version` append-only snapshot table ✓; backfill existing → `public` ✓ (Step 5); soft-delete unchanged ✓. Write-time snapshot *insertion* is P2-2 (write path), not here — this plan only lands the schema.

**2. Placeholder scan:** none. All code + SQL + commands are concrete.

**3. Type consistency:** `pageVersion` columns (`pageId` uuid → `pages.id`, `editedBy` text → `user.id`) match the test's insert. `visibility` string default `'org'` matches the test assertion. `PageVersion`/`Page`/`NewPage` types exported. Barrel re-export covers `pageVersion`.
