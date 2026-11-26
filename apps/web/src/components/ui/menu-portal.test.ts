// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, MenuItem } from "./Menu";

// Exercises the real DOM the Menu produces — not its source text. The action
// menu is a plain popover of buttons/links (no half-implemented ARIA menu),
// portaled out of the table so `overflow-x: auto` can never clip it.
function renderMenu() {
  return render(
    createElement(
      "div",
      null,
      createElement(
        Menu,
        { label: "More actions" },
        createElement(MenuItem, null, createElement("button", { type: "button" }, "Rename")),
        createElement("a", { href: "/export.md" }, "MD"),
        createElement(MenuItem, null, createElement("button", { type: "button" }, "Delete")),
      ),
      createElement("button", { type: "button" }, "Outside"),
    ),
  );
}

const trigger = () => screen.getByRole("button", { name: "More actions" });

describe("Menu popover", () => {
  afterEach(cleanup);

  it("portals the popover to <body> so table overflow cannot clip it", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();
    await user.click(trigger());
    const rename = screen.getByRole("button", { name: "Rename" });
    // The action lives under <body>, detached from the trigger's own subtree.
    expect(container.contains(rename)).toBe(false);
    expect(document.body.contains(rename)).toBe(true);
  });

  it("does not use a half-implemented ARIA menu pattern", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
  });

  it("gives the popover an accessible name and disclosure semantics", async () => {
    const user = userEvent.setup();
    renderMenu();
    const button = trigger();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    // Disclosure button, not an ARIA menu button.
    expect(button.getAttribute("aria-haspopup")).not.toBe("menu");
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const popover = screen.getByRole("button", { name: "Rename" }).closest("[aria-label]");
    expect(popover).not.toBeNull();
    expect(popover).not.toBe(button);
    expect(popover?.getAttribute("aria-label")).toBe("More actions");
  });

  it("focuses the first action when opened", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rename" }));
  });

  it("lets Tab reach every action, including export links, in natural order", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rename" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "MD" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete" }));
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes when a pointer press lands outside the popover", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });
});
