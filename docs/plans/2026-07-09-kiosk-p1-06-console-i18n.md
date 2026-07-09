# Kiosk P1 · Plan 6 — Console + i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimal-functional web console — page list, API-token management, report form, minimal platform-admin unpublish — with next-intl (EN/ZH) i18n.

**Architecture:** The console is authenticated by the **Better Auth session** (not an API token), so pages/actions resolve `{ userId, organizationId }` from the session + membership and call the service layer (`pages.ts`, `token.ts`) directly. i18n uses next-intl **without URL locale prefixes** (locale from a cookie, defaulting via `Accept-Language`). UI is intentionally plain (inline styles, like the sign-in page).

**Tech Stack:** Next.js App Router (server components + server actions), next-intl, Drizzle/Neon, Vitest.

> Plan **6 of 6** (final). Consumes Plan 1 (`getSession`, `member`), Plan 2 (`pages.ts`), Plan 4b (`createToken`). Adds session-org + token-management + admin services.

## Global Constraints

- Console auth = **session** (Better Auth). Every page/action resolves org via `resolveUserOrg(session.user.id)`; unauthenticated → redirect to `/sign-in?callback=…`.
- Routes: `/` (→ `/pages` if signed in, else `/sign-in`), `/pages`, `/settings/tokens`, `/settings`, `/report`.
- **i18n:** next-intl, **EN + ZH** (EN default), **no URL locale prefix**; locale from a `locale` cookie, first-visit default from `Accept-Language`; a switcher sets the cookie. Covers the console UI only. (User-profile persistence deferred; cookie is enough for MVP.)
- Pages produced **only** by the CLI/API; the console does not create/edit HTML — it manages + links.
- Platform admin (unpublish any page) is gated by an **env allowlist** (`KIOSK_ADMIN_EMAILS`), distinct from org roles.
- Commits carry **no AI attribution**.
- **Manually verified (needs a session/OAuth + a browser):** the rendered pages and actions. Automated tests cover `resolveUserOrg`, token list/revoke, admin check, and en/zh key parity.

---

## File Structure

- `src/lib/console.ts` — `resolveUserOrg(userId)`, `requireSession()` (getSession or redirect), `isAdminEmail(email)`.
- `src/lib/token.ts` — **append** `listTokens(orgId)`, `revokeToken(id, orgId)`.
- `src/lib/pages.ts` — reused (`listPages`, `updateTitle`?, `softDeletePage`); **append** `renameTitle(publicId, orgId, title)`.
- `src/lib/admin.ts` — `adminUnpublish(publicId)` (no org scope; platform admin only).
- `src/i18n/request.ts` — next-intl request config (cookie + Accept-Language).
- `src/i18n/locale.ts` — `getLocaleCookie()`, `setLocaleAction(locale)` (server action).
- `messages/en.json`, `messages/zh.json` — console strings.
- `next.config.ts` — **modify** to wrap with `createNextIntlPlugin`.
- `src/app/layout.tsx` — **modify** to provide locale + `NextIntlClientProvider`.
- Console pages: `src/app/page.tsx` (modify → redirect), `src/app/(console)/pages/page.tsx`, `src/app/(console)/settings/tokens/page.tsx`, `src/app/(console)/settings/page.tsx`, `src/app/report/page.tsx`.
- `src/app/_components/LocaleSwitcher.tsx`, `src/app/_components/CopyButton.tsx`.
- Tests: `src/lib/console.test.ts`, `src/lib/token.console.test.ts`, `src/i18n/messages.test.ts`, `src/lib/admin.test.ts`.

---

### Task 1: Session-org + token management + rename services

**Files:**
- Create: `src/lib/console.ts`, `src/lib/console.test.ts`, `src/lib/token.console.test.ts`
- Modify: `src/lib/token.ts` (append `listTokens`, `revokeToken`), `src/lib/pages.ts` (append `renameTitle`)

**Interfaces:**
- Produces:
  - `resolveUserOrg(userId: string): Promise<string | null>`.
  - `isAdminEmail(email: string | null | undefined): boolean` (reads `KIOSK_ADMIN_EMAILS`, comma-separated).
  - `listTokens(organizationId): Promise<{ id, name, tokenPrefix, lastUsedAt, createdAt, revokedAt }[]>`.
  - `revokeToken(id, organizationId): Promise<boolean>`.
  - `renameTitle(publicId, organizationId, title): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/console.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest";
import { resolveUserOrg, isAdminEmail } from "./console";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("resolveUserOrg", () => {
  it("returns the user's org", async () => {
    principal = await createPrincipal();
    expect(await resolveUserOrg(principal.userId)).toBe(principal.organizationId);
  });
  it("returns null for an unknown user", async () => {
    expect(await resolveUserOrg("nobody")).toBeNull();
  });
});

describe("isAdminEmail", () => {
  it("matches the KIOSK_ADMIN_EMAILS allowlist", () => {
    const prev = process.env.KIOSK_ADMIN_EMAILS;
    process.env.KIOSK_ADMIN_EMAILS = "a@x.com, b@y.com";
    expect(isAdminEmail("b@y.com")).toBe(true);
    expect(isAdminEmail("c@z.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    process.env.KIOSK_ADMIN_EMAILS = prev;
  });
});
```

`src/lib/token.console.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest";
import { createToken, listTokens, revokeToken, verifyToken } from "./token";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("listTokens + revokeToken", () => {
  it("lists org tokens and revokes one (which then fails verification)", async () => {
    principal = await createPrincipal();
    const { id, plaintext } = await createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "second",
    });
    const list = await listTokens(principal.organizationId);
    expect(list.some((t) => t.id === id)).toBe(true);
    expect(list.every((t) => !("tokenHash" in t))).toBe(true); // never expose the hash

    expect(await revokeToken(id, principal.organizationId)).toBe(true);
    expect(await verifyToken(plaintext)).toBeNull();
  });
  it("does not revoke a token from another org", async () => {
    principal = await createPrincipal();
    const { id } = await createToken({
      userId: principal.userId,
      organizationId: principal.organizationId,
      name: "x",
    });
    expect(await revokeToken(id, "other-org")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/console.test.ts src/lib/token.console.test.ts`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement `src/lib/console.ts`**

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";

/** The user's organization id (P1: single membership), or null. */
export async function resolveUserOrg(userId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return m?.organizationId ?? null;
}

/** Platform admins are configured via the KIOSK_ADMIN_EMAILS env allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.KIOSK_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
```

- [ ] **Step 4: Append to `src/lib/token.ts`**

```typescript
/** List an org's tokens (never returns the hash). */
export async function listTokens(organizationId: string) {
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db
    .select({
      id: apiToken.id,
      name: apiToken.name,
      tokenPrefix: apiToken.tokenPrefix,
      lastUsedAt: apiToken.lastUsedAt,
      createdAt: apiToken.createdAt,
      revokedAt: apiToken.revokedAt,
    })
    .from(apiToken)
    .where(eq(apiToken.organizationId, organizationId))
    .orderBy(desc(apiToken.createdAt));
}

/** Revoke a token owned by the org. Returns false if not found / not owned. */
export async function revokeToken(id: string, organizationId: string): Promise<boolean> {
  const { db } = await import("@/db");
  const { apiToken } = await import("@/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");
  const [row] = await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiToken.id, id),
        eq(apiToken.organizationId, organizationId),
        isNull(apiToken.revokedAt),
      ),
    )
    .returning({ id: apiToken.id });
  return !!row;
}
```

- [ ] **Step 5: Append `renameTitle` to `src/lib/pages.ts`**

```typescript
export async function renameTitle(
  publicId: string,
  organizationId: string,
  title: string,
): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(pages.publicId, publicId),
        eq(pages.organizationId, organizationId),
        isNull(pages.deletedAt),
      ),
    )
    .returning({ id: pages.id });
  return !!row;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/console.test.ts src/lib/token.console.test.ts`
Expected: PASS (console 3, token.console 2).

- [ ] **Step 7: Commit**

```bash
git add src/lib/console.ts src/lib/console.test.ts src/lib/token.ts src/lib/token.console.test.ts src/lib/pages.ts
git commit -m "feat: console services (resolveUserOrg, token list/revoke, rename, admin check)"
```

---

### Task 2: i18n (next-intl, no URL prefix)

**Files:**
- Create: `src/i18n/request.ts`, `src/i18n/locale.ts`, `messages/en.json`, `messages/zh.json`, `src/i18n/messages.test.ts`
- Modify: `next.config.ts`, `src/app/layout.tsx`

**Interfaces:**
- Produces: a working `useTranslations`/`getTranslations` with locale from the `locale` cookie (default via `Accept-Language`); `setLocaleAction(locale)`.

- [ ] **Step 1: Install next-intl**

Run: `pnpm add next-intl`
Expected: added to dependencies. (Retry on network flakiness with `--prefer-offline`.)

- [ ] **Step 2: Write `messages/en.json` and `messages/zh.json`**

`messages/en.json`:
```json
{
  "nav": { "pages": "Pages", "tokens": "API Tokens", "settings": "Settings", "signOut": "Sign out" },
  "pages": {
    "title": "Your pages",
    "empty": "No pages yet. Install the CLI, run `kiosk login`, `kiosk install-skill`, then publish from your AI tool.",
    "copy": "Copy link", "copied": "Copied", "open": "Open", "rename": "Rename", "delete": "Delete",
    "views": "views", "updated": "Updated", "confirmDelete": "Delete this page? The public link will stop working."
  },
  "tokens": {
    "title": "API Tokens", "create": "Create token", "name": "Name", "created": "Created",
    "lastUsed": "Last used", "revoke": "Revoke", "revoked": "revoked", "never": "never",
    "shownOnce": "Copy this token now — it is shown only once."
  },
  "report": { "title": "Report a page", "url": "Page URL", "reason": "Reason", "submit": "Submit", "thanks": "Thanks — we'll review it." }
}
```
`messages/zh.json`:
```json
{
  "nav": { "pages": "页面", "tokens": "API 令牌", "settings": "设置", "signOut": "退出登录" },
  "pages": {
    "title": "你的页面",
    "empty": "还没有页面。安装 CLI,运行 `kiosk login`、`kiosk install-skill`,然后在 AI 工具里发布。",
    "copy": "复制链接", "copied": "已复制", "open": "打开", "rename": "重命名", "delete": "删除",
    "views": "次浏览", "updated": "更新于", "confirmDelete": "删除此页?公开链接将失效。"
  },
  "tokens": {
    "title": "API 令牌", "create": "新建令牌", "name": "名称", "created": "创建于",
    "lastUsed": "最后使用", "revoke": "撤销", "revoked": "已撤销", "never": "从未",
    "shownOnce": "立即复制此令牌——只显示这一次。"
  },
  "report": { "title": "举报页面", "url": "页面 URL", "reason": "原因", "submit": "提交", "thanks": "谢谢,我们会核查。" }
}
```

- [ ] **Step 3: Write the failing test `src/i18n/messages.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("i18n messages", () => {
  it("en and zh have identical key sets", () => {
    expect(keys(zh).sort()).toEqual(keys(en).sort());
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `pnpm exec vitest run src/i18n/messages.test.ts`
Expected: initially FAIL if a key is mismatched; fix messages until PASS. (With the files above it should PASS immediately — the test guards future drift.)

- [ ] **Step 5: Write `src/i18n/request.ts`**

```typescript
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED = ["en", "zh"] as const;
type Locale = (typeof SUPPORTED)[number];

function pick(value: string | undefined | null): Locale {
  if (value && SUPPORTED.includes(value as Locale)) return value as Locale;
  return "en";
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("locale")?.value;
  let locale = pick(cookieLocale);
  if (!cookieLocale) {
    const al = (await headers()).get("accept-language") ?? "";
    if (al.toLowerCase().includes("zh")) locale = "zh";
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 6: Write `src/i18n/locale.ts`**

```typescript
"use server";
import { cookies } from "next/headers";

export async function setLocaleAction(locale: "en" | "zh"): Promise<void> {
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
```

- [ ] **Step 7: Wrap `next.config.ts` with the plugin**

Replace `next.config.ts` with:
```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 8: Provide the locale in `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiosk",
  description: "Publish AI-generated HTML to a public shareable link",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Build gate + commit**

```bash
pnpm build
git add src/i18n messages next.config.ts src/app/layout.tsx
git commit -m "feat: next-intl (EN/ZH) with cookie locale + Accept-Language default"
```
Expected: build clean; en/zh key-parity test passes.

---

### Task 3: Console pages

**Files:**
- Create: `src/app/_components/LocaleSwitcher.tsx`, `src/app/_components/CopyButton.tsx`, `src/app/(console)/pages/page.tsx`, `src/app/(console)/settings/tokens/page.tsx`, `src/app/(console)/settings/page.tsx`, `src/app/report/page.tsx`
- Modify: `src/app/page.tsx` (redirect)

**Interfaces:**
- Consumes: `getSession`, `resolveUserOrg`, `listPages`/`renameTitle`/`softDeletePage`/`pageUrl` (Plan 2/6), `createToken`/`listTokens`/`revokeToken`, i18n.
- Produces: the rendered console (verified by build + manual smoke).

- [ ] **Step 1: `src/app/page.tsx` — redirect on session**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/pages" : "/sign-in");
}
```

- [ ] **Step 2: `src/app/_components/CopyButton.tsx`**

```tsx
"use client";
import { useState } from "react";

export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? copiedLabel : label}
    </button>
  );
}
```

- [ ] **Step 3: `src/app/_components/LocaleSwitcher.tsx`**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/i18n/locale";

export function LocaleSwitcher() {
  const router = useRouter();
  return (
    <select
      defaultValue=""
      onChange={async (e) => {
        await setLocaleAction(e.target.value as "en" | "zh");
        router.refresh();
      }}
      aria-label="Language"
    >
      <option value="" disabled>🌐</option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
}
```

- [ ] **Step 4: `src/app/(console)/pages/page.tsx`** (list + actions)

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveUserOrg } from "@/lib/console";
import { listPages, renameTitle, softDeletePage, pageUrl } from "@/lib/pages";
import { LocaleSwitcher } from "@/app/_components/LocaleSwitcher";
import { CopyButton } from "@/app/_components/CopyButton";

export default async function PagesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/pages");
  const org = await resolveUserOrg(session.user.id);
  if (!org) redirect("/sign-in");
  const t = await getTranslations("pages");
  const { items } = await listPages({ organizationId: org });

  async function rename(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveUserOrg(s.user.id));
    if (!o) return;
    await renameTitle(String(formData.get("id")), o, String(formData.get("title")));
    revalidatePath("/pages");
  }
  async function remove(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveUserOrg(s.user.id));
    if (!o) return;
    await softDeletePage({ publicId: String(formData.get("id")), organizationId: o });
    revalidatePath("/pages");
  }

  return (
    <main style={{ maxWidth: 820, margin: "4vh auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("title")}</h1>
        <LocaleSwitcher />
      </header>
      {items.length === 0 ? (
        <p style={{ opacity: 0.7 }}>{t("empty")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {items.map((p) => {
            const url = pageUrl(p.publicId);
            return (
              <li key={p.publicId} style={{ border: "1px solid #8883", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{p.title ?? p.publicId}</strong>
                  <span style={{ opacity: 0.6 }}>{p.viewCount} {t("views")}</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  <a href={url} target="_blank" rel="noreferrer">{url}</a> · {t("updated")} {new Date(p.updatedAt).toLocaleString()}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <CopyButton text={url} label={t("copy")} copiedLabel={t("copied")} />
                  <a href={url} target="_blank" rel="noreferrer"><button>{t("open")}</button></a>
                  <form action={rename} style={{ display: "inline-flex", gap: 4 }}>
                    <input type="hidden" name="id" value={p.publicId} />
                    <input name="title" defaultValue={p.title ?? ""} placeholder={t("rename")} />
                    <button type="submit">{t("rename")}</button>
                  </form>
                  <form action={remove}>
                    <input type="hidden" name="id" value={p.publicId} />
                    <button type="submit">{t("delete")}</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: `src/app/(console)/settings/tokens/page.tsx`** (create/list/revoke)

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { resolveUserOrg } from "@/lib/console";
import { createToken, listTokens, revokeToken } from "@/lib/token";
import { CopyButton } from "@/app/_components/CopyButton";

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings/tokens");
  const org = await resolveUserOrg(session.user.id);
  if (!org) redirect("/sign-in");
  const t = await getTranslations("tokens");
  const { created } = await searchParams;
  const tokens = await listTokens(org);

  async function create(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveUserOrg(s.user.id));
    if (!o) return;
    const { plaintext } = await createToken({
      userId: s!.user.id,
      organizationId: o,
      name: String(formData.get("name") || "token"),
    });
    // Show the plaintext once via a query param (cleared on next load).
    redirect(`/settings/tokens?created=${encodeURIComponent(plaintext)}`);
  }
  async function revoke(formData: FormData) {
    "use server";
    const s = await getSession();
    const o = s && (await resolveUserOrg(s.user.id));
    if (!o) return;
    await revokeToken(String(formData.get("id")), o);
    revalidatePath("/settings/tokens");
  }

  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16 }}>
      <h1>{t("title")}</h1>
      {created && (
        <p style={{ padding: 12, border: "1px solid #8883", borderRadius: 8 }}>
          <code>{created}</code>
          <br />
          <small>{t("shownOnce")}</small>{" "}
          <CopyButton text={created} label={t("create")} copiedLabel="✓" />
        </p>
      )}
      <form action={create} style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input name="name" placeholder={t("name")} />
        <button type="submit">{t("create")}</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {tokens.map((tk) => (
          <li key={tk.id} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #8883", borderRadius: 8, padding: 10 }}>
            <span>
              <strong>{tk.name}</strong> <code>{tk.tokenPrefix}…</code>
              {tk.revokedAt ? ` (${t("revoked")})` : ""}
            </span>
            {!tk.revokedAt && (
              <form action={revoke}>
                <input type="hidden" name="id" value={tk.id} />
                <button type="submit">{t("revoke")}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: `src/app/(console)/settings/page.tsx`** (minimal account)

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LocaleSwitcher } from "@/app/_components/LocaleSwitcher";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callback=/settings");
  return (
    <main style={{ maxWidth: 720, margin: "4vh auto", padding: 16, display: "grid", gap: 12 }}>
      <h1>Settings</h1>
      <p>{session.user.email}</p>
      <div><LocaleSwitcher /></div>
      <p><a href="/settings/tokens">API Tokens</a> · <a href="/pages">Pages</a></p>
    </main>
  );
}
```

- [ ] **Step 7: `src/app/report/page.tsx`** (report form)

```tsx
import { getTranslations } from "next-intl/server";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; sent?: string }>;
}) {
  const t = await getTranslations("report");
  const { id, sent } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    // MVP: log the report; a triage queue/table is a follow-up.
    console.warn("ABUSE REPORT", {
      url: formData.get("url"),
      reason: formData.get("reason"),
    });
    const { redirect } = await import("next/navigation");
    redirect("/report?sent=1");
  }

  return (
    <main style={{ maxWidth: 520, margin: "8vh auto", padding: 16, display: "grid", gap: 12 }}>
      <h1>{t("title")}</h1>
      {sent ? (
        <p>{t("thanks")}</p>
      ) : (
        <form action={submit} style={{ display: "grid", gap: 8 }}>
          <input name="url" placeholder={t("url")} defaultValue={id ? `/p/${id}` : ""} required />
          <textarea name="reason" placeholder={t("reason")} required />
          <button type="submit">{t("submit")}</button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Build gate + commit**

```bash
pnpm build
git add src/app
git commit -m "feat: console pages (list, tokens, settings, report) with i18n"
```
Expected: build lists `/pages`, `/settings/tokens`, `/settings`, `/report`; clean.

---

### Task 4: Platform-admin unpublish + final gate

**Files:**
- Create: `src/lib/admin.ts`, `src/lib/admin.test.ts`, `src/app/api/admin/unpublish/route.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdminEmail` (Task 1), `db`/`pages`.
- Produces: `adminUnpublish(publicId): Promise<boolean>` (no org scope); `POST /api/admin/unpublish` (session + admin gated).

- [ ] **Step 1: Write the failing test `src/lib/admin.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { adminUnpublish } from "./admin";
import { createPage, getPublicPage } from "@/lib/pages";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

describe("adminUnpublish", () => {
  it("soft-deletes any page regardless of org", async () => {
    principal = await createPrincipal();
    const page = await createPage({
      organizationId: principal.organizationId,
      userId: principal.userId,
      html: "<html><title>x</title></html>",
    });
    expect(await adminUnpublish(page.publicId)).toBe(true);
    expect(await getPublicPage(page.publicId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/admin.test.ts`
Expected: FAIL — `Cannot find module './admin'`.

- [ ] **Step 3: Implement `src/lib/admin.ts`**

```typescript
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";

/** Platform-admin unpublish: soft-delete ANY active page (no org scope). */
export async function adminUnpublish(publicId: string): Promise<boolean> {
  const [row] = await db
    .update(pages)
    .set({ deletedAt: new Date() })
    .where(and(eq(pages.publicId, publicId), isNull(pages.deletedAt)))
    .returning({ id: pages.id });
  return !!row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/admin.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Implement `src/app/api/admin/unpublish/route.ts`**

```typescript
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/console";
import { adminUnpublish } from "@/lib/admin";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    return Response.json({ error: { code: "forbidden", message: "Admins only" } }, { status: 403 });
  }
  const { publicId } = (await req.json().catch(() => ({}))) as { publicId?: string };
  if (!publicId) {
    return Response.json({ error: { code: "bad_request", message: "Missing publicId" } }, { status: 400 });
  }
  const ok = await adminUnpublish(publicId);
  return Response.json({ ok });
}
```

- [ ] **Step 6: Final full gate**

Run: `pnpm test && pnpm build`
Expected: all vitest files pass (app + cli); build lists every route incl. `/pages`, `/settings/tokens`, `/report`, `/api/admin/unpublish`, `ƒ Middleware`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin.ts src/lib/admin.test.ts src/app/api/admin/unpublish/route.ts
git commit -m "feat: platform-admin unpublish (env allowlist)"
```

---

## Self-Review

**1. Spec coverage (§6 console, §6.4 views, §6.5 i18n, §5.5 admin):**
- Routes `/`, `/pages`, `/settings/tokens`, `/settings`, `/report` → Task 3. ✓
- Page list: copy link / open / rename / delete / view count / empty-state onboarding → Task 3 (services from Task 1/Plan 2). ✓
- Token mgmt: create (shown once) / list / revoke → Tasks 1, 3. ✓
- i18n next-intl EN/ZH, cookie + Accept-Language, no URL prefix, console-only → Task 2 (+ key-parity test). ✓
- Session-auth (not token) + org resolution → Task 1 `resolveUserOrg`. ✓
- Platform admin unpublish via env allowlist → Tasks 1, 4. ✓
- **Manually verified (flagged):** rendered pages + server actions (need a session/OAuth). Automated: services + i18n keys + admin.
- **Gaps (intentional):** user-profile locale persistence (cookie is enough for MVP); report triage table (MVP logs); token `lastUsed` display formatting (minimal).

**2. Placeholder scan:** none — complete code + commands. "MVP logs the report" is an explicit MVP choice, not a placeholder.

**3. Type consistency:** `resolveUserOrg(userId) → string | null` used in every console page + action. `listTokens → {…}[]` (no hash) consumed in the tokens page. `renameTitle`/`softDeletePage`/`listPages`/`pageUrl` reused from Plan 2 with matching signatures. `adminUnpublish(publicId) → boolean` used by the admin route. `setLocaleAction("en"|"zh")` used by `LocaleSwitcher`. i18n namespaces (`pages`/`tokens`/`report`/`nav`) match `messages/*.json`.
