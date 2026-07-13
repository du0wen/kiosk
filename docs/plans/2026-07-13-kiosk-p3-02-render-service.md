# Kiosk P3 · Plan 2 — Render Microservice (`render/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone `render/` service that turns untrusted HTML into PDF/PNG/JPEG via Playwright/Chromium with network egress blocked — the producer side of the `/render` contract the main app already calls.

**Architecture:** A self-contained package under `render/` (own `package.json`/`Dockerfile`/deps; the app never imports it — only HTTP). `render.mjs` renders (shared browser, per-request context, all external requests aborted). `server.mjs` is a `node:http` wrapper: secret check + format/size guards → `renderHtml`. Deployed as its own container (Komodo); app points `RENDER_SERVICE_URL` at it. Chromium-dependent tests run inside `render/` (not the app's Neon suite).

**Tech Stack:** Node ESM (`node:http`), `playwright` (chromium), `node:test`, Docker (Playwright base image).

> Spec: `docs/specs/2026-07-13-kiosk-p3-export-design.md` §3; contract in `render/README.md`. Consumer: `src/lib/export.ts` `renderRemote` (already calls `POST /render {html, format, watermark?}` with `x-render-secret`).

## Global Constraints

- Contract (already consumed by the app — **don't change without updating `renderRemote` + README**): `POST /render`, header `x-render-secret`, body `{ html, format: "pdf"|"png"|"jpeg", watermark?, viewport? }` → binary (`application/pdf` | `image/png` | `image/jpeg`).
- **Egress blocked**: abort every `http(s)/file/ftp` request during render (SSRF/exfil); allow `data:`/`blob:`/`about:` (self-contained resources).
- Render timeout ~15s → 504; `html` > 2MB → 413; bad secret → 401; bad format/json → 400.
- Standalone package: `render/` has its **own** `package.json` + deps (Playwright/Chromium **must not** enter the main app build). App ↔ service only over HTTP.
- Commits carry **no AI attribution**.

---

### Task 1: `render/` package + `renderHtml`

**Files:**
- Create: `render/package.json`, `render/render.mjs`, `render/render.test.mjs`

**Interfaces:**
- Produces: `renderHtml(html: string, format: "pdf"|"png"|"jpeg", watermark?: string): Promise<Buffer>`; `closeBrowser(): Promise<void>`.

- [ ] **Step 1: `render/package.json`**

```json
{
  "name": "kiosk-render",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.mjs",
    "test": "node --test"
  },
  "dependencies": {
    "playwright": "^1.56.0"
  }
}
```
Then install browsers for local runs/tests:
```bash
cd render && pnpm install && pnpm exec playwright install chromium
```
> Pin `playwright` to whatever `pnpm install` resolves; the Dockerfile image tag (Task 2) must match this version.

- [ ] **Step 2: Write `render/render.test.mjs`** (integration — launches real Chromium)

```javascript
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { renderHtml, closeBrowser } from "./render.mjs";

after(async () => { await closeBrowser(); });

test("pdf: returns PDF bytes for self-contained html", async () => {
  const buf = await renderHtml("<h1>Hello</h1>", "pdf");
  assert.ok(buf.length > 0);
  assert.equal(buf.subarray(0, 4).toString("latin1"), "%PDF");
});

test("png: returns PNG bytes", async () => {
  const buf = await renderHtml("<h1>x</h1>", "png");
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG");
});

test("external subresources are blocked (no hang/throw)", async () => {
  // An external <img>/<script> must be aborted, not fetched; render still succeeds.
  const buf = await renderHtml(
    `<img src="http://169.254.169.254/latest/meta-data"><script src="https://evil.example/x.js"></script><h1>ok</h1>`,
    "pdf",
  );
  assert.equal(buf.subarray(0, 4).toString("latin1"), "%PDF");
});
```

- [ ] **Step 3: Run to verify it fails** — `cd render && node --test` → module missing.

- [ ] **Step 4: Implement `render/render.mjs`**

```javascript
import { chromium } from "playwright";

let browserPromise;
function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ["--no-sandbox"] });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = undefined;
    await b.close();
  }
}

async function addWatermark(page, text) {
  await page.evaluate((t) => {
    const el = document.createElement("div");
    el.textContent = t;
    el.setAttribute(
      "style",
      "position:fixed;bottom:8px;right:12px;font:12px sans-serif;color:rgba(0,0,0,.35);z-index:2147483647;pointer-events:none",
    );
    document.body.appendChild(el);
  }, text);
}

/** Render untrusted, self-contained HTML with all external network blocked. */
export async function renderHtml(html, format, watermark) {
  const b = await browser();
  const context = await b.newContext();
  try {
    const page = await context.newPage();
    // Block external network (SSRF/exfil); allow inline data:/blob:/about:.
    await page.route("**", (route) => {
      if (/^(https?|file|ftp):/i.test(route.request().url())) return route.abort();
      return route.continue();
    });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
    if (watermark) await addWatermark(page, watermark);
    if (format === "pdf") return await page.pdf({ printBackground: true });
    return await page.screenshot({
      type: format === "jpeg" ? "jpeg" : "png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
}
```

- [ ] **Step 5: Run to verify it passes** — `cd render && node --test` → 3 passing. (Requires `playwright install chromium` done.)

- [ ] **Step 6: Commit**

```bash
git add render/package.json render/render.mjs render/render.test.mjs
git commit -m "feat(render): renderHtml — network-blocked Playwright pdf/png/jpeg"
```

---

### Task 2: HTTP server + Dockerfile + wire

**Files:**
- Create: `render/server.mjs`, `render/server.test.mjs`, `render/Dockerfile`, `render/.dockerignore`
- Modify: `render/README.md` (placeholder → "implemented"), `.gitignore` (ignore `render/node_modules`, `render/test-results`)

**Interfaces:**
- Produces: `createRenderServer(): http.Server` (for tests); `POST /render` per the contract.

- [ ] **Step 1: Write `render/server.test.mjs`** (guard paths — no Chromium)

```javascript
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createRenderServer } from "./server.mjs";

process.env.RENDER_SHARED_SECRET = "test-secret";
let server, base;
before(async () => {
  server = createRenderServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (headers, body) =>
  fetch(`${base}/render`, { method: "POST", headers, body });

test("401 without the shared secret", async () => {
  const res = await post({ "content-type": "application/json" }, JSON.stringify({ html: "<h1>x</h1>", format: "pdf" }));
  assert.equal(res.status, 401);
});
test("400 for a bad format", async () => {
  const res = await post(
    { "content-type": "application/json", "x-render-secret": "test-secret" },
    JSON.stringify({ html: "<h1>x</h1>", format: "docx" }),
  );
  assert.equal(res.status, 400);
});
test("413 for oversize html", async () => {
  const res = await post(
    { "content-type": "application/json", "x-render-secret": "test-secret" },
    JSON.stringify({ html: "a".repeat(2 * 1024 * 1024 + 10), format: "pdf" }),
  );
  assert.equal(res.status, 413);
});
```

- [ ] **Step 2: Run to verify it fails** — `cd render && node --test server.test.mjs` → module missing.

- [ ] **Step 3: Implement `render/server.mjs`**

```javascript
import { createServer } from "node:http";
import { renderHtml } from "./render.mjs";

const MAX = 2 * 1024 * 1024;
const TYPES = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg" };

function end(res, status, msg) {
  res.writeHead(status, { "content-type": "text/plain" });
  res.end(msg);
}

export function createRenderServer() {
  const secret = process.env.RENDER_SHARED_SECRET ?? "";
  return createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/render")) return end(res, 404, "not found");
    if ((req.headers["x-render-secret"] ?? "") !== secret) return end(res, 401, "unauthorized");
    let body = "";
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX + 65536) { aborted = true; end(res, 413, "too large"); req.destroy(); }
      else body += c;
    });
    req.on("end", async () => {
      if (aborted) return;
      let parsed;
      try { parsed = JSON.parse(body); } catch { return end(res, 400, "bad json"); }
      const { html, format, watermark } = parsed ?? {};
      if (typeof html !== "string" || !TYPES[format]) return end(res, 400, "bad request");
      if (Buffer.byteLength(html, "utf8") > MAX) return end(res, 413, "too large");
      try {
        const buf = await Promise.race([
          renderHtml(html, format, typeof watermark === "string" ? watermark : undefined),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
        ]);
        res.writeHead(200, { "content-type": TYPES[format] });
        res.end(buf);
      } catch (e) {
        end(res, e?.message === "timeout" ? 504 : 500, "render failed");
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  createRenderServer().listen(port, () => console.log(`render service on :${port}`));
}
```

- [ ] **Step 4: Run to verify it passes** — `cd render && node --test server.test.mjs` → 3 passing (no Chromium needed for guards).

- [ ] **Step 5: `render/Dockerfile`** (image tag must match `playwright` version in package.json)

```dockerfile
FROM mcr.microsoft.com/playwright:v1.56.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY render.mjs server.mjs ./
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.mjs"]
```
`render/.dockerignore`:
```
node_modules
*.test.mjs
test-results
```

- [ ] **Step 6: `.gitignore` + README**

Add to root `.gitignore`: `/render/node_modules/` and `/render/test-results/`. Rewrite `render/README.md` header from "待实现" to "已实现" (keep the contract section; add: run `node --test` for tests, `docker build` + run with `RENDER_SHARED_SECRET`/`PORT`, point the app's `RENDER_SERVICE_URL` at it).

- [ ] **Step 7: Local end-to-end smoke** (needs `playwright install chromium` done)

```bash
cd render && RENDER_SHARED_SECRET=dev-render-secret-change-me PORT=4000 node server.mjs &
curl -s -o /tmp/out.pdf -X POST http://localhost:4000/render \
  -H 'content-type: application/json' -H 'x-render-secret: dev-render-secret-change-me' \
  -d '{"html":"<h1>hello</h1>","format":"pdf"}'
head -c4 /tmp/out.pdf   # → %PDF
```
Then with the app dev server up + `.env` `RENDER_SERVICE_URL=http://localhost:4000`: `kiosk export <id> --format pdf -o /tmp/p.pdf` → a real PDF.

- [ ] **Step 8: Commit**

```bash
git add render/server.mjs render/server.test.mjs render/Dockerfile render/.dockerignore render/README.md .gitignore
git commit -m "feat(render): http server + Dockerfile (standalone, deploy-independent)"
```

---

## Self-Review

**1. Spec coverage (§3):** standalone `render/` package (Task 1); `POST /render` + secret/format/size guards + timeout (Task 2); network egress blocked (Task 1 `page.route` abort); watermark overlay (Task 1 `addWatermark`, matches P4 passthrough); own Dockerfile → independent container deploy (Task 2); contract byte-for-byte matches `renderRemote`. Chromium tests isolated to `render/` (not the app suite). ✓

**2. Placeholder scan:** none. Playwright version alignment (package.json ↔ Dockerfile tag) is a concrete "match these" instruction.

**3. Type consistency:** `renderHtml(html, format, watermark?)` + `POST /render {html, format, watermark?}` match the app's `renderRemote` body (`{html, format, ...(watermark?{watermark}:{})}`) and `render/README.md`; response content-types (`application/pdf`/`image/png`/`image/jpeg`) match `export.ts` `RENDERED` map.
