# Kiosk P3 · Plan 1 — Main-app Export (MD/HTML + render passthrough) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a page to MD / HTML (local transforms) or PDF / PNG / JPEG (proxied to the render microservice), reachable from the REST API (token), the console (session), and the CLI.

**Architecture:** `src/lib/export.ts` owns the format logic: MD via `turndown`, HTML via the stored `content_html`, and PDF/PNG/JPEG via `renderRemote()` which POSTs the HTML to `RENDER_SERVICE_URL`. Two thin route handlers reuse it — `/api/v1/pages/:id/export` (Bearer token) and `/pages/:id/export` (console session) — plus a CLI `export` command. Unit tests mock the render call (`fetch`) — no Chromium in the app's test suite.

**Tech Stack:** `turndown` (HTML→MD), Next.js route handlers, Node `fetch`, Vitest.

> Spec: `docs/specs/2026-07-13-kiosk-p3-export-design.md`. Consumes P2 (`requireToken` role, `resolveActiveOrg`, `roleInOrg`, `getPage`), P2 pages service.

## Global Constraints

- Formats: `md | html | pdf | png | jpeg`. MD/HTML transform locally; PDF/PNG/JPEG proxy to the render service. The app **never** renders untrusted HTML in-process.
- Export is **member-gated** (token or session; page must belong to caller's org). Sync response; file as `Content-Disposition: attachment`.
- Render call: `POST ${RENDER_SERVICE_URL}/render` with header `x-render-secret: ${RENDER_SHARED_SECRET}`, body `{ html, format }` → binary. Non-2xx → map to 502; network/timeout → 504.
- No watermark, no `org_settings`, no async queue (spec §8).
- Commits carry **no AI attribution**.

---

### Task 1: `export.ts` service (MD/HTML local, PDF/PNG/JPEG via render)

**Files:**
- Create: `src/lib/export.ts`, `src/lib/export.test.ts`
- Modify: `package.json` (add `turndown`)

**Interfaces:**
- Produces:
  - `type ExportFormat = "md" | "html" | "pdf" | "png" | "jpeg"`
  - `isExportFormat(v: string): v is ExportFormat`
  - `toMarkdown(html: string): string`
  - `exportFilename(page: { publicId: string; title: string | null }, ext: string): string`
  - `exportPage(page: { publicId: string; title: string | null; contentHtml: string }, format: ExportFormat): Promise<{ body: Buffer | string; contentType: string; ext: string }>`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add turndown && pnpm add -D @types/turndown`

- [ ] **Step 2: Write the failing test `src/lib/export.test.ts`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { toMarkdown, isExportFormat, exportFilename, exportPage } from "./export";

afterEach(() => vi.unstubAllGlobals());

const page = { publicId: "abc123XYZ789", title: "My Page!", contentHtml: "<h1>Hi</h1><p>Yo</p>" };

describe("toMarkdown", () => {
  it("converts headings and paragraphs", () => {
    const md = toMarkdown("<h1>Title</h1><p>Body</p>");
    expect(md).toContain("# Title");
    expect(md).toContain("Body");
  });
});

describe("isExportFormat", () => {
  it("accepts known formats, rejects others", () => {
    expect(isExportFormat("pdf")).toBe(true);
    expect(isExportFormat("docx")).toBe(false);
  });
});

describe("exportFilename", () => {
  it("slugifies the title", () => {
    expect(exportFilename(page, "pdf")).toBe("my-page.pdf");
  });
  it("falls back to publicId", () => {
    expect(exportFilename({ publicId: "abc", title: null }, "md")).toBe("abc.md");
  });
});

describe("exportPage", () => {
  it("md → markdown locally", async () => {
    const r = await exportPage(page, "md");
    expect(r.contentType).toBe("text/markdown; charset=utf-8");
    expect(r.ext).toBe("md");
    expect(String(r.body)).toContain("# Hi");
  });
  it("html → raw content locally", async () => {
    const r = await exportPage(page, "html");
    expect(r.contentType).toBe("text/html; charset=utf-8");
    expect(r.body).toBe(page.contentHtml);
  });
  it("pdf → posts html to the render service and returns its bytes", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await exportPage(page, "pdf");
    expect(r.contentType).toBe("application/pdf");
    expect(r.ext).toBe("pdf");
    expect(Buffer.isBuffer(r.body)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain("/render");
    expect(init.headers["x-render-secret"]).toBeDefined();
    expect(JSON.parse(init.body as string)).toMatchObject({ format: "pdf", html: page.contentHtml });
  });
  it("maps a render-service failure to a 502-able error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(exportPage(page, "png")).rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm exec vitest run src/lib/export.test.ts` → module missing.

- [ ] **Step 4: Implement `src/lib/export.ts`**

```typescript
import TurndownService from "turndown";

export type ExportFormat = "md" | "html" | "pdf" | "png" | "jpeg";

const FORMATS: ExportFormat[] = ["md", "html", "pdf", "png", "jpeg"];
export function isExportFormat(v: string): v is ExportFormat {
  return (FORMATS as string[]).includes(v);
}

const RENDERED = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg" } as const;

export class ExportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export function toMarkdown(html: string): string {
  return new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }).turndown(html);
}

export function exportFilename(
  page: { publicId: string; title: string | null },
  ext: string,
): string {
  const slug = (page.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || page.publicId}.${ext}`;
}

/** POST the HTML to the render microservice; return the rendered bytes. */
async function renderRemote(html: string, format: "pdf" | "png" | "jpeg"): Promise<Buffer> {
  const base = process.env.RENDER_SERVICE_URL;
  if (!base) throw new ExportError(502, "Render service not configured");
  let res: Response;
  try {
    res = await fetch(`${base}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-render-secret": process.env.RENDER_SHARED_SECRET ?? "",
      },
      body: JSON.stringify({ html, format }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new ExportError(timedOut ? 504 : 502, "Render service unreachable");
  }
  if (!res.ok) throw new ExportError(502, `Render service error: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function exportPage(
  page: { publicId: string; title: string | null; contentHtml: string },
  format: ExportFormat,
): Promise<{ body: Buffer | string; contentType: string; ext: string }> {
  if (format === "md") {
    return { body: toMarkdown(page.contentHtml), contentType: "text/markdown; charset=utf-8", ext: "md" };
  }
  if (format === "html") {
    return { body: page.contentHtml, contentType: "text/html; charset=utf-8", ext: "html" };
  }
  const body = await renderRemote(page.contentHtml, format);
  return { body, contentType: RENDERED[format], ext: format };
}
```

- [ ] **Step 5: Run to verify it passes** — expect all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts package.json pnpm-lock.yaml
git commit -m "feat: export service — md/html local, pdf/png/jpeg via render service"
```

---

### Task 2: REST export endpoint (Bearer token)

**Files:**
- Create: `src/app/api/v1/pages/[id]/export/route.ts`, `src/app/api/v1/pages/[id]/export/route.test.ts`

**Interfaces:**
- Consumes: `requireToken` (P2), `getPage`, `exportPage`/`isExportFormat`/`exportFilename`/`ExportError`.
- Produces: `GET /api/v1/pages/:id/export?format=` → file (attachment) or `{error}`.

- [ ] **Step 1: Write the failing test `.../export/route.test.ts`**

```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { GET } from "./route";
import { createPrincipal, cleanupPrincipal } from "@/test/factories";
import { createPage } from "@/lib/pages";

let principal: { userId: string; organizationId: string; token: string } | null = null;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (principal) { await cleanupPrincipal(principal); principal = null; }
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (t: string, id: string, fmt: string) =>
  new Request(`http://localhost/api/v1/pages/${id}/export?format=${fmt}`, {
    headers: { authorization: `Bearer ${t}` },
  });

describe("GET /api/v1/pages/[id]/export", () => {
  it("401 without a token", async () => {
    const res = await GET(new Request("http://x/api/v1/pages/z/export?format=md"), ctx("z"));
    expect(res.status).toBe(401);
  });
  it("400 for an unknown format", async () => {
    principal = await createPrincipal();
    const p = await createPage({ organizationId: principal.organizationId, userId: principal.userId, html: "<h1>x</h1>" });
    const res = await GET(req(principal.token, p.publicId, "docx"), ctx(p.publicId));
    expect(res.status).toBe(400);
  });
  it("404 for a page in another org", async () => {
    principal = await createPrincipal();
    const other = await createPrincipal();
    try {
      const p = await createPage({ organizationId: other.organizationId, userId: other.userId, html: "<h1>x</h1>" });
      const res = await GET(req(principal.token, p.publicId, "md"), ctx(p.publicId));
      expect(res.status).toBe(404);
    } finally { await cleanupPrincipal(other); }
  });
  it("md → 200 markdown attachment", async () => {
    principal = await createPrincipal();
    const p = await createPage({ organizationId: principal.organizationId, userId: principal.userId, html: "<h1>Hello</h1>" });
    const res = await GET(req(principal.token, p.publicId, "md"), ctx(p.publicId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(await res.text()).toContain("# Hello");
  });
  it("pdf → streams render bytes (render mocked)", async () => {
    principal = await createPrincipal();
    const p = await createPage({ organizationId: principal.organizationId, userId: principal.userId, html: "<h1>x</h1>" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    const res = await GET(req(principal.token, p.publicId, "pdf"), ctx(p.publicId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `src/app/api/v1/pages/[id]/export/route.ts`**

```typescript
import { requireToken, errorResponse, ApiError } from "@/lib/api";
import { getPage } from "@/lib/pages";
import { exportPage, isExportFormat, exportFilename, ExportError } from "@/lib/export";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  try {
    const { organizationId } = await requireToken(req);
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "";
    if (!isExportFormat(format)) {
      throw new ApiError(400, "bad_request", "format must be md|html|pdf|png|jpeg");
    }
    const page = await getPage({ publicId: id, organizationId });
    if (!page) throw new ApiError(404, "not_found", "Page not found");
    try {
      const { body, contentType, ext } = await exportPage(page, format);
      return new Response(body as BodyInit, {
        status: 200,
        headers: {
          "content-type": contentType,
          "content-disposition": `attachment; filename="${exportFilename(page, ext)}"`,
        },
      });
    } catch (e) {
      if (e instanceof ExportError) throw new ApiError(e.status, "export_failed", e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/pages/"[id]"/export
git commit -m "feat: GET /api/v1/pages/:id/export (token-gated, all formats)"
```

---

### Task 3: console export route + dropdown + CLI + gate

**Files:**
- Create: `src/app/(console)/pages/[id]/export/route.ts`
- Modify: `src/app/(console)/pages/page.tsx` (Export links), `cli/src/client.ts` (`exportPage`), `cli/src/cli.ts` (`export` command + USAGE)

**Interfaces:**
- Consumes: `getSession`, `resolveActiveOrg` (session→org), `getPage`, `exportPage`/`isExportFormat`/`exportFilename`/`ExportError`; CLI: `KioskClient.exportFile(id, format) => Promise<{ data: Buffer; filename: string }>`.

- [ ] **Step 1: Console export route `src/app/(console)/pages/[id]/export/route.ts`** (session-gated; mirrors the API route but auth via session)

```typescript
import { getSession } from "@/lib/session";
import { resolveActiveOrg } from "@/lib/console";
import { getPage } from "@/lib/pages";
import { exportPage, isExportFormat, exportFilename, ExportError } from "@/lib/export";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const org = await resolveActiveOrg(session);
  if (!org) return new Response("No organization", { status: 403 });
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "";
  if (!isExportFormat(format)) return new Response("Bad format", { status: 400 });
  const page = await getPage({ publicId: id, organizationId: org });
  if (!page) return new Response("Not found", { status: 404 });
  try {
    const { body, contentType, ext } = await exportPage(page, format);
    return new Response(body as BodyInit, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${exportFilename(page, ext)}"`,
      },
    });
  } catch (e) {
    const status = e instanceof ExportError ? e.status : 500;
    return new Response("Export failed", { status });
  }
}
```

- [ ] **Step 2: Export dropdown in `src/app/(console)/pages/page.tsx`**

In the per-page action row, add a native disclosure with links to the console export route:
```tsx
                  <details style={{ display: "inline-block" }}>
                    <summary style={{ cursor: "pointer", listStyle: "none" }}>
                      <span style={{ border: "1px solid #8883", borderRadius: 6, padding: "2px 8px" }}>
                        {t("export")} ▾
                      </span>
                    </summary>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {["md", "html", "pdf", "png", "jpeg"].map((f) => (
                        <a key={f} href={`/pages/${p.publicId}/export?format=${f}`}>{f}</a>
                      ))}
                    </div>
                  </details>
```
Add the `export` string to `messages/en.json` (`"export": "Export"`) and `messages/zh.json` (`"export": "导出"`) under the `pages` namespace.

- [ ] **Step 3: CLI client `exportFile` in `cli/src/client.ts`**

```typescript
  async exportFile(id: string, format: string): Promise<{ data: Buffer; filename: string }> {
    const res = await fetch(`${this.apiBase}/pages/${id}/export?format=${format}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        message = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? message;
      } catch {}
      throw new CliError(message, res.status === 401 ? 2 : 1);
    }
    const dispo = res.headers.get("content-disposition") ?? "";
    const m = dispo.match(/filename="([^"]+)"/);
    return { data: Buffer.from(await res.arrayBuffer()), filename: m?.[1] ?? `${id}.${format}` };
  }
```

- [ ] **Step 4: CLI `export` command in `cli/src/cli.ts`**

Add a case + USAGE line `export <id>          Export a page (--format md|html|pdf|png|jpeg, -o file)`:
```typescript
      case "export": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: { format: { type: "string" }, o: { type: "string" } },
        });
        const id = positionals[0];
        const format = values.format ?? "pdf";
        if (!id) throw new CliError("Usage: kiosk export <id> --format <fmt> [-o file]");
        const { apiBase, token } = requireToken();
        const { data, filename } = await new KioskClient(apiBase, token).exportFile(id, format);
        if (values.o) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(values.o, data);
          process.stdout.write(`Saved ${values.o}\n`);
        } else if (format === "md" || format === "html") {
          process.stdout.write(data.toString("utf8"));
        } else {
          throw new CliError(`Binary format ${format} needs -o <file>`);
        }
        return 0;
      }
```

- [ ] **Step 5: Full gate**

Run: `pnpm test && pnpm build && pnpm exec tsc -p cli/tsconfig.json --noEmit && pnpm -C cli build`
Expected: all pass; routes include `/api/v1/pages/[id]/export` and `/pages/[id]/export`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(console)/pages" cli/src messages
git commit -m "feat: console export dropdown + session export route + CLI export command"
```

---

## Self-Review

**1. Spec coverage (§1,5,6):** md/html local + pdf/png/jpeg via render service (Task 1); token API + console session route + CLI (Task 2/3); member-gated (token org / session active-org); sync attachment; render failures → 502/504 (`ExportError`). No watermark/org_settings/async (honored). ✓

**2. Placeholder scan:** none — all steps carry full code + commands.

**3. Type consistency:** `ExportFormat`/`exportPage(page, format)`/`exportFilename(page, ext)`/`isExportFormat`/`ExportError.status` used identically across service, both routes, and tests; render call shape (`POST /render`, `x-render-secret`, `{html, format}`) matches the P3-2 microservice contract in the spec; `KioskClient.exportFile → {data, filename}` matches the CLI command.
