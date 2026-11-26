import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import StorageAdminPage from "./page";

describe("legacy /admin/storage", () => {
  it("redirects to the canonical Settings route", async () => {
    await expect(StorageAdminPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/settings/storage");
  });
});
