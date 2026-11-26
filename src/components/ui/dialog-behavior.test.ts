// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useState } from "react";
import { Dialog } from "./Dialog";
import { ConfirmDialog } from "./ConfirmDialog";

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: () => setOpen(true) }, "Trigger"),
    createElement(
      Dialog,
      { open, title: "Title", closeLabel: "Close", onClose: () => { onClose(); setOpen(false); } },
      createElement("p", null, "Body content"),
    ),
  );
}

const dialogEl = () => document.querySelector("dialog") as HTMLDialogElement;

describe("<Dialog/> behavior", () => {
  afterEach(cleanup);

  it("opens and closes the native dialog in sync with the open prop", async () => {
    const user = userEvent.setup();
    render(createElement(Harness, { onClose: vi.fn() }));
    expect(dialogEl().open).toBe(false);
    await user.click(screen.getByRole("button", { name: "Trigger" }));
    expect(dialogEl().open).toBe(true);
    expect(screen.getByText("Body content")).toBeTruthy();
  });

  it("calls onClose exactly once on cancel (Escape) and restores focus to the trigger", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(createElement(Harness, { onClose }));
    const trigger = screen.getByRole("button", { name: "Trigger" });
    await user.click(trigger);
    // Escape on a modal <dialog> dispatches the `cancel` event.
    fireEvent(dialogEl(), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("calls onClose once when the close button is used", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(createElement(Harness, { onClose }));
    await user.click(screen.getByRole("button", { name: "Trigger" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(false);
  });

  it("renders no body element when ConfirmDialog has no error", () => {
    render(
      createElement(ConfirmDialog, {
        open: true, title: "Remove?", description: "This cannot be undone.",
        confirmLabel: "Remove", cancelLabel: "Cancel", closeLabel: "Close",
        onConfirm: vi.fn(), onClose: vi.fn(),
      }),
    );
    const dialog = dialogEl();
    // header + footer only — no empty body wrapper.
    expect(dialog.querySelectorAll(":scope > div").length).toBe(2);
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("shows an error Notice inside ConfirmDialog when error is set", () => {
    render(
      createElement(ConfirmDialog, {
        open: true, title: "Remove?", description: "This cannot be undone.",
        confirmLabel: "Remove", cancelLabel: "Cancel", closeLabel: "Close",
        error: "Could not remove.", onConfirm: vi.fn(), onClose: vi.fn(),
      }),
    );
    expect(screen.getByText("Could not remove.")).toBeTruthy();
    expect(dialogEl().querySelectorAll(":scope > div").length).toBe(3);
  });
});
