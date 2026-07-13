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
