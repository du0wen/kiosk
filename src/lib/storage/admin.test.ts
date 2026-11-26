import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { storageProfile } from "@/db/schema";
import { cleanupPrincipal, createPrincipal } from "@/test/factories";
import { createStorageProfile } from "./storage-profiles";
import { listStorageProfileSummaries, testStorageProfileConnection } from "./admin";

let principal: Awaited<ReturnType<typeof createPrincipal>> | null = null;
let profileId: string | null = null;
let root: string | null = null;
let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.STORAGE_CREDENTIAL_KEY;
  process.env.STORAGE_CREDENTIAL_KEY = randomBytes(32).toString("base64");
});

afterEach(async () => {
  if (profileId) await db.delete(storageProfile).where(eq(storageProfile.id, profileId));
  if (principal) await cleanupPrincipal(principal);
  if (root) await rm(root, { recursive: true, force: true });
  profileId = null;
  principal = null;
  root = null;
  process.env.STORAGE_CREDENTIAL_KEY = previousKey;
});

describe("storage admin service", () => {
  it("tests a filesystem profile and reports safe usage data", async () => {
    principal = await createPrincipal();
    root = await mkdtemp(join(tmpdir(), "kiosk-admin-storage-"));
    const profile = await createStorageProfile({
      name: `filesystem-${Date.now()}`,
      provider: "filesystem",
      config: { rootPath: root },
      credentials: {},
      actorUserId: principal.userId,
      environment: { nodeEnv: "test" },
    });
    profileId = profile.id;
    await testStorageProfileConnection(profile.id);
    const summary = (await listStorageProfileSummaries()).find((item) => item.id === profile.id);
    expect(summary).toMatchObject({
      status: "healthy",
      objectCount: 0,
      storedBytes: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("credentials");
  });
});
