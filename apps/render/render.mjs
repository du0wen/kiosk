import { chromium } from "playwright";

let browserPromise;
async function browser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (!b.isConnected()) {
        browserPromise = undefined;
      }
    } catch {
      browserPromise = undefined;
    }
  }
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ["--no-sandbox"] }).catch((err) => {
      browserPromise = undefined;
      throw err;
    });
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

async function addWatermark(page, text, options = {}) {
  const mode = options.watermarkMode === "fullpage" ? "fullpage" : "footer";
  const opacity = Number.isFinite(options.watermarkOpacity)
    ? Math.min(0.35, Math.max(0.02, options.watermarkOpacity))
    : 0.08;

  if (mode === "fullpage") {
    await page.evaluate(
      ({ t, op }) => {
        const escaped = t.replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
        );
        const width = Math.max(280, Math.min(520, escaped.length * 10 + 120));
        const height = 180;
        const svg =
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ` +
          `fill="rgba(15,23,42,${op})" font-family="sans-serif" font-size="14" font-weight="600" ` +
          `transform="rotate(-28 ${width / 2} ${height / 2})">${escaped}</text></svg>`;
        const el = document.createElement("div");
        el.setAttribute(
          "style",
          `position:fixed;inset:0;pointer-events:none;z-index:2147483647;background-repeat:repeat;background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        );
        document.body.appendChild(el);
      },
      { t: text, op: opacity },
    );
    return;
  }

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
export async function renderHtml(html, format, watermark, watermarkOptions = {}) {
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
    if (watermark) await addWatermark(page, watermark, watermarkOptions);
    if (format === "pdf") return await page.pdf({ printBackground: true });
    return await page.screenshot({
      type: format === "jpeg" ? "jpeg" : "png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
}
