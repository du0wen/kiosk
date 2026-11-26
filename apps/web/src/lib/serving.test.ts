import { describe, it, expect } from "vitest";
import { SERVE_CSP, servedPageHeaders, routeForHost } from "./serving";

describe("SERVE_CSP", () => {
  it("blocks external network and framing sources", () => {
    expect(SERVE_CSP).toContain("default-src 'none'");
    expect(SERVE_CSP).toContain("connect-src 'none'");
    expect(SERVE_CSP).toContain("form-action 'none'");
    expect(SERVE_CSP).toContain("script-src 'unsafe-inline'");
  });
});

describe("servedPageHeaders", () => {
  it("sets noindex + hardening and is embeddable (no X-Frame-Options)", () => {
    const h = servedPageHeaders({ visibility: "public", contentHash: "a".repeat(64) });
    expect(h["content-type"]).toContain("text/html");
    expect(h["content-security-policy"]).toBe(SERVE_CSP);
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-frame-options"]).toBeUndefined();
    expect(h["etag"]).toBe(`"sha256-${"a".repeat(64)}"`);
    expect(h["cache-control"]).toContain("public");
    expect(h["cache-control"]).toContain("must-revalidate");
  });

  it("never permits shared caching for organization pages or errors", () => {
    expect(servedPageHeaders({ visibility: "org", contentHash: "b".repeat(64) })["cache-control"]).toBe("private, no-store");
    expect(servedPageHeaders({ visibility: "public", contentHash: "b".repeat(64), error: true })["cache-control"]).toBe("private, no-store");
  });
});

describe("routeForHost", () => {
  const serveOrigin = "https://serve.example.com";
  const call = (host: string, pathname: string) =>
    routeForHost({ host, pathname, serveOrigin });

  it("serve host: allows /p/*", () => {
    expect(call("serve.example.com", "/p/abc").type).toBe("next");
  });
  it("serve host: 404s app/api paths", () => {
    expect(call("serve.example.com", "/api/v1/pages").type).toBe("notFound");
    expect(call("serve.example.com", "/pages").type).toBe("notFound");
  });
  it("app host: redirects /p/* to the serve origin", () => {
    const d = call("app.example.com", "/p/abc");
    expect(d).toEqual({ type: "redirect", url: "https://serve.example.com/p/abc" });
  });
  it("app host: passes normal app paths", () => {
    expect(call("app.example.com", "/pages").type).toBe("next");
  });
});
