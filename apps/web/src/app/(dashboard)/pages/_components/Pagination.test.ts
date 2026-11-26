// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => createElement("a", { href, ...p }, children as never) }));
import { Pagination } from "./Pagination";
import type { PageListParams } from "../_lib/list-params";

const t = (k: string) => k;
const base: PageListParams = { q: "report", visibility: "public", owner: "all", sort: "views_desc", page: 1 };
afterEach(cleanup);

describe("Pagination", () => {
  it("renders nothing when there are no results", () => {
    const { container } = render(createElement(Pagination, { params: { ...base, q: "", visibility: "all", sort: "updated_desc" }, total: 0, t }));
    expect(container.textContent).toBe("");
  });
  it("disables Previous on the first page and links Next with filters preserved", () => {
    render(createElement(Pagination, { params: base, total: 83, t }));
    const prev = screen.getByText("previous");
    expect(prev.tagName.toLowerCase()).toBe("span");
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    const next = screen.getByText("next");
    expect(next.tagName.toLowerCase()).toBe("a");
    expect(next.getAttribute("href")).toBe("/pages?q=report&visibility=public&sort=views_desc&page=2");
  });
  it("disables Next on the last page", () => {
    render(createElement(Pagination, { params: { ...base, page: 4 }, total: 83, t }));
    expect(screen.getByText("next").tagName.toLowerCase()).toBe("span");
    expect(screen.getByText("previous").tagName.toLowerCase()).toBe("a");
    expect(screen.getByText("previous").getAttribute("href")).toBe("/pages?q=report&visibility=public&sort=views_desc&page=3");
  });
});
