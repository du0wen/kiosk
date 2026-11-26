import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), isAdminEmail: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
  list: vi.fn(), listMigrations: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/console", () => ({ isAdminEmail: mocks.isAdminEmail }));
vi.mock("@/lib/storage/admin", () => ({ listStorageProfileSummaries: mocks.list, listStorageMigrationSummaries: mocks.listMigrations }));
vi.mock("../../admin/storage/_components/StorageClient", () => ({ StorageClient: () => null }));

import StorageSettingsPage from "./page";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  mocks.list.mockResolvedValue([]); mocks.listMigrations.mockResolvedValue([]);
});

describe("/settings/storage authorization", () => {
  it("redirects signed-out users before loading storage metadata", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(StorageSettingsPage()).rejects.toThrow("REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in?callback=/settings/storage");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns not found to authenticated non-platform-admins", async () => {
    mocks.getSession.mockResolvedValue({ user: { email: "member@example.com" } });
    mocks.isAdminEmail.mockReturnValue(false);
    await expect(StorageSettingsPage()).rejects.toThrow("NOT_FOUND");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.listMigrations).not.toHaveBeenCalled();
  });
});
