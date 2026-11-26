import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createRenderServer } from "./server.mjs";
import { closeBrowser } from "./render.mjs";

process.env.RENDER_SHARED_SECRET = "test-secret";
let server, base;
before(async () => {
  server = createRenderServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await closeBrowser();
});

const post = (headers, body) =>
  fetch(`${base}/render`, { method: "POST", headers, body });

test("401 without the shared secret", async () => {
  const res = await post(
    { "content-type": "application/json" },
    JSON.stringify({ html: "<h1>x</h1>", format: "pdf" }),
  );
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

test("GET /healthz requires shared secret and returns status ok", async () => {
  const unauth = await fetch(`${base}/healthz`);
  assert.equal(unauth.status, 401);

  const auth = await fetch(`${base}/healthz`, {
    headers: { "x-render-secret": "test-secret" },
  });
  assert.equal(auth.status, 200);
  const data = await auth.json();
  assert.equal(data.status, "ok");
});

test("503 when concurrency limit is exceeded", async () => {
  process.env.MAX_CONCURRENT_RENDERS = "1";
  const limitedServer = createRenderServer();
  await new Promise((r) => limitedServer.listen(0, r));
  const limitedBase = `http://127.0.0.1:${limitedServer.address().port}`;

  try {
    // Fire two requests concurrently
    const p1 = fetch(`${limitedBase}/render`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-render-secret": "test-secret" },
      body: JSON.stringify({ html: "<h1>Test 1</h1>", format: "png" }),
    });
    const p2 = fetch(`${limitedBase}/render`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-render-secret": "test-secret" },
      body: JSON.stringify({ html: "<h1>Test 2</h1>", format: "png" }),
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    const statuses = [r1.status, r2.status];
    // One must succeed (200) and the other must be rejected with 503
    assert.ok(statuses.includes(200));
    assert.ok(statuses.includes(503));
  } finally {
    limitedServer.close();
    delete process.env.MAX_CONCURRENT_RENDERS;
  }
});
