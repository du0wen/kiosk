import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /healthz", () => {
  it("returns cheap non-cacheable liveness metadata without dependency details", async () => {
    const previous = process.env.KIOSK_RELEASE_ID;
    process.env.KIOSK_RELEASE_ID = "test-release";
    try {
      const response = await GET();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body).toEqual({ status: "ok", release: "test-release" });
      expect(JSON.stringify(body)).not.toMatch(/database|storage|render|secret|token/i);
    } finally {
      if (previous === undefined) delete process.env.KIOSK_RELEASE_ID;
      else process.env.KIOSK_RELEASE_ID = previous;
    }
  });
});
