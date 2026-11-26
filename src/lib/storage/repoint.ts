import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  pageContent,
  pages,
  pageVersion,
  storageMigration,
  storageMigrationFailure,
} from "@/db/schema";
import { contentDigest } from "./content-store";
import { StorageError } from "./errors";
import { createContentStoreForProfile } from "./registry";
import { getStorageProfileWithCredentials } from "./storage-profiles";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRepointArgs(args: string[]): {
  command: "repoint";
  sourceProfileId: string | null;
  targetProfileId: string | null;
  resumeId: string | null;
  batchSize: number;
  maxBatches: number;
} {
  if (args[0] !== "repoint") throw new Error("Expected repoint");
  let sourceProfileId: string | null = null;
  let targetProfileId: string | null = null;
  let resumeId: string | null = null;
  let batchSize = 100;
  let maxBatches = 1;
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--source") sourceProfileId = args[++index] ?? null;
    else if (value === "--target") targetProfileId = args[++index] ?? null;
    else if (value === "--resume") resumeId = args[++index] ?? null;
    else if (value === "--batch-size") batchSize = Number(args[++index]);
    else if (value === "--max-batches") maxBatches = Number(args[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  for (const [name, id] of [["--source", sourceProfileId], ["--target", targetProfileId], ["--resume", resumeId]] as const) {
    if (id && !UUID_PATTERN.test(id)) throw new Error(`${name} must be a UUID`);
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("--batch-size must be between 1 and 500");
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 10_000) throw new Error("--max-batches is invalid");
  if (resumeId && (sourceProfileId || targetProfileId)) throw new Error("Use --resume without --source or --target");
  if (!resumeId && !sourceProfileId) throw new Error("repoint requires --source");
  if (!resumeId && !targetProfileId) throw new Error("repoint requires --target");
  if (sourceProfileId && sourceProfileId === targetProfileId) throw new Error("Source and target must be different");
  return { command: "repoint", sourceProfileId, targetProfileId, resumeId, batchSize, maxBatches };
}

export async function createRepointMigration(input: {
  sourceProfileId: string;
  targetProfileId: string;
  createdBy?: string;
}): Promise<string> {
  if (input.sourceProfileId === input.targetProfileId) {
    throw new StorageError("invalid_configuration", "Source and target profiles must differ");
  }
  const [source, target] = await Promise.all([
    getStorageProfileWithCredentials(input.sourceProfileId),
    getStorageProfileWithCredentials(input.targetProfileId),
  ]);
  if (!source) throw new StorageError("profile_not_found", "Source profile not found");
  if (!target || !target.enabled || target.status !== "healthy") {
    throw new StorageError("profile_unhealthy", "Target profile must be healthy and enabled");
  }
  const [run] = await db.insert(storageMigration).values({
    kind: "repoint",
    sourceProfileId: source.id,
    targetProfileId: target.id,
    createdBy: input.createdBy,
    options: { verification: "full", retainSource: true },
  }).returning({ id: storageMigration.id });
  return run.id;
}

export async function runRepointBatch(input: { migrationId: string; batchSize: number }) {
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 500) {
    throw new StorageError("invalid_configuration", "Invalid repoint batch size");
  }
  const [run] = await db.select().from(storageMigration).where(eq(storageMigration.id, input.migrationId)).limit(1);
  if (!run || run.kind !== "repoint" || !run.sourceProfileId || !run.targetProfileId) {
    throw new StorageError("invalid_configuration", "Repoint migration not found");
  }
  if (run.status === "completed" || run.status === "completed_with_failures") {
    return { migrationId: run.id, status: run.status, processedCount: run.processedCount, migratedCount: run.migratedCount, failedCount: run.failedCount, totalBytes: run.totalBytes, cursor: run.cursor, done: true };
  }
  const [source, target] = await Promise.all([
    getStorageProfileWithCredentials(run.sourceProfileId),
    getStorageProfileWithCredentials(run.targetProfileId),
  ]);
  if (!source) throw new StorageError("profile_not_found", "Source profile not found");
  if (!target || !target.enabled || target.status !== "healthy") throw new StorageError("profile_unhealthy", "Target profile is unavailable");
  const [sourceStore, targetStore] = await Promise.all([
    createContentStoreForProfile(source),
    createContentStoreForProfile(target),
  ]);
  const conditions = [eq(pageContent.storageProfileId, run.sourceProfileId)];
  if (run.cursor) conditions.push(gt(pageContent.id, run.cursor));
  const candidates = await db.select().from(pageContent).where(and(...conditions)).orderBy(asc(pageContent.id)).limit(input.batchSize);
  let migrated = 0;
  let failed = 0;
  let processed = 0;
  let bytes = 0;
  let cursor = run.cursor;
  for (const candidate of candidates) {
    processed += 1;
    cursor = candidate.id;
    try {
      const body = await sourceStore.get(candidate.objectKey);
      if (!body || body.byteLength !== candidate.sizeBytes || contentDigest(body) !== candidate.contentHash) {
        throw new StorageError("object_conflict", "Source object verification failed");
      }
      await targetStore.put({ key: candidate.objectKey, body, contentHash: candidate.contentHash, contentType: "application/octet-stream" });
      const targetMetadata = await targetStore.head(candidate.objectKey);
      if (!targetMetadata || targetMetadata.sizeBytes !== candidate.sizeBytes) throw new StorageError("object_conflict", "Target object verification failed");
      if (targetMetadata.contentHash !== undefined && targetMetadata.contentHash !== candidate.contentHash) throw new StorageError("object_conflict", "Target object hash mismatch");
      if (targetMetadata.contentHash === undefined) {
        const targetBody = await targetStore.get(candidate.objectKey);
        if (!targetBody || contentDigest(targetBody) !== candidate.contentHash) throw new StorageError("object_conflict", "Target object verification failed");
      }
      const updated = await db.transaction(async (tx) => {
        await tx.insert(pageContent).values({
          organizationId: candidate.organizationId,
          storageProfileId: run.targetProfileId!,
          objectKey: candidate.objectKey,
          contentHash: candidate.contentHash,
          sizeBytes: candidate.sizeBytes,
        }).onConflictDoNothing({ target: [pageContent.organizationId, pageContent.storageProfileId, pageContent.contentHash] });
        const [targetContent] = await tx.select({ id: pageContent.id }).from(pageContent).where(and(
          eq(pageContent.organizationId, candidate.organizationId),
          eq(pageContent.storageProfileId, run.targetProfileId!),
          eq(pageContent.contentHash, candidate.contentHash),
        )).limit(1);
        if (!targetContent) throw new StorageError("storage_unavailable", "Target metadata missing");
        const current = await tx.update(pages).set({ currentContentId: targetContent.id }).where(eq(pages.currentContentId, candidate.id)).returning({ id: pages.id });
        const versions = await tx.update(pageVersion).set({ contentId: targetContent.id }).where(eq(pageVersion.contentId, candidate.id)).returning({ id: pageVersion.id });
        return current.length + versions.length;
      });
      if (updated > 0) {
        migrated += 1;
        bytes += candidate.sizeBytes;
      }
    } catch (error) {
      failed += 1;
      const errorCode = error instanceof StorageError ? error.code : "storage_unavailable";
      await db.insert(storageMigrationFailure).values({ migrationId: run.id, sourceType: "content", sourceId: candidate.id, errorCode }).onConflictDoUpdate({
        target: [storageMigrationFailure.migrationId, storageMigrationFailure.sourceType, storageMigrationFailure.sourceId],
        set: { errorCode, attempts: sql`${storageMigrationFailure.attempts} + 1`, lastAttemptAt: new Date() },
      });
    }
    await db.update(storageMigration).set({
      status: "running",
      startedAt: run.startedAt ?? new Date(),
      cursor,
      processedCount: run.processedCount + processed,
      migratedCount: run.migratedCount + migrated,
      failedCount: run.failedCount + failed,
      totalBytes: run.totalBytes + bytes,
      updatedAt: new Date(),
    }).where(eq(storageMigration.id, run.id));
  }
  const done = candidates.length < input.batchSize;
  const status = done ? (failed > 0 ? "completed_with_failures" : "completed") : "running";
  if (done) await db.update(storageMigration).set({ status, completedAt: new Date(), updatedAt: new Date() }).where(eq(storageMigration.id, run.id));
  return {
    migrationId: run.id,
    status,
    processedCount: run.processedCount + candidates.length,
    migratedCount: run.migratedCount + migrated,
    failedCount: run.failedCount + failed,
    totalBytes: run.totalBytes + bytes,
    cursor,
    done,
  };
}
