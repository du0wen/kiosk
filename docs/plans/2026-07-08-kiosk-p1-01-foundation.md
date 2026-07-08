# Kiosk P1 · Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Kiosk app skeleton — Next.js + Drizzle/Neon + Better Auth (GitHub/Google OAuth) — with the full multi-tenant schema and automatic personal-org provisioning on signup.

**Architecture:** One Next.js (App Router) app. Better Auth owns `user`/`session`/`account`/`verification`/`apikey`/`organization`/`member`/`invitation`; the app owns `pages`. On first sign-in a personal organization + owner membership are created via a `databaseHooks.user.create.after` hook, so every page can hang off `organization_id` from day one (P2 = pure addition).

**Tech Stack:** TypeScript, pnpm, Next.js (App Router), Drizzle ORM, Neon Postgres (`drizzle-orm/neon-serverless`), Better Auth (`organization` + `apiKey` plugins), Vitest.

> This is Plan **1 of 6** for P1 (Foundation → Publish API → Serving → CLI → Skill packaging → Console+i18n). Later plans consume interfaces produced here.

## Global Constraints

Copied verbatim from `docs/specs/2026-07-08-kiosk-p1-publish-core-design.md`. Every task's requirements implicitly include these.

- Single Next.js App Router app; deploy target Vercel + Neon (portable to Docker).
- Auth tables: **Better Auth default text id** (do not override id strategy).
- `pages.id` = **uuidv7, application-side generated** (not `gen_random_uuid()`).
- `public_id` = nanoid **base62, ~12 chars**; it is the URL id and the API `:id`.
- `APP_ORIGIN` (console+API) and `SERVE_ORIGIN` (public serving) are **two separate registrable domains**. Serving is Plan 3; here `SERVE_ORIGIN` is only an env placeholder.
- Session cookie: `__Host-` prefix, `Secure`, `SameSite=Lax`, host-only on `APP_ORIGIN`; **never** `Domain=<parent>`.
- Login: **OAuth GitHub + Google** only in P1 (no email/password).
- Single page cap 2MB, token prefix `kiosk_live_`, strict serving CSP — enforced in later plans; not this one.
- **Commits must carry no AI attribution** (no `Co-Authored-By`, no "Generated with…").

---

## File Structure

- `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example` — project + tooling config.
- `vitest.config.ts` — test runner; loads `.env` for DB-integration tests.
- `drizzle.config.ts` — Drizzle Kit config (schema dir + Neon URL).
- `src/db/index.ts` — Neon pool + Drizzle client (single export `db`).
- `src/db/schema/auth.ts` — Better Auth generated tables (produced by CLI).
- `src/db/schema/pages.ts` — the `pages` table (app-owned).
- `src/db/schema/index.ts` — barrel re-exporting all schema.
- `src/lib/id.ts` — `uuidv7()` + `publicId()` generators.
- `src/lib/auth.ts` — Better Auth server instance (adapter + plugins + providers + hooks).
- `src/lib/auth-client.ts` — Better Auth browser client (org + apiKey client plugins).
- `src/lib/org.ts` — `provisionPersonalOrg()` used by the signup hook.
- `src/lib/session.ts` — `getSession()` server helper.
- `src/app/api/auth/[...all]/route.ts` — mounts the Better Auth handler.
- `src/app/(auth)/sign-in/page.tsx` — OAuth sign-in screen.
- Tests: `src/lib/id.test.ts`, `src/lib/org.test.ts`.

Responsibility split: `db/` = persistence, `lib/` = domain/auth logic, `app/` = HTTP/UI surface. Each file has one job so later plans can extend without touching unrelated code.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `vitest.config.ts`, `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable Next.js app and a working `pnpm vitest` runner for all later tasks.

- [ ] **Step 1: Scaffold the Next.js app**

Run (in `/Users/kevin/Code/kiosk`, which already contains `docs/` and `.git`):
```bash
pnpm dlx create-next-app@latest . \
  --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-pnpm
```
When prompted that the directory is not empty, keep existing files (`docs/`, `.git/`). If it refuses, scaffold in a temp dir and copy `src/`, `app/`? — instead pass `--yes` and merge. Expected: `package.json`, `src/app/` created, `@/*` alias mapped to `src/*`.

- [ ] **Step 2: Add runtime + dev dependencies**

```bash
pnpm add better-auth drizzle-orm @neondatabase/serverless ws uuid nanoid
pnpm add -D drizzle-kit vitest dotenv @types/ws @types/node
```
Expected: all resolve; `package.json` lists them.

- [ ] **Step 3: Add scripts to `package.json`**

Merge into the `"scripts"` block:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "auth:generate": "pnpm dlx @better-auth/cli generate --output src/db/schema/auth.ts"
  }
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB-integration tests run serially against one test database.
    fileParallelism: false,
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
```

- [ ] **Step 5: Write `.env.example`**

```bash
# App
APP_ORIGIN=http://localhost:3000
SERVE_ORIGIN=http://localhost:3001   # Plan 3; must be a SEPARATE registrable domain in prod
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=                    # openssl rand -base64 32

# Database (Neon)
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/kiosk?sslmode=require

# OAuth (infra-managed; create apps in GitHub/Google consoles)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```
Then `cp .env.example .env` and fill `DATABASE_URL` + `BETTER_AUTH_SECRET` for local work. Confirm `.env` is in `.gitignore` (create-next-app adds it; if not, add `.env`).

- [ ] **Step 6: Verify build + test runner**

Run:
```bash
pnpm build && pnpm test
```
Expected: build succeeds; Vitest reports "No test files found" (exit 0). If build fails on missing env, it's fine — `next build` should not need runtime env yet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with drizzle, better-auth, vitest tooling"
```

---

### Task 2: Neon + Drizzle client

**Files:**
- Create: `src/db/index.ts`, `src/db/schema/index.ts`, `drizzle.config.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`.
- Produces: `db` (Drizzle client bound to all schema) — imported by every DB-touching module. `src/db/schema/index.ts` is the schema barrel later tasks append to.

- [ ] **Step 1: Write `src/db/schema/index.ts` (empty barrel for now)**

```typescript
// Re-exports every table. Tasks 4 and 5 append to this file.
export {};
```

- [ ] **Step 2: Write `src/db/index.ts`**

```typescript
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// neon-serverless (WebSocket) is used instead of neon-http so Better Auth's
// multi-step writes can run in transactions. `ws` is required under Node.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Verify the client imports cleanly**

Run:
```bash
pnpm exec tsx -e "import('./src/db/index.ts').then(() => console.log('db import ok'))" 2>/dev/null || pnpm exec vitest run --dir src/db 2>&1 | head -5
```
Expected: no module-resolution/type errors. (No tables yet, so no query.) If `tsx` is absent, `pnpm add -D tsx` first.

- [ ] **Step 5: Commit**

```bash
git add src/db drizzle.config.ts
git commit -m "feat: add neon-backed drizzle client and drizzle-kit config"
```

---

### Task 3: ID generators (TDD)

**Files:**
- Create: `src/lib/id.ts`, `src/lib/id.test.ts`

**Interfaces:**
- Consumes: `uuid` (v7), `nanoid`.
- Produces:
  - `uuidv7(): string` — RFC 9562 v7 UUID; used as `pages.id` default and for app-generated org/member ids.
  - `publicId(): string` — 12-char base62 id for `pages.public_id` and public URLs.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/id.test.ts
import { describe, it, expect } from "vitest";
import { uuidv7, publicId } from "./id";

describe("uuidv7", () => {
  it("returns a version-7 UUID", () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it("is time-ordered (later id sorts after earlier)", () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(b >= a).toBe(true);
  });
});

describe("publicId", () => {
  it("is 12 base62 chars", () => {
    expect(publicId()).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it("is unique across 10k draws", () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => publicId()));
    expect(seen.size).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/id.test.ts`
Expected: FAIL — `Failed to resolve import "./id"` / `uuidv7 is not a function`.

- [ ] **Step 3: Implement `src/lib/id.ts`**

```typescript
import { v7 } from "uuid";
import { customAlphabet } from "nanoid";

/** RFC 9562 v7 UUID (time-ordered). Used for pages.id and app-generated ids. */
export function uuidv7(): string {
  return v7();
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(BASE62, 12);

/** 12-char base62 id for pages.public_id and public URLs (unguessable, unlisted). */
export function publicId(): string {
  return nano();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/id.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/id.ts src/lib/id.test.ts
git commit -m "feat: add uuidv7 and public_id generators"
```

---

### Task 4: Better Auth server + schema

**Files:**
- Create: `src/lib/auth.ts`
- Generate: `src/db/schema/auth.ts` (via CLI)
- Modify: `src/db/schema/index.ts`

**Interfaces:**
- Consumes: `db`, OAuth env vars.
- Produces:
  - `auth` — Better Auth instance (used by the route handler, session helper, and API-key verification in Plan 2).
  - Schema tables `user`, `session`, `account`, `verification`, `apikey`, `organization`, `member`, `invitation` (importable from `@/db/schema`), consumed by Task 5's FKs and Task 6's provisioning.

- [ ] **Step 1: Write `src/lib/auth.ts`**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, apiKey } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  advanced: {
    // Host-only, __Host- prefixed cookies: never shared with SERVE_ORIGIN.
    cookiePrefix: "__Host-kiosk",
    useSecureCookies: true,
  },
  plugins: [
    organization(),
    apiKey({ defaultPrefix: "kiosk_live_" }),
  ],
});

export type Auth = typeof auth;
```
> Note: `databaseHooks` for org provisioning is added in Task 6, not here.

- [ ] **Step 2: Generate the Better Auth schema**

Run:
```bash
pnpm auth:generate   # => pnpm dlx @better-auth/cli generate --output src/db/schema/auth.ts
```
Expected: `src/db/schema/auth.ts` created containing Drizzle `pgTable` definitions for `user`, `session`, `account`, `verification`, `apikey`, `organization`, `member`, `invitation`. If the CLI prompts for the auth config path, point it at `src/lib/auth.ts`.

- [ ] **Step 3: Re-export auth schema from the barrel**

Edit `src/db/schema/index.ts`:
```typescript
export * from "./auth";
// pages export added in Task 5.
```

- [ ] **Step 4: Generate + run the migration**

```bash
pnpm db:generate   # drizzle-kit generate -> ./drizzle/*.sql
pnpm db:migrate    # applies to Neon
```
Expected: a migration file is written and applied; no errors.

- [ ] **Step 5: Verify tables exist**

Run:
```bash
pnpm exec tsx -e "import('./src/db/index.ts').then(async ({db}) => { const r = await db.execute(\"select table_name from information_schema.tables where table_schema='public' order by 1\"); console.log(r.rows ?? r); })"
```
Expected: rows include `account, apikey, invitation, member, organization, session, user, verification`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/db/schema/auth.ts src/db/schema/index.ts drizzle/
git commit -m "feat: configure better-auth with org and apiKey plugins and migrate schema"
```

---

### Task 5: `pages` table

**Files:**
- Create: `src/db/schema/pages.ts`
- Modify: `src/db/schema/index.ts`

**Interfaces:**
- Consumes: `organization`, `user` (from `./auth`); `uuidv7` (from `@/lib/id`).
- Produces: table `pages` with columns `id, public_id, organization_id, created_by, title, content_html, size_bytes, content_hash, view_count, created_at, updated_at, deleted_at` — the core table Plans 2/3/6 read and write.

- [ ] **Step 1: Write `src/db/schema/pages.ts`**

```typescript
import {
  pgTable, uuid, text, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./auth";
import { uuidv7 } from "@/lib/id";

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("pages_public_id_uq").on(t.publicId),
    index("pages_org_active_idx").on(t.organizationId).where(sql`${t.deletedAt} is null`),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
```

- [ ] **Step 2: Export it from the barrel**

Edit `src/db/schema/index.ts`:
```typescript
export * from "./auth";
export * from "./pages";
```

- [ ] **Step 3: Generate + apply the migration**

```bash
pnpm db:generate && pnpm db:migrate
```
Expected: a new migration creates `pages` with the unique index on `public_id` and the partial index on `organization_id`.

- [ ] **Step 4: Verify the table shape**

Run:
```bash
pnpm exec tsx -e "import('./src/db/index.ts').then(async ({db}) => { const r = await db.execute(\"select column_name from information_schema.columns where table_name='pages' order by 1\"); console.log((r.rows ?? r).map(x=>x.column_name).join(', ')); })"
```
Expected: `content_hash, content_html, created_at, created_by, deleted_at, id, organization_id, public_id, size_bytes, title, updated_at, view_count`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/pages.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add pages table with multi-tenant fks and uuidv7 pk"
```

---

### Task 6: Personal-org provisioning (TDD)

**Files:**
- Create: `src/lib/org.ts`, `src/lib/org.test.ts`
- Modify: `src/lib/auth.ts` (wire the hook)

**Interfaces:**
- Consumes: `db`, `organization`, `member` (from schema), `uuidv7`.
- Produces:
  - `provisionPersonalOrg(userId: string, displayName: string): Promise<string>` — creates one `organization` + one owner `member`, returns the org id. Idempotent-safe to call once per user (called from the signup hook).

- [ ] **Step 1: Write the failing integration test**

> Runs against the `.env` `DATABASE_URL` (use a Neon dev branch). Inserts a throwaway user, provisions, asserts, cleans up.

```typescript
// src/lib/org.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, organization, member } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { provisionPersonalOrg } from "./org";

let createdUserId: string | null = null;

afterEach(async () => {
  if (createdUserId) {
    await db.delete(member).where(eq(member.userId, createdUserId));
    await db.delete(organization).where(eq(organization.name, `T ${createdUserId}'s workspace`));
    await db.delete(user).where(eq(user.id, createdUserId));
    createdUserId = null;
  }
});

describe("provisionPersonalOrg", () => {
  it("creates one org and one owner membership for the user", async () => {
    const uid = uuidv7();
    createdUserId = uid;
    await db.insert(user).values({
      id: uid, name: `T ${uid}`, email: `${uid}@t.local`,
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    });

    const orgId = await provisionPersonalOrg(uid, `T ${uid}`);

    const orgs = await db.select().from(organization).where(eq(organization.id, orgId));
    const members = await db.select().from(member).where(eq(member.userId, uid));
    expect(orgs).toHaveLength(1);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(members[0].organizationId).toBe(orgId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/org.test.ts`
Expected: FAIL — `provisionPersonalOrg` not exported.

- [ ] **Step 3: Implement `src/lib/org.ts`**

```typescript
import { db } from "@/db";
import { organization, member } from "@/db/schema";
import { uuidv7, publicId } from "@/lib/id";

/**
 * Create a user's personal organization + owner membership.
 * Called once from the signup hook. Slug is unique via a random suffix.
 */
export async function provisionPersonalOrg(
  userId: string,
  displayName: string,
): Promise<string> {
  const orgId = uuidv7();
  await db.insert(organization).values({
    id: orgId,
    name: `${displayName}'s workspace`,
    slug: `u-${publicId().toLowerCase()}`,
    createdAt: new Date(),
  });
  await db.insert(member).values({
    id: uuidv7(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  return orgId;
}
```
> If Task 4's generated `organization`/`member` columns differ (e.g. `created_at` nullable), adjust the `.values()` to match — the test will confirm.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/org.test.ts`
Expected: PASS (1 test), and no leftover rows (afterEach cleans up).

- [ ] **Step 5: Wire the hook into `src/lib/auth.ts`**

Add to the `betterAuth({...})` config (top level, alongside `plugins`):
```typescript
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const { provisionPersonalOrg } = await import("@/lib/org");
          await provisionPersonalOrg(createdUser.id, createdUser.name ?? createdUser.email);
        },
      },
    },
  },
```
> Dynamic `import` avoids a circular import between `auth.ts` and `org.ts` (org.ts imports `db`, auth.ts imports nothing from org at module load).

- [ ] **Step 6: Commit**

```bash
git add src/lib/org.ts src/lib/org.test.ts src/lib/auth.ts
git commit -m "feat: provision personal org and owner membership on signup"
```

---

### Task 7: Auth route, client, sign-in page, session helper

**Files:**
- Create: `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/app/(auth)/sign-in/page.tsx`

**Interfaces:**
- Consumes: `auth`.
- Produces:
  - Mounted auth endpoints at `/api/auth/*`.
  - `authClient` — browser client with `signIn.social`, org, and apiKey methods (used by the console in Plan 6).
  - `getSession()` — server helper returning the current session/user (used by API + console in later plans).

- [ ] **Step 1: Mount the Better Auth handler**

```typescript
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 2: Write the browser client**

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { organizationClient, apiKeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_ORIGIN,
  plugins: [organizationClient(), apiKeyClient()],
});
```
> Add `NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000` to `.env` / `.env.example` (client-visible copy of `APP_ORIGIN`).

- [ ] **Step 3: Write the server session helper**

```typescript
// src/lib/session.ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
```

- [ ] **Step 4: Write the sign-in page**

```tsx
// src/app/(auth)/sign-in/page.tsx
"use client";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const signIn = (provider: "github" | "google") =>
    authClient.signIn.social({ provider, callbackURL: "/pages" });

  return (
    <main style={{ maxWidth: 320, margin: "10vh auto", display: "grid", gap: 12 }}>
      <h1>Sign in to Kiosk</h1>
      <button onClick={() => signIn("github")}>Continue with GitHub</button>
      <button onClick={() => signIn("google")}>Continue with Google</button>
    </main>
  );
}
```
> `/pages` (the console) is built in Plan 6; the callback will 404 until then — that is expected at this stage.

- [ ] **Step 5: Verify OAuth end-to-end (manual integration)**

Prereqs (infra): create GitHub + Google OAuth apps with callback `http://localhost:3000/api/auth/callback/github` and `.../google`; put the four client id/secret values in `.env`.
Run: `pnpm dev`, open `http://localhost:3000/sign-in`, click "Continue with GitHub", complete OAuth.
Expected: redirected back (to `/pages`, which 404s — fine). Then verify the row + provisioning:
```bash
pnpm exec tsx -e "import('./src/db/index.ts').then(async ({db}) => { const {user,organization,member}=await import('./src/db/schema'); console.log('users', (await db.select().from(user)).length, 'orgs', (await db.select().from(organization)).length, 'members', (await db.select().from(member)).length); })"
```
Expected: `users 1 orgs 1 members 1` — proving the signup hook provisioned a personal org.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth src/app/\(auth\) src/lib/auth-client.ts src/lib/session.ts
git commit -m "feat: mount auth handler, add client, session helper, and sign-in page"
```

---

## Self-Review

**1. Spec coverage (Plan 1 scope = spec §1 stack, §3 data model, §4.1 login + §3.3 provisioning, §7.6 env):**
- Single Next.js app + Drizzle + Neon → Tasks 1–2. ✓
- Better Auth default text ids; `apikey` + `organization` plugins → Task 4. ✓
- `pages` table with uuidv7 pk, `public_id`, multi-tenant FKs, `view_count`, soft delete → Tasks 3, 5. ✓
- OAuth GitHub + Google → Tasks 4, 7. ✓
- Personal-org provisioning on signup → Task 6. ✓
- Host-only `__Host-` cookies → Task 4 (`advanced.cookiePrefix` + `useSecureCookies`). ✓
- Env prerequisites (`APP_ORIGIN`/`SERVE_ORIGIN`/`DATABASE_URL`/`BETTER_AUTH_SECRET`/OAuth) → Task 1. ✓
- Deferred (correctly not here): API/token issuance UI (Plan 2/6), serving+CSP (Plan 3), CLI (Plan 4), skill (Plan 5), console+i18n+view-count increment (Plan 6).

**2. Placeholder scan:** No "TBD/TODO/handle appropriately". Two "verify against generated schema" notes (Tasks 4→6) are real verification steps, not placeholders — the generated `auth.ts` is inspected in Task 4 Step 5 before Task 6 relies on its columns.

**3. Type consistency:** `uuidv7()`/`publicId()` (Task 3) reused verbatim in Tasks 5–6. `provisionPersonalOrg(userId, displayName)` defined Task 6 Step 3, called with the same signature in the Task 6 hook (Step 5). `auth` (Task 4) consumed by Task 7. `db` (Task 2) consumed by Tasks 4–6. FK columns are `text` on both sides (auth text ids ↔ `pages.organization_id`/`created_by` `text`). ✓

**Known execution-time checks (flagged, not placeholders):**
- Better Auth CLI output path/flags (Task 4 Step 2) — confirm the generated `auth.ts` compiles and exports the eight tables before Task 5.
- `organization`/`member` insert columns (Task 6 Step 3) — the integration test (Step 4) is the gate; adjust `.values()` if the generated columns differ.
