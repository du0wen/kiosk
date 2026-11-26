import "dotenv/config";
import http from "node:http";
import { createPrincipal, cleanupPrincipal } from "../apps/web/src/test/factories";
import { signServeToken } from "../apps/web/src/lib/serve-token";

const APP_BASE = process.env.APP_ORIGIN ?? "http://localhost:58671";
const SERVE_ORIGIN = process.env.SERVE_ORIGIN ?? "http://serve.kiosk.test:58671";
const SERVE_HOST = new URL(SERVE_ORIGIN).host;
const RENDER_BASE = process.env.RENDER_SERVICE_URL ?? "http://localhost:58672";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

function requestServe(
  path: string,
  options: http.RequestOptions = {},
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${APP_BASE}${path}`,
      {
        ...options,
        headers: {
          ...options.headers,
          host: SERVE_HOST,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  console.log("=============================================================");
  console.log("       Kiosk Isolated End-to-End (E2E) Verification          ");
  console.log("=============================================================");

  // 1. Precondition checks
  console.log("\n[Phase 1] Checking Preconditions & Live Services...");
  const healthApp = await fetch(`${APP_BASE}/healthz`).then((r) => r.json());
  assert(healthApp.status === "ok", "App health check must be ok");

  const healthRender = await fetch(`${RENDER_BASE}/healthz`, {
    headers: { "x-render-secret": "dev-render-secret-change-me" },
  }).then((r) => r.json());
  assert(healthRender.status === "ok", "Render health check must be ok");

  console.log("✓ Live services confirmed: Web (App) and Render (Chromium) are active.");

  // 2. Provision two isolated principals (Tenant Alpha & Tenant Beta)
  console.log("\n[Phase 2] Provisioning Isolated Multi-Tenant Principals...");
  const alice = await createPrincipal();
  const bob = await createPrincipal();
  console.log(`✓ Tenant Alice: org=${alice.organizationId}, user=${alice.userId}`);
  console.log(`✓ Tenant Bob:   org=${bob.organizationId}, user=${bob.userId}`);

  try {
    // 3. Alice publishes an HTML artifact (Default Org-Private)
    console.log("\n[Phase 3] Testing Page Publication (Default Org-Private)...");
    const initialHtml = `<!DOCTYPE html><html><head><title>E2E Isolated Artifact</title><style>body{font-family:sans-serif;padding:2rem;background:#f0fdf4;}button{background:#15803d;color:#fff;padding:.5rem 1rem;border:none;border-radius:4px;cursor:pointer;}</style></head><body><h1>Isolated E2E Verification</h1><p>Counter: <span id="cnt">0</span></p><button id="btn" onclick="document.getElementById('cnt').innerText=Number(document.getElementById('cnt').innerText)+1">Increment</button></body></html>`;

    const publishRes = await fetch(`${APP_BASE}/api/v1/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${alice.token}`,
        "Content-Type": "text/html",
      },
      body: initialHtml,
    });

    assert(publishRes.status === 201, `Publish failed with status ${publishRes.status}`);
    const pageData = await publishRes.json();
    assert(typeof pageData.id === "string" && pageData.id.length > 0, "Page id must be present");
    assert(pageData.visibility === "org", "Default visibility must be 'org'");
    assert(typeof pageData.url === "string", "Shell url must be present");
    assert(typeof pageData.rawUrl === "string", "Raw url must be present");

    const pageId = pageData.id;
    console.log(`✓ Artifact published: id=${pageId}`);
    console.log(`  - Shell URL: ${pageData.url}`);
    console.log(`  - Raw URL:   ${pageData.rawUrl}`);

    // 4. Test Two-Origin Isolation & Serving Security Gates
    console.log("\n[Phase 4] Testing Double-Origin Isolation & Security Gates...");

    // 4a. Requesting /p/:id from APP_ORIGIN must redirect (302) to SERVE_ORIGIN
    const appRawBounceRes = await fetch(`${APP_BASE}/p/${pageId}`, { redirect: "manual" });
    assert(appRawBounceRes.status === 302, `App origin must 302 redirect /p/*, got ${appRawBounceRes.status}`);
    const bounceLocation = appRawBounceRes.headers.get("location");
    assert(bounceLocation?.startsWith(SERVE_ORIGIN), `Redirect must target SERVE_ORIGIN (${SERVE_ORIGIN})`);
    console.log(`✓ Double-Origin Guard: APP_ORIGIN /p/* redirects to SERVE_ORIGIN (${bounceLocation})`);

    // 4b. Requesting /p/:id on SERVE_ORIGIN without a token -> 302 to /serve-auth
    const unauthServeRes = await requestServe(`/p/${pageId}`);
    assert(unauthServeRes.status === 302, `Unauthenticated serve access must redirect 302, got ${unauthServeRes.status}`);
    const serveAuthLoc = unauthServeRes.headers.location;
    assert(serveAuthLoc?.includes("/serve-auth"), `Redirect must point to /serve-auth, got ${serveAuthLoc}`);
    console.log(`✓ Token Gate: Unauthenticated request redirected to ${serveAuthLoc}`);

    // 4c. Bob (Tenant B) attempts cross-tenant access using Bob's signed token
    const bobToken = signServeToken(bob.organizationId, bob.userId);
    const bobCrossRes = await requestServe(`/p/${pageId}?k=${encodeURIComponent(bobToken)}`);
    assert(bobCrossRes.status === 302, `Cross-tenant token must be rejected with 302, got ${bobCrossRes.status}`);
    console.log("✓ Multi-Tenant Isolation: Cross-tenant token was rejected by serve gate");

    // 4d. Alice accesses with valid, legitimate Serve-Token
    const aliceToken = signServeToken(alice.organizationId, alice.userId);
    const aliceValidRes = await requestServe(`/p/${pageId}?k=${encodeURIComponent(aliceToken)}`);
    assert(aliceValidRes.status === 200, `Legitimate token access failed with status ${aliceValidRes.status}`);
    assert(aliceValidRes.body.includes("Isolated E2E Verification"), "Returned HTML must contain published content");

    // Verify Strict CSP
    const csp = aliceValidRes.headers["content-security-policy"] as string | undefined;
    assert(csp !== undefined, "CSP header must be present on served page");
    assert(csp.includes("default-src 'none'"), "CSP must enforce default-src 'none'");
    assert(csp.includes("script-src 'unsafe-inline'"), "CSP must allow inline scripts");
    console.log("✓ Authorized Access: 200 OK with strict air-gapped CSP headers verified");

    // 5. Test Visibility Toggle to Public
    console.log("\n[Phase 5] Testing Page Visibility Toggle (org -> public)...");
    const patchRes = await fetch(`${APP_BASE}/api/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${alice.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visibility: "public" }),
    });
    assert(patchRes.status === 200, `Patch visibility failed with status ${patchRes.status}`);
    const patchData = await patchRes.json();
    assert(patchData.visibility === "public", "Visibility must be 'public'");

    // Anonymous guest access without token must now succeed with 200
    const guestRes = await requestServe(`/p/${pageId}`);
    assert(guestRes.status === 200, `Guest public access failed with status ${guestRes.status}`);
    assert(guestRes.body.includes("Isolated E2E Verification"), "Public content must match");
    console.log("✓ Public Visibility: Anonymous guest access confirmed (200 OK without token)");

    // 6. Test Format Export Pipeline (HTML, Markdown, PDF, PNG)
    console.log("\n[Phase 6] Testing Format Export Pipeline (HTML, MD, PDF, PNG)...");

    // 6a. HTML Export
    const expHtml = await fetch(`${APP_BASE}/api/v1/pages/${pageId}/export?format=html`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(expHtml.status === 200, `Export HTML failed: ${expHtml.status}`);
    assert((await expHtml.text()).includes("Isolated E2E Verification"), "Export HTML matches");
    console.log("✓ Export format=html succeeded");

    // 6b. Markdown Export (Turndown)
    const expMd = await fetch(`${APP_BASE}/api/v1/pages/${pageId}/export?format=md`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(expMd.status === 200, `Export MD failed: ${expMd.status}`);
    assert((await expMd.text()).includes("Isolated E2E Verification"), "Export MD matches");
    console.log("✓ Export format=md succeeded (Markdown converted cleanly)");

    // 6c. PDF Export (via isolated Playwright Chromium container)
    const expPdf = await fetch(`${APP_BASE}/api/v1/pages/${pageId}/export?format=pdf`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(expPdf.status === 200, `Export PDF failed: ${expPdf.status}`);
    const pdfBuf = Buffer.from(await expPdf.arrayBuffer());
    assert(pdfBuf.toString("utf8", 0, 4) === "%PDF", "PDF binary header %PDF verified");
    console.log(`✓ Export format=pdf succeeded (${pdfBuf.length} bytes, %PDF magic header verified)`);

    // 6d. PNG Export (via isolated Playwright Chromium container)
    const expPng = await fetch(`${APP_BASE}/api/v1/pages/${pageId}/export?format=png`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(expPng.status === 200, `Export PNG failed: ${expPng.status}`);
    const pngBuf = Buffer.from(await expPng.arrayBuffer());
    const isPng = pngBuf[0] === 0x89 && pngBuf[1] === 0x50 && pngBuf[2] === 0x4e && pngBuf[3] === 0x47;
    assert(isPng, "PNG binary header signature verified");
    console.log(`✓ Export format=png succeeded (${pngBuf.length} bytes, PNG signature verified)`);

    // 7. Test Anti-IDOR & Boundary Defense
    console.log("\n[Phase 7] Testing Anti-IDOR / Tenant Boundary Defense...");
    const idorPatch = await fetch(`${APP_BASE}/api/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${bob.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visibility: "org" }),
    });
    assert(idorPatch.status === 404 || idorPatch.status === 403, "Bob cannot modify Alice's page");

    const idorDelete = await fetch(`${APP_BASE}/api/v1/pages/${pageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    assert(idorDelete.status === 404 || idorDelete.status === 403, "Bob cannot delete Alice's page");
    console.log("✓ Anti-IDOR Defense: Cross-tenant modification/deletion strictly rejected");

    // 8. Test Same-URL Version Update
    console.log("\n[Phase 8] Testing Same-URL Version Update...");
    const updatedHtml = `<!DOCTYPE html><html><head><title>E2E Updated Artifact</title></head><body><h1>Version 2 Payload</h1></body></html>`;
    const updateRes = await fetch(`${APP_BASE}/api/v1/pages/${pageId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${alice.token}`,
        "Content-Type": "text/html",
      },
      body: updatedHtml,
    });
    assert(updateRes.status === 200, `Update failed with status ${updateRes.status}`);
    const updateData = await updateRes.json();
    assert(updateData.id === pageId, "Public ID must remain unchanged after update");

    const updatedServeRes = await requestServe(`/p/${pageId}`);
    assert(updatedServeRes.body.includes("Version 2 Payload"), "Served content must reflect Version 2");
    console.log(`✓ Same-URL Update: Page content updated to v2 with identical public ID (${pageId})`);

    // 9. Test Soft Delete
    console.log("\n[Phase 9] Testing Soft Delete & 404 Behavior...");
    const deleteRes = await fetch(`${APP_BASE}/api/v1/pages/${pageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(
      deleteRes.status === 204 || deleteRes.status === 200,
      `Delete failed with status ${deleteRes.status}`,
    );

    const verifyDel = await requestServe(`/p/${pageId}`);
    assert(verifyDel.status === 404, `Deleted page must return 404, got ${verifyDel.status}`);
    console.log("✓ Soft Delete: Page successfully deleted and returns 404");

    console.log("\n=============================================================");
    console.log("      🎉 ALL 9 ISOLATED E2E VERIFICATION PHASES PASSED!       ");
    console.log("=============================================================");
  } finally {
    // 10. Clean up test principals
    console.log("\n[Phase 10] Environment Cleanup & Teardown...");
    await cleanupPrincipal(alice);
    await cleanupPrincipal(bob);
    console.log("✓ Teardown complete: All temporary data safely removed. Zero residue.");
  }
}

run().catch((err) => {
  console.error("\n❌ E2E Execution Failed:", err);
  process.exit(1);
});
