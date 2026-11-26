import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  pageContent,
  pages,
  pageVersion,
  storageMigration,
  storageProfile,
} from "@/db/schema";
import { cleanupPrincipal, createPrincipal } from "@/test/factories";
import { createBackfillMigration, runBackfillBatch } from "./backfill";
import { createPurgeMigration, runPurgeBatch } from "./purge";
import { createRepointMigration, runRepointBatch } from "./repoint";
import {
  createStorageProfile,
  recordStorageProfileHealth,
  setStorageProfileEnabled,
} from "./storage-profiles";

let principal: Awaited<ReturnType<typeof createPrincipal>> | null = null;
let profileId: string | null = null;
let secondProfileId: string | null = null;
let migrationId: string | null = null;
let root: string | null = null;
let secondRoot: string | null = null;
let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.STORAGE_CREDENTIAL_KEY;
  process.env.STORAGE_CREDENTIAL_KEY = randomBytes(32).toString("base64");
});

afterEach(async () => {
  if (migrationId) await db.delete(storageMigration).where(eq(storageMigration.id, migrationId));
  if (principal) {
    await db.delete(pageContent).where(eq(pageContent.organizationId, principal.organizationId));
  }
  if (profileId) await db.delete(storageProfile).where(eq(storageProfile.id, profileId));
  if (secondProfileId) await db.delete(storageProfile).where(eq(storageProfile.id, secondProfileId));
  if (principal) await cleanupPrincipal(principal);
  if (root) await rm(root, { recursive: true, force: true });
  if (secondRoot) await rm(secondRoot, { recursive: true, force: true });
  principal = null;
  profileId = null;
  secondProfileId = null;
  migrationId = null;
  root = null;
  secondRoot = null;
  process.env.STORAGE_CREDENTIAL_KEY = previousKey;
});

describe("database HTML backfill", () => {
  it("resumes bounded batches and deduplicates identical current/version content", async () => {
    principal = await createPrincipal();
    root = await mkdtemp(join(tmpdir(), "kiosk-backfill-"));
    const profile = await createStorageProfile({
      name: `backfill-${Date.now()}`,
      provider: "filesystem",
      config: { rootPath: root },
      credentials: {},
      actorUserId: principal.userId,
      environment: { nodeEnv: "test" },
    });
    profileId = profile.id;
    await recordStorageProfileHealth(profile.id, { healthy: true });
    await setStorageProfileEnabled(profile.id, true, principal.userId);

    const html = "<main>backfill</main>";
    const [page] = await db.insert(pages).values({
      publicId: nanoid(12),
      organizationId: principal.organizationId,
      createdBy: principal.userId,
      contentHtml: html,
      sizeBytes: Buffer.byteLength(html),
      visibility: "org",
    }).returning();
    const [version] = await db.insert(pageVersion).values({
      pageId: page.id,
      contentHtml: html,
      editedBy: principal.userId,
    }).returning();

    migrationId = await createBackfillMigration({
      targetProfileId: profile.id,
      createdBy: principal.userId,
      organizationId: principal.organizationId,
    });
    const first = await runBackfillBatch({ migrationId, batchSize: 1 });
    expect(first.batch).toMatchObject({ processed: 1, done: false });
    const second = await runBackfillBatch({ migrationId, batchSize: 2 });
    expect(second.status).toBe("completed");
    expect(second).toMatchObject({ processedCount: 2, migratedCount: 2, failedCount: 0 });

    const [storedPage] = await db.select().from(pages).where(eq(pages.id, page.id));
    const [storedVersion] = await db.select().from(pageVersion).where(eq(pageVersion.id, version.id));
    expect(storedPage.currentContentId).toBeTruthy();
    expect(storedVersion.contentId).toBe(storedPage.currentContentId);
    const contentRows = await db.select().from(pageContent).where(and(
      eq(pageContent.organizationId, principal.organizationId),
      eq(pageContent.storageProfileId, profile.id),
    ));
    expect(contentRows).toHaveLength(1);

    const rerun = await runBackfillBatch({ migrationId, batchSize: 10 });
    expect(rerun.batch.processed).toBe(0);
    expect(rerun.processedCount).toBe(2);

    await db.delete(storageMigration).where(eq(storageMigration.id, migrationId));
    secondRoot = await mkdtemp(join(tmpdir(), "kiosk-repoint-"));
    const secondProfile = await createStorageProfile({
      name: `repoint-${Date.now()}`,
      provider: "filesystem",
      config: { rootPath: secondRoot },
      credentials: {},
      actorUserId: principal.userId,
      environment: { nodeEnv: "test" },
    });
    secondProfileId = secondProfile.id;
    await recordStorageProfileHealth(secondProfile.id, { healthy: true });
    await setStorageProfileEnabled(secondProfile.id, true, principal.userId);
    migrationId = await createRepointMigration({
      sourceProfileId: profile.id,
      targetProfileId: secondProfile.id,
      createdBy: principal.userId,
    });
    const repoint = await runRepointBatch({ migrationId, batchSize: 10 });
    expect(repoint).toMatchObject({ status: "completed", migratedCount: 1, failedCount: 0 });
    const [repointedPage] = await db.select().from(pages).where(eq(pages.id, page.id));
    const [repointedContent] = await db.select().from(pageContent).where(eq(pageContent.id, repointedPage.currentContentId!));
    expect(repointedContent.storageProfileId).toBe(secondProfile.id);
    expect(await db.select().from(pageContent).where(eq(pageContent.storageProfileId, profile.id))).toHaveLength(1);

    await db.delete(storageMigration).where(eq(storageMigration.id, migrationId));
    migrationId = await createPurgeMigration({
      storageMode: "external",
      confirmed: true,
      createdBy: principal.userId,
      organizationId: principal.organizationId,
    });
    const purge = await runPurgeBatch({ migrationId, batchSize: 10 });
    expect(purge).toMatchObject({
      status: "completed",
      processedCount: 2,
      migratedCount: 2,
      failedCount: 0,
    });
    const [purgedPage] = await db.select().from(pages).where(eq(pages.id, page.id));
    const [purgedVersion] = await db.select().from(pageVersion).where(eq(pageVersion.id, version.id));
    expect(purgedPage.contentHtml).toBeNull();
    expect(purgedVersion.contentHtml).toBeNull();
  });
});
