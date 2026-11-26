// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k, useLocale: () => "en" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement("a", { href, ...p }, children as never) }));
import { PagesTable } from "./PagesTable";

const row = { publicId: "abc123def456", title: "My Report", visibility: "org", viewCount: 3, updatedAt: new Date("2026-01-01"), createdBy: "u1", ownerName: "Me", ownerEmail: "me@x.com" };
const noop = async () => ({ ok: true as const });
const props = { rows: [row], role: "owner" as const, currentUserId: "u1", t: (k: string) => k, formatDate: () => "Jan 1", unknown: "Unknown", renameAction: noop, deleteAction: noop, visibilityAction: noop };

afterEach(cleanup);

describe("PagesTable page name link", () => {
  it("links the page name to the detail route", () => {
    render(createElement(PagesTable, props));
    const link = screen.getByRole("link", { name: "My Report" });
    expect(link.getAttribute("href")).toBe("/pages/abc123def456");
  });
  it("does not wrap the whole row in a link", () => {
    const { container } = render(createElement(PagesTable, props));
    const tr = container.querySelector("tbody tr");
    expect(tr?.tagName.toLowerCase()).toBe("tr");
    expect(tr?.closest("a")).toBeNull();
  });
});
