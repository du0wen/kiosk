import { test, after } from "node:test";
import assert from "node:assert/strict";
import { renderHtml, closeBrowser } from "./render.mjs";

after(async () => {
  await closeBrowser();
});

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
  // External <img>/<script> must be aborted, not fetched; render still succeeds.
  const buf = await renderHtml(
    `<img src="http://169.254.169.254/latest/meta-data"><script src="https://evil.example/x.js"></script><h1>ok</h1>`,
    "pdf",
  );
  assert.equal(buf.subarray(0, 4).toString("latin1"), "%PDF");
});
