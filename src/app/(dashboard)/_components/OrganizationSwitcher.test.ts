// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  setActive: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      list: mocks.list,
      create: mocks.create,
      setActive: mocks.setActive,
    },
  },
}));

import { OrganizationSwitcher, mergeOrganizations } from "./OrganizationSwitcher";

describe("<OrganizationSwitcher/>", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.create.mockReset();
    mocks.setActive.mockReset();
    mocks.refresh.mockReset();
  });
  afterEach(cleanup);

  it("keeps the active organization in the list while the async list catches up", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue({
      data: [{ id: "old-org", name: "Old workspace" }],
    });

    render(createElement(OrganizationSwitcher, {
      activeOrganizationId: "new-org",
      organizationName: "New workspace",
    }));

    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "organization" }));
    expect(screen.getByRole("button", { name: "New workspace" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Old workspace" })).not.toBeNull();
  });
});

describe("mergeOrganizations", () => {
  it("keeps the active org's fresh name over a stale list entry", () => {
    const merged = mergeOrganizations([{ id: "o1", name: "Old Name" }], { id: "o1", name: "New Name" });
    expect(merged.find((o) => o.id === "o1")?.name).toBe("New Name");
  });
  it("includes other orgs from the list", () => {
    const merged = mergeOrganizations([{ id: "o1", name: "A" }, { id: "o2", name: "B" }], { id: "o1", name: "A2" });
    expect(merged.map((o) => o.id).sort()).toEqual(["o1", "o2"]);
  });
});
