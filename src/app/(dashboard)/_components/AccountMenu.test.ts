// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: mocks.signOut } }));

import { AccountMenu } from "./AccountMenu";

describe("<AccountMenu/>", () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
  });
  afterEach(cleanup);

  it("closes when the user clicks outside", async () => {
    const user = userEvent.setup();
    render(createElement(AccountMenu, {
      userName: "Kevin",
      userEmail: "kevin@example.com",
    }));

    await user.click(screen.getByRole("button", { name: "account" }));
    expect(screen.queryByText("kevin@example.com")).not.toBeNull();

    await user.click(document.body);
    expect(screen.queryByText("kevin@example.com")).toBeNull();
  });

  it("closes when the mobile drawer closes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(createElement(AccountMenu, {
      userName: "Kevin",
      userEmail: "kevin@example.com",
      resetSignal: true,
    }));

    await user.click(screen.getByRole("button", { name: "account" }));
    expect(screen.queryByText("kevin@example.com")).not.toBeNull();

    rerender(createElement(AccountMenu, {
      userName: "Kevin",
      userEmail: "kevin@example.com",
      resetSignal: false,
    }));
    expect(screen.queryByText("kevin@example.com")).toBeNull();
  });
});
