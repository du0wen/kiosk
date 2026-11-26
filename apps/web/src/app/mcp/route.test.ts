import { describe, expect, it } from "vitest";
import { DELETE, GET, OPTIONS } from "./route";

describe("/mcp method handling", () => {
  it("rejects legacy session GET and DELETE explicitly", async () => {
    for (const handler of [GET, DELETE]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    }
  });

  it("does not grant CORS without an Origin", async () => {
    const response = await OPTIONS(
      new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: { host: "localhost" },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});
