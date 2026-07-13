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
