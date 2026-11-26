// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

const mocks = vi.hoisted(() => ({
  inviteMember: vi.fn(), updateMemberRole: vi.fn(), removeMember: vi.fn(), refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: {
    inviteMember: mocks.inviteMember,
    updateMemberRole: mocks.updateMemberRole,
    removeMember: mocks.removeMember,
  } },
}));
import { MembersClient } from "./MembersClient";

const props = {
  members: [{ id: "m1", userId: "u1", name: "Owner", email: "owner@x.com", role: "owner", joinedAt: "2026-01-01" }],
  invitations: [],
  canManage: true,
  currentUserId: "u1",
};

describe("<MembersClient/> invite form", () => {
  beforeEach(() => { Object.values(mocks).forEach((m) => m.mockReset()); });
  afterEach(cleanup);

  it("does not call the API when email is empty", async () => {
    const user = userEvent.setup();
    render(createElement(MembersClient, props));
    await user.click(screen.getByRole("button", { name: "invite" }));
    await user.click(screen.getByRole("button", { name: "createLink" }));
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("does not call the API for an invalid email", async () => {
    const user = userEvent.setup();
    render(createElement(MembersClient, props));
    await user.click(screen.getByRole("button", { name: "invite" }));
    await user.type(screen.getByLabelText("email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "createLink" }));
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("submits a valid email via Enter and calls the API once", async () => {
    mocks.inviteMember.mockResolvedValue({ data: { id: "inv1" }, error: null });
    const user = userEvent.setup();
    render(createElement(MembersClient, props));
    await user.click(screen.getByRole("button", { name: "invite" }));
    await user.type(screen.getByLabelText("email"), "new@x.com{Enter}");
    await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalledTimes(1));
    expect(mocks.inviteMember).toHaveBeenCalledWith({ email: "new@x.com", role: "member" });
  });

  it("uses the shared Select (no native <select>) for the invite Role control", async () => {
    const user = userEvent.setup();
    render(createElement(MembersClient, props));
    await user.click(screen.getByRole("button", { name: "invite" }));
    expect(document.querySelector("#invite-form select")).toBeNull();
    expect(screen.getByRole("combobox", { name: /role/ })).toBeTruthy();
  });

  it("submits the role chosen through the Select (admin)", async () => {
    mocks.inviteMember.mockResolvedValue({ data: { id: "inv1" }, error: null });
    const user = userEvent.setup();
    render(createElement(MembersClient, props));
    await user.click(screen.getByRole("button", { name: "invite" }));
    await user.click(screen.getByRole("combobox", { name: /role/ }));
    await user.click(screen.getByRole("option", { name: "admin" }));
    await user.type(screen.getByLabelText("email"), "new@x.com");
    await user.click(screen.getByRole("button", { name: "createLink" }));
    await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalledWith({ email: "new@x.com", role: "admin" }));
  });
});

const propsWithMember = {
  ...props,
  members: [
    ...props.members,
    { id: "m2", userId: "u2", name: "Bob", email: "bob@x.com", role: "member", joinedAt: "2026-02-01" },
  ],
};

describe("<MembersClient/> mutation failures", () => {
  beforeEach(() => { Object.values(mocks).forEach((m) => m.mockReset()); });
  afterEach(cleanup);

  it("shows an error and does not refresh when role change fails", async () => {
    mocks.updateMemberRole.mockResolvedValue({ error: { message: "nope" } });
    const user = userEvent.setup();
    render(createElement(MembersClient, propsWithMember));
    await user.selectOptions(screen.getByLabelText("changeRole"), "admin");
    await waitFor(() => expect(screen.getByText("updateRoleFailed")).toBeTruthy());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps the confirm dialog open and shows an error when remove fails", async () => {
    mocks.removeMember.mockResolvedValue({ error: { message: "nope" } });
    const user = userEvent.setup();
    render(createElement(MembersClient, propsWithMember));
    await user.click(screen.getByRole("button", { name: "remove" }));      // open confirm (table icon button)
    // ConfirmDialog is rendered last, so it is the final <dialog> element.
    const dialogs = document.querySelectorAll("dialog");
    const confirmDialog = dialogs[dialogs.length - 1] as HTMLDialogElement;
    await user.click(within(confirmDialog).getByRole("button", { name: "remove" })); // confirm
    await waitFor(() => expect(within(confirmDialog).getByText("removeFailed")).toBeTruthy());
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(confirmDialog.open).toBe(true);                                 // still open on failure
  });
});
