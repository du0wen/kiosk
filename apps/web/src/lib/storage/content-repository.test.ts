import { describe, expect, it, vi } from "vitest";
import { MemoryContentStore } from "./adapters/memory";
import {
  ContentRepository,
  ContentRepositoryError,
  parseContentStorageMode,
} from "./content-repository";
import type { ResolvedStorageProfile } from "./registry";

const profile: ResolvedStorageProfile = {
  id: "profile-a",
  name: "A",
  provider: "s3",
  config: { region: "auto", bucket: "a", forcePathStyle: false },
  credentials: { accessKeyId: "a", secretAccessKey: "secret" },
  enabled: true,
  isDefault: true,
  status: "healthy",
  lastCheckedAt: new Date(0),
  lastErrorCode: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("content storage mode", () => {
  it("defaults to external and rejects unknown values", () => {
    expect(parseContentStorageMode(undefined)).toBe("external");
    expect(parseContentStorageMode("dual")).toBe("dual");
    expect(() => parseContentStorageMode("auto")).toThrowError(ContentRepositoryError);
  });
});

describe("ContentRepository writes", () => {
  it("keeps database mode local and retains legacy HTML", async () => {
    const loadDefaultProfile = vi.fn();
    const createStore = vi.fn();
    const persist = vi.fn(async (prepared) => prepared);
    const repository = new ContentRepository({
      mode: "database",
      loadDefaultProfile,
      createStore,
    });
    const result = await repository.write(
      { organizationId: "org-a", html: "<h1>db</h1>" },
      persist,
    );
    expect(result.legacyHtml).toBe("<h1>db</h1>");
    expect(result.external).toBeNull();
    expect(loadDefaultProfile).not.toHaveBeenCalled();
    expect(createStore).not.toHaveBeenCalled();
  });

  it.each([
    ["dual", "<h1>dual</h1>"],
    ["external", null],
  ] as const)("uploads and verifies %s mode before persistence", async (mode, legacyHtml) => {
    const store = new MemoryContentStore();
    const persist = vi.fn(async (prepared) => prepared);
    const repository = new ContentRepository({
      mode,
      loadDefaultProfile: async () => profile,
      createStore: async () => store,
    });
    const result = await repository.write(
      { organizationId: "org-a", html: `<h1>${mode}</h1>` },
      persist,
    );
    expect(result.legacyHtml).toBe(legacyHtml);
    expect(result.external).toMatchObject({
      storageProfileId: profile.id,
      objectKey: expect.stringMatching(/^organizations\/org-a\/content\/sha256\/[a-f0-9]{64}\.html$/),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(await store.get(result.external!.objectKey)).not.toBeNull();
  });

  it("does not persist when no healthy default exists or upload fails", async () => {
    const persist = vi.fn();
    const missing = new ContentRepository({
      mode: "external",
      loadDefaultProfile: async () => null,
      createStore: async () => new MemoryContentStore(),
    });
    await expect(
      missing.write({ organizationId: "org-a", html: "x" }, persist),
    ).rejects.toMatchObject({ code: "storage_unavailable" });

    const failing = new ContentRepository({
      mode: "dual",
      loadDefaultProfile: async () => profile,
      createStore: async () => ({
        put: async () => { throw new Error("provider secret"); },
        get: async () => null,
        head: async () => null,
        delete: async () => undefined,
        testConnection: async () => undefined,
      }),
    });
    await expect(
      failing.write({ organizationId: "org-a", html: "x" }, persist),
    ).rejects.toMatchObject({
      code: "storage_unavailable",
      message: "Content storage is unavailable",
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("makes concurrent identical uploads idempotent", async () => {
    const store = new MemoryContentStore();
    const repository = new ContentRepository({
      mode: "dual",
      loadDefaultProfile: async () => profile,
      createStore: async () => store,
    });
    const persist = async (prepared: unknown) => prepared;
    const results = await Promise.all([
      repository.write({ organizationId: "org-a", html: "same" }, persist),
      repository.write({ organizationId: "org-a", html: "same" }, persist),
    ]);
    expect(results[0]).toEqual(results[1]);
  });
});

describe("ContentRepository reads", () => {
  it("uses legacy HTML directly in database mode", async () => {
    const loadReference = vi.fn();
    const loadStore = vi.fn();
    const repository = new ContentRepository({ mode: "database", loadReference, loadStore });
    await expect(
      repository.read({ organizationId: "org-a", contentId: "content-a", legacyHtml: "legacy" }),
    ).resolves.toBe("legacy");
    expect(loadReference).not.toHaveBeenCalled();
    expect(loadStore).not.toHaveBeenCalled();
  });

  it("reads and verifies the recorded profile instead of the current default", async () => {
    const store = new MemoryContentStore();
    const body = new TextEncoder().encode("external");
    const contentHash = await import("./content-store").then(({ contentDigest }) => contentDigest(body));
    await store.put({
      key: "organizations/org-a/content/sha256/value.html",
      body,
      contentHash,
      contentType: "application/octet-stream",
    });
    const loadStore = vi.fn(async () => store);
    const repository = new ContentRepository({
      mode: "external",
      loadReference: async () => ({
        storageProfileId: "recorded-profile",
        objectKey: "organizations/org-a/content/sha256/value.html",
        contentHash,
        sizeBytes: body.byteLength,
        status: "ready",
      }),
      loadStore,
    });
    await expect(
      repository.read({ organizationId: "org-a", contentId: "content-a", legacyHtml: null }),
    ).resolves.toBe("external");
    expect(loadStore).toHaveBeenCalledWith("recorded-profile");
  });

  it("falls back only in database/dual mode and rejects corrupt external content", async () => {
    const broken = {
      loadReference: async () => ({
        storageProfileId: "recorded",
        objectKey: "content/key",
        contentHash: "0".repeat(64),
        sizeBytes: 5,
        status: "ready" as const,
      }),
      loadStore: async () => new MemoryContentStore(),
    };
    const dual = new ContentRepository({ mode: "dual", ...broken });
    await expect(
      dual.read({ organizationId: "org-a", contentId: "content-a", legacyHtml: "legacy" }),
    ).resolves.toBe("legacy");

    const external = new ContentRepository({ mode: "external", ...broken });
    await expect(
      external.read({ organizationId: "org-a", contentId: "content-a", legacyHtml: "legacy" }),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
  });
});
