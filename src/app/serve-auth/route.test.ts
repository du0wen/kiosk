import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /serve-auth", () => {
  it("redirects to sign-in when there is no session", async () => {
    const res = await GET(new Request("http://app.local/serve-auth?next=abc123"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/sign-in");
    expect(res.headers.get("location")).toContain("serve-auth");
  });
  it("400s without next", async () => {
    const res = await GET(new Request("http://app.local/serve-auth"));
    expect(res.status).toBe(400);
  });
});
