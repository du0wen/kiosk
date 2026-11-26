// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { Select } from "./Select";

const options = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "org", label: "Private" },
];
const withDisabled = [
  { value: "a", label: "A" },
  { value: "b", label: "B", disabled: true },
  { value: "c", label: "C" },
];

// Focus stays on the trigger (combobox); the highlighted option is tracked via
// aria-activedescendant rather than moving DOM focus into the portal.
const trigger = () => screen.getByRole("combobox");
const active = () => document.activeElement as HTMLElement;
const activeOptionText = () => {
  const id = trigger().getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent : null;
};
const hidden = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

afterEach(cleanup);

describe("Select — value & form", () => {
  it("renders the default value's label and a listbox combobox trigger", () => {
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "public", options }));
    expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().textContent).toContain("Public");
  });

  it("reflects a controlled value and updates when the prop changes", () => {
    const { rerender } = render(createElement(Select, { label: "Status", name: "status", value: "all", options }));
    expect(trigger().textContent).toContain("All");
    rerender(createElement(Select, { label: "Status", name: "status", value: "org", options }));
    expect(trigger().textContent).toContain("Private");
  });

  it("submits the current value through a hidden input", () => {
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "public", options }));
    expect(hidden("status")?.value).toBe("public");
  });
});

describe("Select — open & select", () => {
  it("opens on click as a listbox with one option per entry", () => {
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }));
    fireEvent.click(trigger());
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("marks the current option selected with aria-selected", () => {
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "public", options }));
    fireEvent.click(trigger());
    expect(screen.getByRole("option", { name: "Public" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "All" }).getAttribute("aria-selected")).toBe("false");
  });

  it("selecting an option updates value + hidden input, fires onValueChange, closes, and restores focus", () => {
    const onValueChange = vi.fn();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options, onValueChange }));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Public" }));
    expect(onValueChange).toHaveBeenCalledWith("public");
    expect(hidden("status")?.value).toBe("public");
    expect(trigger().textContent).toContain("Public");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(active()).toBe(trigger());
  });
});

describe("Select — keyboard", () => {
  it("opens from the trigger with Enter", async () => {
    const user = userEvent.setup();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }));
    trigger().focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("opens from the trigger with ArrowDown", async () => {
    const user = userEvent.setup();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }));
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("moves the active option with ArrowDown/ArrowUp (focus stays on trigger) and selects with Enter", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options, onValueChange }));
    await user.click(trigger());
    expect(active()).toBe(trigger());          // focus never leaves the trigger
    expect(activeOptionText()).toBe("All");    // highlight starts on the selected option
    await user.keyboard("{ArrowDown}");
    expect(activeOptionText()).toBe("Public");
    await user.keyboard("{ArrowUp}");
    expect(activeOptionText()).toBe("All");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("public");
  });

  it("selects the active option with Space", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options, onValueChange }));
    await user.click(trigger());
    await user.keyboard("{ArrowDown}{ArrowDown}"); // Private
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledWith("org");
  });

  it("jumps to first/last with Home/End", async () => {
    const user = userEvent.setup();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "public", options }));
    await user.click(trigger());
    await user.keyboard("{End}");
    expect(activeOptionText()).toBe("Private");
    await user.keyboard("{Home}");
    expect(activeOptionText()).toBe("All");
  });

  it("closes on Escape and keeps focus on the trigger", async () => {
    const user = userEvent.setup();
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }));
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(active()).toBe(trigger());
  });
});

describe("Select — focus leaving via Tab", () => {
  it("closes and moves focus to the next control on Tab, keeping default tab order", async () => {
    const user = userEvent.setup();
    render(createElement("div", null,
      createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }),
      createElement("button", { type: "button" }, "Next"),
    ));
    await user.click(trigger());
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(active()).toBe(screen.getByRole("button", { name: "Next" }));
  });

  it("closes and moves focus to the previous control on Shift+Tab", async () => {
    const user = userEvent.setup();
    render(createElement("div", null,
      createElement("button", { type: "button" }, "Prev"),
      createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }),
    ));
    await user.click(trigger());
    await user.tab({ shift: true });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(active()).toBe(screen.getByRole("button", { name: "Prev" }));
  });
});

describe("Select — dismissal, disabled, portal, cleanup", () => {
  it("closes when a pointer press lands outside", () => {
    render(createElement("div", null,
      createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }),
      createElement("button", { type: "button" }, "Outside"),
    ));
    fireEvent.click(screen.getByRole("combobox", { name: /Status/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open when the whole control is disabled", () => {
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options, disabled: true }));
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trigger());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not select a disabled option and skips it during keyboard nav", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(createElement(Select, { label: "L", name: "l", defaultValue: "a", options: withDisabled, onValueChange }));
    await user.click(trigger());
    const b = screen.getByRole("option", { name: "B" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy(); // stays open
    await user.keyboard("{ArrowDown}"); // a → skip b → c
    expect(activeOptionText()).toBe("C");
  });

  it("renders the popover inside the nearest <dialog> so a modal can't occlude it", () => {
    const dialog = document.createElement("dialog");
    document.body.appendChild(dialog);
    dialog.showModal(); // open (top layer) — mimics the real invite dialog
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }), { container: dialog });
    fireEvent.click(trigger());
    const listbox = screen.getByRole("listbox");
    expect(dialog.contains(listbox)).toBe(true);
    dialog.close();
    document.body.removeChild(dialog);
  });

  it("removes its document listeners on unmount", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options }));
    fireEvent.click(trigger());
    unmount();
    const added = addSpy.mock.calls.map((c) => c[0]);
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    for (const type of ["focusin", "pointerdown"]) {
      expect(added).toContain(type);
      expect(removed).toContain(type);
    }
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("surfaces an error message associated with the trigger", () => {
    render(createElement(Select, { label: "Status", name: "status", defaultValue: "all", options, error: "Required" }));
    expect(screen.getByText("Required")).toBeTruthy();
    const describedBy = trigger().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe("Required");
  });
});
