import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isAdminEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  enable: vi.fn(),
  setDefault: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/console", () => ({ isAdminEmail: mocks.isAdminEmail }));
vi.mock("@/lib/storage/storage-profiles", () => ({
  createStorageProfile: mocks.create,
  updateStorageProfile: mocks.update,
  setStorageProfileEnabled: mocks.enable,
  setDefaultStorageProfile: mocks.setDefault,
  deleteStorageProfile: mocks.remove,
}));
vi.mock("@/lib/storage/admin", () => ({
  hasStorageProfileReferences: vi.fn(),
  testStorageProfileConnection: mocks.test,
}));

import { operateStorageProfileAction, saveStorageProfileAction } from "./actions";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getSession.mockResolvedValue({ user: { id: "user-a", email: "admin@example.com" } });
  mocks.isAdminEmail.mockReturnValue(true);
});

describe("storage admin server actions", () => {
  it("blocks direct mutation calls from non-platform-admin users", async () => {
    mocks.isAdminEmail.mockReturnValue(false);
    await expect(saveStorageProfileAction(new FormData())).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    await expect(operateStorageProfileAction(new FormData())).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("normalizes an S3 create without returning submitted credentials", async () => {
    const data = new FormData();
    data.set("name", "R2 production");
    data.set("provider", "s3");
    data.set("region", "auto");
    data.set("bucket", "private-pages");
    data.set("endpoint", "https://account.r2.cloudflarestorage.com");
    data.set("forcePathStyle", "on");
    data.set("accessKeyId", "access-secret");
    data.set("secretAccessKey", "credential-secret");
    const result = await saveStorageProfileAction(data);
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(mocks.create).toHaveBeenCalledWith({
      name: "R2 production",
      provider: "s3",
      config: {
        region: "auto",
        bucket: "private-pages",
        endpoint: "https://account.r2.cloudflarestorage.com",
        forcePathStyle: true,
      },
      credentials: {
        accessKeyId: "access-secret",
        secretAccessKey: "credential-secret",
      },
      actorUserId: "user-a",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/storage");
  });

  it("rechecks authorization and dispatches profile operations", async () => {
    const data = new FormData();
    data.set("id", "profile-a");
    data.set("operation", "enable");
    await expect(operateStorageProfileAction(data)).resolves.toEqual({ ok: true });
    expect(mocks.enable).toHaveBeenCalledWith("profile-a", true, "user-a");
  });
});
