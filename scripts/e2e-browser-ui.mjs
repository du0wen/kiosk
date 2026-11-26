import { chromium } from "../render/node_modules/playwright/index.mjs";

const BASE_URL = "http://localhost:58671";

async function runBrowserE2E() {
  console.log("=============================================================");
  console.log("       Kiosk Headless Browser UI E2E Verification            ");
  console.log("=============================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Verify Sign-In Page UI & Elements
    console.log("\n[UI Check 1] Navigating to Sign-In page...");
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "networkidle" });
    const heading = await page.textContent("h1");
    console.log(`✓ Sign-in page heading: "${heading?.trim()}"`);
    if (!heading?.includes("Sign in to Kiosk")) {
      throw new Error(`Unexpected sign-in heading: ${heading}`);
    }

    const buttons = await page.$$eval("button", (elements) =>
      elements.map((el) => el.textContent?.trim()),
    );
    console.log(`✓ Auth provider buttons detected: ${buttons.join(", ")}`);
    if (!buttons.some((b) => b?.includes("GitHub")) || !buttons.some((b) => b?.includes("Google"))) {
      throw new Error("Missing expected OAuth login buttons");
    }

    // 2. Verify Report Page UI & Form
    console.log("\n[UI Check 2] Navigating to Abuse Report page...");
    await page.goto(`${BASE_URL}/report?id=test1234`, { waitUntil: "networkidle" });
    const reportTitle = await page.textContent("h1");
    console.log(`✓ Report page heading: "${reportTitle?.trim()}"`);
    if (!reportTitle?.includes("Report")) {
      throw new Error(`Unexpected report page heading: ${reportTitle}`);
    }

    const hasUrlInput = await page.$('input[name="url"]');
    const hasReasonTextarea = await page.$('textarea[name="reason"]');
    const hasSubmitButton = await page.$('button[type="submit"]');

    if (!hasUrlInput || !hasReasonTextarea || !hasSubmitButton) {
      throw new Error("Abuse report form elements missing");
    }
    console.log("✓ Report page form fields and submit action verified.");

    // 3. Verify Healthz Liveness
    console.log("\n[UI Check 3] Navigating to Healthz endpoint...");
    const healthzRes = await page.goto(`${BASE_URL}/healthz`);
    if (healthzRes?.status() !== 200) {
      throw new Error(`Healthz returned status ${healthzRes?.status()}`);
    }
    const healthzBody = await page.textContent("body");
    console.log(`✓ Healthz response: ${healthzBody?.trim()}`);

    console.log("\n=============================================================");
    console.log("      🎉 ALL HEADLESS BROWSER UI VERIFICATIONS PASSED!       ");
    console.log("=============================================================");
  } finally {
    await context.close();
    await browser.close();
  }
}

runBrowserE2E().catch((err) => {
  console.error("❌ Headless Browser E2E Failed:", err);
  process.exit(1);
});
