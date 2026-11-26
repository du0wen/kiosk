// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { PageDetailSummary } from "./PageDetailSummary";
import type { PageDetail } from "../_lib/page-detail";

const detail: PageDetail = {
  publicId: "abc123def456", title: "Report", visibility: "public",
  ownerName: "Alice", ownerEmail: "alice@x.com", createdBy: "u1",
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"),
  sizeBytes: 1536, viewCount: 42, versionCount: 3, recentVersions: [],
};
afterEach(cleanup);

describe("PageDetailSummary", () => {
  it("shows public id, share url, size, views and version count", () => {
    const { container } = render(createElement(PageDetailSummary, {
      detail, shareUrl: "https://app.example/v/abc123def456", ownerLabel: "Alice",
      t: (k: string) => k, formatDate: (d: Date) => d.toISOString(), formatNumber: (n: number) => String(n),
    }));
    const text = container.textContent ?? "";
    expect(text).toContain("abc123def456");
    expect(text).toContain("https://app.example/v/abc123def456");
    expect(text).toContain("1.5 KB");
    expect(text).toContain("42");
    expect(text).toContain("3");
  });
});
