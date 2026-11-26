// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement("a", { href, ...p }, children as never) }));
import { RecentVersions } from "./RecentVersions";

const versions = Array.from({ length: 8 }, (_, i) => ({ id: String(i), createdAt: new Date("2026-01-01"), editor: `e${i}@x.com` }));
afterEach(cleanup);

describe("RecentVersions", () => {
  it("shows at most 5 versions", () => {
    const { container } = render(createElement(RecentVersions, { versions, publicId: "abc123", t: (k: string) => k, formatDate: () => "Jan 1" }));
    expect(container.querySelectorAll("li")).toHaveLength(5);
  });
  it("links to the full history page", () => {
    render(createElement(RecentVersions, { versions, publicId: "abc123", t: (k: string) => k, formatDate: () => "Jan 1" }));
    expect(screen.getByRole("link", { name: "viewAllVersions" }).getAttribute("href")).toBe("/pages/abc123/history");
  });
});
