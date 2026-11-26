import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storageProfile } from "@/db/schema";
import { cleanupPrincipal, createPrincipal } from "@/test/factories";
import {
  createStorageProfile,
  DEFAULT_LOCAL_PROFILE_NAME,
  deleteStorageProfile,
  ensureDefaultLocalStorageProfile,
  getStorageProfileWithCredentials,
  listStorageProfiles,
  recordStorageProfileHealth,
  setDefaultStorageProfile,
  setStorageProfileEnabled,
  StorageProfileError,
  updateStorageProfile,
} from "./storage-profiles";

let principal: Awaited<ReturnType<typeof createPrincipal>> | null = null;
const profileIds: string[] = [];
let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.STORAGE_CREDENTIAL_KEY;
  process.env.STORAGE_CREDENTIAL_KEY = randomBytes(32).toString("base64");
});

afterEach(async () => {
  for (const id of profileIds.splice(0)) {
    await db.delete(storageProfile).where(eq(storageProfile.id, id));
  }
  if (principal) {
    await cleanupPrincipal(principal);
    principal = null;
  }
  process.env.STORAGE_CREDENTIAL_KEY = previousKey;
});

async function createProfile(name: string) {
  principal ??= await createPrincipal();
  const profile = await createStorageProfile({
    name,
    provider: "s3",
    config: { region: "us-east-1", bucket: `bucket-${name}` },
    credentials: { accessKeyId: "access", secretAccessKey: "secret" },
    actorUserId: principal.userId,
    environment: { nodeEnv: "test" },
  });
  profileIds.push(profile.id);
  return profile;
}

describe("storage profiles", () => {
  it("stores encrypted secrets but returns only safe profile fields", async () => {
    const profile = await createProfile(`primary-${Date.now()}`);
    expect(profile).toMatchObject({
      provider: "s3",
      enabled: false,
      isDefault: false,
      status: "unverified",
    });
    expect(profile).not.toHaveProperty("credentialsCiphertext");

    const [stored] = await db
      .select()
      .from(storageProfile)
      .where(eq(storageProfile.id, profile.id));
    expect(stored.credentialsCiphertext).not.toContain("secret");
    expect(stored.credentialsCiphertext).not.toContain("access");

    const internal = await getStorageProfileWithCredentials(profile.id);
    expect(internal?.credentials).toEqual({
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
    expect(JSON.stringify(await listStorageProfiles())).not.toContain("secret");
  });

  it("requires a healthy enabled profile and keeps only one default", async () => {
    const first = await createProfile(`first-${Date.now()}`);
    const second = await createProfile(`second-${Date.now()}`);

    await expect(setStorageProfileEnabled(first.id, true, principal!.userId)).rejects.toMatchObject({
      code: "profile_unhealthy",
    });
    await recordStorageProfileHealth(first.id, { healthy: true });
    await setStorageProfileEnabled(first.id, true, principal!.userId);
    await expect(
      updateStorageProfile({
        id: first.id,
        name: first.name,
        config: { region: "us-east-1", bucket: "changed-while-enabled" },
        actorUserId: principal!.userId,
        environment: { nodeEnv: "test" },
      }),
    ).rejects.toMatchObject({ code: "profile_enabled" });
    await setDefaultStorageProfile(first.id, principal!.userId);

    await recordStorageProfileHealth(second.id, { healthy: true });
    await setStorageProfileEnabled(second.id, true, principal!.userId);
    await setDefaultStorageProfile(second.id, principal!.userId);
    const profiles = await listStorageProfiles();
    expect(profiles.find((p) => p.id === first.id)?.isDefault).toBe(false);
    expect(profiles.find((p) => p.id === second.id)?.isDefault).toBe(true);
    await expect(
      setStorageProfileEnabled(second.id, false, principal!.userId),
    ).rejects.toMatchObject({ code: "profile_is_default" });
  });

  it("keeps credentials on blank edit and protects referenced profiles", async () => {
    const profile = await createProfile(`edit-${Date.now()}`);
    const before = await getStorageProfileWithCredentials(profile.id);
    await updateStorageProfile({
      id: profile.id,
      name: `${profile.name}-renamed`,
      config: { region: "auto", bucket: "renamed" },
      actorUserId: principal!.userId,
      environment: { nodeEnv: "test" },
    });
    const after = await getStorageProfileWithCredentials(profile.id);
    expect(after?.credentials).toEqual(before?.credentials);

    await expect(
      deleteStorageProfile(profile.id, async () => true),
    ).rejects.toMatchObject({ code: "profile_referenced" });
    expect(await deleteStorageProfile(profile.id, async () => false)).toBe(true);
    profileIds.splice(profileIds.indexOf(profile.id), 1);
  });

  it("returns a stable conflict instead of a raw database error", async () => {
    const name = `duplicate-${Date.now()}`;
    await createProfile(name);
    await expect(createProfile(name)).rejects.toMatchObject({
      code: "profile_name_conflict",
    });
  });

  it("uses stable sanitized error codes", () => {
    expect(new StorageProfileError("profile_not_found", "missing")).toMatchObject({
      code: "profile_not_found",
      message: "missing",
    });
  });

  it("auto-bootstraps the built-in Local Storage profile without STORAGE_CREDENTIAL_KEY", async () => {
    delete process.env.STORAGE_CREDENTIAL_KEY;
    const localProfile = await ensureDefaultLocalStorageProfile("/tmp/kiosk-local-test");
    if (localProfile.name === DEFAULT_LOCAL_PROFILE_NAME) {
      profileIds.push(localProfile.id);
    }
    expect(localProfile.isDefault).toBe(true);
    expect(localProfile.enabled).toBe(true);
    expect(localProfile.status).toBe("healthy");
    if (localProfile.provider === "filesystem") {
      expect(localProfile.credentials).toEqual({});
    }
  });
});
