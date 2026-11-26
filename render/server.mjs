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
  const maxConcurrent = Math.max(1, Number(process.env.MAX_CONCURRENT_RENDERS ?? 4));
  let activeRenders = 0;

  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      if ((req.headers["x-render-secret"] ?? "") !== secret) {
        return end(res, 401, "unauthorized");
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "ok" }));
    }
    if (req.method !== "POST" || !req.url?.startsWith("/render")) {
      return end(res, 404, "not found");
    }
    if ((req.headers["x-render-secret"] ?? "") !== secret) {
      return end(res, 401, "unauthorized");
    }
    let body = "";
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX + 65536) {
        aborted = true;
        end(res, 413, "too large");
        req.destroy();
      } else {
        body += c;
      }
    });
    req.on("end", async () => {
      if (aborted) return;
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return end(res, 400, "bad json");
      }
      const { html, format, watermark, watermarkMode, watermarkOpacity } = parsed ?? {};
      if (typeof html !== "string" || !TYPES[format]) {
        return end(res, 400, "bad request");
      }
      if (Buffer.byteLength(html, "utf8") > MAX) return end(res, 413, "too large");

      if (activeRenders >= maxConcurrent) {
        return end(res, 503, "render saturated");
      }

      activeRenders++;
      try {
        const timeoutMs = Math.max(1000, Number(process.env.RENDER_TIMEOUT_MS ?? 15000));
        const buf = await Promise.race([
          renderHtml(html, format, typeof watermark === "string" ? watermark : undefined, {
            watermarkMode,
            watermarkOpacity,
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
        ]);
        res.writeHead(200, { "content-type": TYPES[format] });
        res.end(buf);
      } catch (e) {
        console.error("Render execution error:", e);
        end(res, e?.message === "timeout" ? 504 : 500, "render failed");
      } finally {
        activeRenders--;
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  createRenderServer().listen(port, () =>
    console.log(`render service on :${port}`),
  );
}
