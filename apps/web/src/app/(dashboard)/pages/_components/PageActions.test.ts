// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
import { PageActions } from "./PageActions";

const ok = async () => ({ ok: true as const });
const base = {
  publicId: "abc123",
  title: "My Page",
  url: "https://app.example/v/abc123",
  visibility: "org",
  canRename: true,
  canSetVisibility: true,
  canDelete: true,
  renameAction: ok,
  deleteAction: ok,
  visibilityAction: ok,
};

// The action menu is portaled to <body> with aria-label = the "more" label; the
// three always-mounted <dialog>s live outside it, so scope menu-item assertions
// here to avoid matching a closed dialog's buttons.
const menu = () => document.querySelector('div[aria-label="more"]') as HTMLElement;
function openMenu(props: Record<string, unknown>) {
  render(createElement(PageActions, { ...base, ...props } as never));
  fireEvent.click(screen.getByRole("button", { name: "more" }));
}

afterEach(() => { cleanup(); push.mockClear(); refresh.mockClear(); });

describe("PageActions capability gating", () => {
  it("hides visibility + delete for a member viewing someone else's page", () => {
    openMenu({ canSetVisibility: false, canDelete: false });
    const m = within(menu());
    expect(m.queryByRole("button", { name: "makePublic" })).toBeNull();
    expect(m.queryByRole("button", { name: "delete" })).toBeNull();
    // Rename stays available to any member.
    expect(m.queryByRole("button", { name: "rename" })).not.toBeNull();
  });

  it("shows visibility + delete for a member viewing their own page", () => {
    openMenu({ canSetVisibility: true, canDelete: true });
    const m = within(menu());
    expect(m.getByRole("button", { name: "makePublic" })).toBeTruthy();
    expect(m.getByRole("button", { name: "delete" })).toBeTruthy();
  });

  it("shows visibility + delete for owner/admin (all capabilities)", () => {
    openMenu({});
    const m = within(menu());
    expect(m.getByRole("button", { name: "makePublic" })).toBeTruthy();
    expect(m.getByRole("button", { name: "delete" })).toBeTruthy();
  });

  it("hides rename when the caller cannot rename", () => {
    openMenu({ canRename: false });
    expect(within(menu()).queryByRole("button", { name: "rename" })).toBeNull();
  });
});

describe("PageActions no fake success", () => {
  it("keeps the confirm dialog open and does not navigate when delete is rejected", async () => {
    const deleteAction = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));
    openMenu({ deleteAction, deleteRedirect: "/pages" });
    fireEvent.click(within(menu()).getByRole("button", { name: "delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "delete" })); // confirm
    expect(await screen.findByText("errorForbidden")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    // ConfirmDialog still open → its confirm button is still present.
    expect(screen.getByRole("button", { name: "delete" })).toBeTruthy();
  });

  it("navigates to the delete redirect only after a successful delete", async () => {
    openMenu({ deleteAction: ok, deleteRedirect: "/pages" });
    fireEvent.click(within(menu()).getByRole("button", { name: "delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "delete" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pages"));
  });

  it("surfaces an error and does not refresh when the visibility toggle is rejected", async () => {
    const visibilityAction = vi.fn(async () => ({ ok: false as const, error: "forbidden" as const }));
    openMenu({ visibilityAction });
    fireEvent.click(within(menu()).getByRole("button", { name: "makePublic" }));
    expect(await screen.findByText("errorForbidden")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes after a successful visibility toggle", async () => {
    openMenu({ visibilityAction: ok });
    fireEvent.click(within(menu()).getByRole("button", { name: "makePublic" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("maps an internal_error result to the generic error and does not navigate", async () => {
    const deleteAction = vi.fn(async () => ({ ok: false as const, error: "internal_error" as const }));
    openMenu({ deleteAction, deleteRedirect: "/pages" });
    fireEvent.click(within(menu()).getByRole("button", { name: "delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "delete" }));
    expect(await screen.findByText("errorGeneric")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("PageActions unexpected rejection fallback", () => {
  it("keeps the confirm dialog open and does not navigate when the delete action throws", async () => {
    const deleteAction = vi.fn(async () => { throw new Error("boom"); });
    openMenu({ deleteAction, deleteRedirect: "/pages" });
    fireEvent.click(within(menu()).getByRole("button", { name: "delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "delete" }));
    expect(await screen.findByText("errorGeneric")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "delete" })).toBeTruthy();
  });

  it("does not refresh and shows a generic error when the visibility action throws", async () => {
    const visibilityAction = vi.fn(async () => { throw new Error("boom"); });
    openMenu({ visibilityAction });
    fireEvent.click(within(menu()).getByRole("button", { name: "makePublic" }));
    expect(await screen.findByText("errorGeneric")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the rename dialog open and shows a generic error when the rename action throws", async () => {
    const renameAction = vi.fn(async () => { throw new Error("boom"); });
    openMenu({ renameAction });
    fireEvent.click(within(menu()).getByRole("button", { name: "rename" }));
    const dialog = document.getElementById("rename-abc123")!.closest("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    fireEvent.submit(document.getElementById("rename-abc123")!);
    expect(await screen.findByText("errorGeneric")).toBeTruthy();
    expect(dialog.open).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
});
