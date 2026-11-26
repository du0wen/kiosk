// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, MenuItem } from "./Menu";

function renderMenu() {
  return render(
    createElement(
      Menu,
      { label: "More actions" },
      createElement(MenuItem, null, createElement("button", { type: "button" }, "Rename")),
      createElement(MenuItem, null, createElement("button", { type: "button", disabled: true }, "Disabled")),
      createElement("a", { href: "/export.md" }, "MD"),
      createElement(MenuItem, null, createElement("button", { type: "button" }, "Delete")),
    ),
  );
}

const trigger = () => screen.getByRole("button", { name: "More actions" });
const active = () => document.activeElement as HTMLElement;

describe("Menu keyboard navigation", () => {
  afterEach(cleanup);

  it("sets aria-haspopup on the trigger", () => {
    renderMenu();
    expect(trigger().getAttribute("aria-haspopup")).toBe("true");
  });

  it("moves focus with ArrowDown/ArrowUp, skipping disabled items and wrapping", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(active().textContent).toBe("Rename");            // first enabled focused on open
    await user.keyboard("{ArrowDown}");
    expect(active().textContent).toBe("MD");                 // skips the disabled item
    await user.keyboard("{ArrowDown}");
    expect(active().textContent).toBe("Delete");
    await user.keyboard("{ArrowDown}");
    expect(active().textContent).toBe("Rename");             // wraps to first
    await user.keyboard("{ArrowUp}");
    expect(active().textContent).toBe("Delete");             // wraps to last
  });

  it("jumps to first/last with Home/End", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.keyboard("{End}");
    expect(active().textContent).toBe("Delete");
    await user.keyboard("{Home}");
    expect(active().textContent).toBe("Rename");
  });
});
