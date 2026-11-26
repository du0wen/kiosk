import { describe, expect, it, vi } from "vitest";
import type { StorageProfileView } from "./storage-profiles";
import {
  assertPublicEndpointResolution,
  createContentStore,
  createContentStoreForProfile,
} from "./registry";
import { MemoryContentStore } from "./adapters/memory";
import { contentDigest } from "./content-store";

const base: StorageProfileView = {
  id: "profile-a",
  name: "A",
  provider: "s3",
  config: { region: "auto", bucket: "a", forcePathStyle: false },
  enabled: true,
  isDefault: false,
  status: "healthy",
  lastCheckedAt: null,
  lastErrorCode: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("storage adapter registry", () => {
  it("passes only the selected profile to its provider factory", async () => {
    const a = { ...base, credentials: { accessKeyId: "a", secretAccessKey: "secret-a" } };
    const factory = vi.fn(() => ({ marker: "store-a" }));
    const store = await createContentStoreForProfile(a, { s3: factory } as never);
    expect(store).toEqual({ marker: "store-a" });
    expect(factory).toHaveBeenCalledWith(a);
  });

  it("rejects a production custom endpoint resolving to a private address", async () => {
    await expect(
      assertPublicEndpointResolution(
        "https://objects.example.com",
        async () => [{ address: "10.0.0.1", family: 4 }],
      ),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
    await expect(
      assertPublicEndpointResolution(
        "https://objects.example.com",
        async () => [{ address: "203.0.113.10", family: 4 }],
      ),
    ).resolves.toBeUndefined();
  });

  it("keeps simultaneous profile stores isolated", async () => {
    const profiles = [
      { ...base, id: "profile-a", credentials: { accessKeyId: "a", secretAccessKey: "a" } },
      { ...base, id: "profile-b", credentials: { accessKeyId: "b", secretAccessKey: "b" } },
    ];
    const factory = () => new MemoryContentStore();
    const [storeA, storeB] = await Promise.all(
      profiles.map((profile) => createContentStoreForProfile(profile, { s3: factory })),
    );
    const body = new TextEncoder().encode("profile-a-only");
    await storeA.put({
      key: "same/key",
      body,
      contentHash: contentDigest(body),
      contentType: "application/octet-stream",
    });
    expect(await storeA.get("same/key")).toEqual(body);
    expect(await storeB.get("same/key")).toBeNull();
  });

  it("loads credentials per request and permits reads through a disabled recorded profile", async () => {
    const profile = {
      ...base,
      enabled: false,
      credentials: { accessKeyId: "request-only", secretAccessKey: "secret" },
    };
    const loadProfile = vi.fn(async () => profile);
    const factory = vi.fn(() => new MemoryContentStore());
    await expect(
      createContentStore(profile.id, { loadProfile, factories: { s3: factory } }),
    ).resolves.toBeInstanceOf(MemoryContentStore);
    expect(loadProfile).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(profile);
  });
});
