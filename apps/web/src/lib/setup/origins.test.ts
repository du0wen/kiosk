import { describe, expect, it } from "vitest";
import { resolveRequestOrigin, suggestServeOrigin } from "./origins";

describe("setup origin defaults", () => {
  it("resolves origin from x-forwarded-proto and x-forwarded-host when behind a reverse proxy", () => {
    const req = new Request("http://127.0.0.1:3000/api/setup/status", {
      headers: {
        "x-forwarded-proto": "https, http",
        "x-forwarded-host": "app.kiosk.example, internal.local",
      },
    });
    expect(resolveRequestOrigin(req)).toBe("https://app.kiosk.example");
  });

  it("falls back to request URL origin when proxy headers are absent or invalid", () => {
    const plain = new Request("http://localhost:58671/api/setup/status");
    expect(resolveRequestOrigin(plain)).toBe("http://localhost:58671");

    const bad = new Request("http://localhost:58671/api/setup/status", {
      headers: {
        "x-forwarded-proto": "javascript",
        "x-forwarded-host": "not a host",
      },
    });
    expect(resolveRequestOrigin(bad)).toBe("http://localhost:58671");
  });

  it("suggests 127.0.0.1 <-> localhost for local development and leaves public domains blank", () => {
    expect(suggestServeOrigin("http://localhost:58671")).toBe("http://127.0.0.1:58671");
    expect(suggestServeOrigin("http://localhost")).toBe("http://127.0.0.1");
    expect(suggestServeOrigin("http://127.0.0.1:3000")).toBe("http://localhost:3000");
    expect(suggestServeOrigin("https://app.kiosk.example")).toBe("");
    expect(suggestServeOrigin("http://192.168.1.10:3000")).toBe("");
  });
});
