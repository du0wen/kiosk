// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";

const push = vi.fn();
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { PagesToolbar } from "./PagesToolbar";
import type { PageListParams } from "../_lib/list-params";

const defaults: PageListParams = { q: "", visibility: "all", owner: "all", sort: "updated_desc", page: 3 };
const owners = [{ id: "u1", label: "Alice" }];
afterEach(() => { cleanup(); push.mockClear(); });

const openSelect = (labelRe: RegExp) => fireEvent.click(screen.getByRole("combobox", { name: labelRe }));
const pickOption = (name: string) => fireEvent.click(screen.getByRole("option", { name }));

describe("PagesToolbar", () => {
  it("renders the filters as custom listbox selects (no native <select>)", () => {
    const { container } = render(createElement(PagesToolbar, { params: defaults, owners }));
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByRole("combobox", { name: /filterVisibility/ }).getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("applies a visibility change and resets to page 1", () => {
    render(createElement(PagesToolbar, { params: defaults, owners }));
    openSelect(/filterVisibility/);
    pickOption("public");
    expect(push).toHaveBeenCalledWith("/pages?visibility=public");
  });

  it("submits the search query", () => {
    const { container } = render(createElement(PagesToolbar, { params: defaults, owners }));
    fireEvent.change(container.querySelector('input[name="q"]')!, { target: { value: "report" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(push).toHaveBeenCalledWith("/pages?q=report");
  });

  it("preserves other filters when one changes", () => {
    render(createElement(PagesToolbar, { params: { ...defaults, q: "x", visibility: "public" }, owners }));
    openSelect(/filterSort/);
    pickOption("sortViewsDesc");
    expect(push).toHaveBeenCalledWith("/pages?q=x&visibility=public&sort=views_desc");
  });

  it("clears all filters", () => {
    render(createElement(PagesToolbar, { params: { ...defaults, q: "x", visibility: "public" }, owners }));
    fireEvent.click(screen.getByRole("button", { name: "clearFilters" }));
    expect(push).toHaveBeenCalledWith("/pages");
  });

  it("selects an owner by id", () => {
    render(createElement(PagesToolbar, { params: defaults, owners }));
    openSelect(/filterOwner/);
    pickOption("Alice");
    expect(push).toHaveBeenCalledWith("/pages?owner=u1");
  });
});
