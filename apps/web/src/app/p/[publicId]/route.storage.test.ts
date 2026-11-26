import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPageContent, incrementViewCount } = vi.hoisted(() => ({
  getPageContent: vi.fn(),
  incrementViewCount: vi.fn(),
}));

vi.mock("@/lib/pages", () => ({
  getPublicPage: vi.fn(async () => ({
    id: "00000000-0000-7000-8000-000000000001",
    publicId: "publicpage01",
    organizationId: "org-a",
    visibility: "public",
  })),
  getPageContent,
  incrementViewCount,
}));

import { GET } from "./route";

describe("GET /p/[publicId] storage failures", () => {
  beforeEach(() => {
    getPageContent.mockReset();
    incrementViewCount.mockReset();
    incrementViewCount.mockResolvedValue(undefined);
  });

  it("returns a controlled 503 with serving security headers", async () => {
    getPageContent.mockRejectedValueOnce(new Error("bucket secret endpoint"));
    const response = await GET(
      new Request("http://serve.kiosk.test/p/publicpage01"),
      { params: Promise.resolve({ publicId: "publicpage01" }) },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Page temporarily unavailable");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(incrementViewCount).toHaveBeenCalledOnce();
  });
});
