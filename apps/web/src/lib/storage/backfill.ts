import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  pageContent,
  pages,
  pageVersion,
  storageMigration,
  storageMigrationFailure,
} from "@/db/schema";
import { contentDigest, MAX_STORED_CONTENT_BYTES, type ContentStore } from "./content-store";
import { StorageError, type StorageErrorCode } from "./errors";
import { runMigrationBatch, type MigrationCandidate } from "./migration-runner";
import { createContentStoreForProfile } from "./registry";
import { getStorageProfileWithCredentials } from "./storage-profiles";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BackfillCursor = {
  sourceType: "page" | "version";
  sourceId: string;
};

export type BackfillSummary = {
  migrationId: string;
  status: string;
  cursor: string | null;
  processedCount: number;
  migratedCount: number;
  failedCount: number;
  totalBytes: number;
  batch: {
    processed: number;
    migrated: number;
    failed: number;
    bytes: number;
    done: boolean;
  };
};

export function formatBackfillCursor(
  sourceType: BackfillCursor["sourceType"],
  sourceId: string,
): string {
  if (!UUID_PATTERN.test(sourceId)) throw new Error("Invalid backfill cursor");
  return `${sourceType}:${sourceId}`;
}

export function parseBackfillCursor(value: string): BackfillCursor {
  const [sourceType, sourceId, extra] = value.split(":");
  if (
    extra !== undefined ||
    (sourceType !== "page" && sourceType !== "version") ||
    !UUID_PATTERN.test(sourceId ?? "")
  ) {
    throw new Error("Invalid backfill cursor");
  }
  return { sourceType, sourceId };
}

async function loadBackfillCandidates(
  after: string | null,
  limit: number,
  organizationId?: string,
): Promise<MigrationCandidate[]> {
  const cursor = after ? parseBackfillCursor(after) : null;
  const result: MigrationCandidate[] = [];

  if (!cursor || cursor.sourceType === "page") {
    const pageWhere = [isNotNull(pages.contentHtml), isNull(pages.currentContentId)];
    if (organizationId) pageWhere.push(eq(pages.organizationId, organizationId));
    if (cursor?.sourceType === "page") pageWhere.push(gt(pages.id, cursor.sourceId));
    const rows = await db
      .select({
        sourceId: pages.id,
        organizationId: pages.organizationId,
        html: pages.contentHtml,
      })
      .from(pages)
      .where(and(...pageWhere))
      .orderBy(asc(pages.id))
      .limit(limit);
    result.push(...rows.flatMap((row) => row.html === null ? [] : [{
      cursor: formatBackfillCursor("page", row.sourceId),
      sourceType: "page" as const,
      sourceId: row.sourceId,
      organizationId: row.organizationId,
      html: row.html,
    }]));
  }

  if (result.length < limit) {
    const versionWhere = [isNotNull(pageVersion.contentHtml), isNull(pageVersion.contentId)];
    if (organizationId) versionWhere.push(eq(pages.organizationId, organizationId));
    if (cursor?.sourceType === "version") versionWhere.push(gt(pageVersion.id, cursor.sourceId));
    const rows = await db
      .select({
        sourceId: pageVersion.id,
        organizationId: pages.organizationId,
        html: pageVersion.contentHtml,
      })
      .from(pageVersion)
      .innerJoin(pages, eq(pageVersion.pageId, pages.id))
      .where(and(...versionWhere))
      .orderBy(asc(pageVersion.id))
      .limit(limit - result.length);
    result.push(...rows.flatMap((row) => row.html === null ? [] : [{
      cursor: formatBackfillCursor("version", row.sourceId),
      sourceType: "version" as const,
      sourceId: row.sourceId,
      organizationId: row.organizationId,
      html: row.html,
    }]));
  }
  return result;
}

async function putAndVerify(
  store: ContentStore,
  candidate: MigrationCandidate,
): Promise<{ objectKey: string; contentHash: string; sizeBytes: number }> {
  const body = new TextEncoder().encode(candidate.html);
  if (body.byteLength < 1 || body.byteLength > MAX_STORED_CONTENT_BYTES) {
    throw new StorageError("object_too_large", "Legacy content is outside the storage size boundary");
  }
  const contentHash = contentDigest(body);
  const objectKey = `organizations/${candidate.organizationId}/content/sha256/${contentHash}.html`;
  await store.put({ key: objectKey, body, contentHash, contentType: "application/octet-stream" });
  const metadata = await store.head(objectKey);
  if (!metadata || metadata.sizeBytes !== body.byteLength) {
    throw new StorageError("object_conflict", "Stored object size does not match");
  }
  if (metadata.contentHash !== undefined && metadata.contentHash !== contentHash) {
    throw new StorageError("object_conflict", "Stored object hash does not match");
  }
  if (metadata.contentHash === undefined) {
    const loaded = await store.get(objectKey);
    if (!loaded || contentDigest(loaded) !== contentHash) {
      throw new StorageError("object_conflict", "Stored object verification failed");
    }
  }
  return { objectKey, contentHash, sizeBytes: body.byteLength };
}

async function bindBackfilledContent(
  candidate: MigrationCandidate,
  targetProfileId: string,
  object: { objectKey: string; contentHash: string; sizeBytes: number },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .insert(pageContent)
      .values({
        organizationId: candidate.organizationId,
        storageProfileId: targetProfileId,
        objectKey: object.objectKey,
        contentHash: object.contentHash,
        sizeBytes: object.sizeBytes,
      })
      .onConflictDoNothing({
        target: [pageContent.organizationId, pageContent.storageProfileId, pageContent.contentHash],
      });
    const [content] = await tx
      .select({ id: pageContent.id })
      .from(pageContent)
      .where(and(
        eq(pageContent.organizationId, candidate.organizationId),
        eq(pageContent.storageProfileId, targetProfileId),
        eq(pageContent.contentHash, object.contentHash),
      ))
      .limit(1);
    if (!content) throw new StorageError("storage_unavailable", "Content metadata was not persisted");

    if (candidate.sourceType === "page") {
      const rows = await tx
        .update(pages)
        .set({ currentContentId: content.id })
        .where(and(eq(pages.id, candidate.sourceId), isNull(pages.currentContentId)))
        .returning({ id: pages.id });
      return rows.length === 1;
    }
    const rows = await tx
      .update(pageVersion)
      .set({ contentId: content.id })
      .where(and(eq(pageVersion.id, candidate.sourceId), isNull(pageVersion.contentId)))
      .returning({ id: pageVersion.id });
    return rows.length === 1;
  });
}

export async function inspectBackfill(): Promise<{ candidateCount: number; candidateBytes: number }> {
  const [pageTotals] = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(octet_length(${pages.contentHtml})), 0)`,
    })
    .from(pages)
    .where(and(isNotNull(pages.contentHtml), isNull(pages.currentContentId)));
  const [versionTotals] = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(octet_length(${pageVersion.contentHtml})), 0)`,
    })
    .from(pageVersion)
    .where(and(isNotNull(pageVersion.contentHtml), isNull(pageVersion.contentId)));
  return {
    candidateCount: Number(pageTotals?.count ?? 0) + Number(versionTotals?.count ?? 0),
    candidateBytes: Number(pageTotals?.bytes ?? 0) + Number(versionTotals?.bytes ?? 0),
  };
}

export async function createBackfillMigration(input: {
  targetProfileId: string;
  createdBy?: string;
  verification?: "full";
  organizationId?: string;
}): Promise<string> {
  const profile = await getStorageProfileWithCredentials(input.targetProfileId);
  if (!profile || !profile.enabled || profile.status !== "healthy") {
    throw new StorageError("profile_unhealthy", "Backfill target must be healthy and enabled");
  }
  const [run] = await db
    .insert(storageMigration)
    .values({
      kind: "backfill",
      targetProfileId: input.targetProfileId,
      createdBy: input.createdBy,
      options: {
        verification: input.verification ?? "full",
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
    })
    .returning({ id: storageMigration.id });
  return run.id;
}

export async function runBackfillBatch(input: {
  migrationId: string;
  batchSize: number;
}): Promise<BackfillSummary> {
  const [run] = await db
    .select()
    .from(storageMigration)
    .where(eq(storageMigration.id, input.migrationId))
    .limit(1);
  if (!run || run.kind !== "backfill" || !run.targetProfileId) {
    throw new StorageError("invalid_configuration", "Backfill migration was not found");
  }
  if (run.status === "completed" || run.status === "completed_with_failures") {
    return {
      migrationId: run.id,
      status: run.status,
      cursor: run.cursor,
      processedCount: run.processedCount,
      migratedCount: run.migratedCount,
      failedCount: run.failedCount,
      totalBytes: run.totalBytes,
      batch: { processed: 0, migrated: 0, failed: 0, bytes: 0, done: true },
    };
  }
  if (run.status === "failed") {
    throw new StorageError("invalid_configuration", "Failed migrations require a new run");
  }
  const profile = await getStorageProfileWithCredentials(run.targetProfileId);
  if (!profile || !profile.enabled || profile.status !== "healthy") {
    throw new StorageError("profile_unhealthy", "Backfill target must be healthy and enabled");
  }
  const store = await createContentStoreForProfile(profile);
  const organizationId = typeof run.options.organizationId === "string"
    ? run.options.organizationId
    : undefined;
  const startedAt = new Date();
  await db
    .update(storageMigration)
    .set({
      status: "running",
      startedAt: run.startedAt ?? startedAt,
      updatedAt: startedAt,
      lastErrorCode: null,
    })
    .where(eq(storageMigration.id, run.id));

  const batch = await runMigrationBatch({
    batchSize: input.batchSize,
    after: run.cursor,
    load: (after, limit) => loadBackfillCandidates(after, limit, organizationId),
    process: async (candidate) => {
      const object = await putAndVerify(store, candidate);
      const migrated = await bindBackfilledContent(candidate, run.targetProfileId!, object);
      return { bytes: migrated ? object.sizeBytes : 0, migrated };
    },
    recordFailure: async (candidate, errorCode: StorageErrorCode) => {
      await db
        .insert(storageMigrationFailure)
        .values({
          migrationId: run.id,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          errorCode,
        })
        .onConflictDoUpdate({
          target: [
            storageMigrationFailure.migrationId,
            storageMigrationFailure.sourceType,
            storageMigrationFailure.sourceId,
          ],
          set: {
            errorCode,
            attempts: sql`${storageMigrationFailure.attempts} + 1`,
            lastAttemptAt: new Date(),
          },
        });
    },
    checkpoint: async (checkpoint) => {
      await db
        .update(storageMigration)
        .set({
          cursor: checkpoint.cursor,
          processedCount: run.processedCount + checkpoint.processed,
          migratedCount: run.migratedCount + checkpoint.migrated,
          failedCount: run.failedCount + checkpoint.failed,
          totalBytes: run.totalBytes + checkpoint.bytes,
          updatedAt: new Date(),
        })
        .where(eq(storageMigration.id, run.id));
    },
    finish: async (status) => {
      await db
        .update(storageMigration)
        .set({ status, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(storageMigration.id, run.id));
    },
  });

  const [updated] = await db
    .select()
    .from(storageMigration)
    .where(eq(storageMigration.id, run.id))
    .limit(1);
  return {
    migrationId: updated.id,
    status: updated.status,
    cursor: updated.cursor,
    processedCount: updated.processedCount,
    migratedCount: updated.migratedCount,
    failedCount: updated.failedCount,
    totalBytes: updated.totalBytes,
    batch,
  };
}
