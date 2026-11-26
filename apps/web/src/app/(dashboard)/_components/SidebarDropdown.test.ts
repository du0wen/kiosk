// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { SidebarDropdown } from "./SidebarDropdown";

describe("<SidebarDropdown/>", () => {
  afterEach(cleanup);

  it("opens a consistent option popover and selects an item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(createElement(
      SidebarDropdown,
      {
        label: "Language",
        value: "zh",
        options: [
          { value: "en", label: "English" },
          { value: "zh", label: "中文" },
        ],
        onChange,
      },
      createElement("span", null, "Language"),
    ));

    await user.click(screen.getByRole("button", { name: "Language" }));
    expect(screen.getByRole("button", { name: "中文" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.queryByRole("button", { name: "English" })).toBeNull();
  });

  it("closes when a pointer press lands outside", async () => {
    const user = userEvent.setup();
    render(createElement(
      SidebarDropdown,
      {
        label: "Organization",
        value: "one",
        options: [{ value: "one", label: "Workspace one" }],
        onChange: vi.fn(),
      },
      createElement("span", null, "Organization"),
    ));

    await user.click(screen.getByRole("button", { name: "Organization" }));
    expect(screen.queryByRole("button", { name: "Workspace one" })).not.toBeNull();
    await user.click(document.body);
    expect(screen.queryByRole("button", { name: "Workspace one" })).toBeNull();
  });

  it("closes when its reset signal changes", async () => {
    const user = userEvent.setup();
    const dropdown = (resetSignal: boolean) => createElement(
      SidebarDropdown,
      {
        label: "Language",
        value: "zh",
        options: [{ value: "zh", label: "中文" }],
        onChange: vi.fn(),
        resetSignal,
      },
      createElement("span", null, "Language"),
    );
    const { rerender } = render(dropdown(false));

    await user.click(screen.getByRole("button", { name: "Language" }));
    expect(screen.queryByRole("button", { name: "中文" })).not.toBeNull();
    rerender(dropdown(true));
    expect(screen.queryByRole("button", { name: "中文" })).toBeNull();
  });

  it("allows a consumer to widen the option popover", async () => {
    const user = userEvent.setup();
    render(createElement(
      SidebarDropdown,
      {
        label: "Organization",
        value: "one",
        options: [{ value: "one", label: "Workspace one" }],
        onChange: vi.fn(),
        popoverClassName: "organization-popover",
      },
      createElement("span", null, "Organization"),
    ));

    await user.click(screen.getByRole("button", { name: "Organization" }));
    expect(screen.getByRole("button", { name: "Workspace one" }).parentElement?.classList.contains("organization-popover")).toBe(true);
  });
});
