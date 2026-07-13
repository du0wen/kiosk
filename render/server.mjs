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
      const { html, format, watermark } = parsed ?? {};
      if (typeof html !== "string" || !TYPES[format]) {
        return end(res, 400, "bad request");
      }
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
  createRenderServer().listen(port, () =>
    console.log(`render service on :${port}`),
  );
}
