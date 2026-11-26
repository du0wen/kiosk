import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  pages,
  pageVersion,
  storageMigration,
  storageMigrationFailure,
} from "@/db/schema";
import { ContentRepository } from "./content-repository";
import { StorageError, type StorageErrorCode } from "./errors";
import {
  formatBackfillCursor,
  parseBackfillCursor,
  type BackfillSummary,
} from "./backfill";
import { runMigrationBatch, type MigrationCandidate } from "./migration-runner";

type PurgeCandidate = MigrationCandidate & { contentId: string };

async function loadPurgeCandidates(
  after: string | null,
  limit: number,
  organizationId?: string,
): Promise<PurgeCandidate[]> {
  const cursor = after ? parseBackfillCursor(after) : null;
  const result: PurgeCandidate[] = [];
  if (!cursor || cursor.sourceType === "page") {
    const conditions = [isNotNull(pages.contentHtml), isNotNull(pages.currentContentId)];
    if (organizationId) conditions.push(eq(pages.organizationId, organizationId));
    if (cursor?.sourceType === "page") conditions.push(gt(pages.id, cursor.sourceId));
    const rows = await db
      .select({
        sourceId: pages.id,
        organizationId: pages.organizationId,
        html: pages.contentHtml,
        contentId: pages.currentContentId,
      })
      .from(pages)
      .where(and(...conditions))
      .orderBy(asc(pages.id))
      .limit(limit);
    result.push(...rows.flatMap((row) => row.html && row.contentId ? [{
      cursor: formatBackfillCursor("page", row.sourceId),
      sourceType: "page" as const,
      sourceId: row.sourceId,
      organizationId: row.organizationId,
      html: row.html,
      contentId: row.contentId,
    }] : []));
  }
  if (result.length < limit) {
    const conditions = [isNotNull(pageVersion.contentHtml), isNotNull(pageVersion.contentId)];
    if (organizationId) conditions.push(eq(pages.organizationId, organizationId));
    if (cursor?.sourceType === "version") conditions.push(gt(pageVersion.id, cursor.sourceId));
    const rows = await db
      .select({
        sourceId: pageVersion.id,
        organizationId: pages.organizationId,
        html: pageVersion.contentHtml,
        contentId: pageVersion.contentId,
      })
      .from(pageVersion)
      .innerJoin(pages, eq(pageVersion.pageId, pages.id))
      .where(and(...conditions))
      .orderBy(asc(pageVersion.id))
      .limit(limit - result.length);
    result.push(...rows.flatMap((row) => row.html && row.contentId ? [{
      cursor: formatBackfillCursor("version", row.sourceId),
      sourceType: "version" as const,
      sourceId: row.sourceId,
      organizationId: row.organizationId,
      html: row.html,
      contentId: row.contentId,
    }] : []));
  }
  return result;
}

export async function inspectPurge(): Promise<{ candidateCount: number; candidateBytes: number }> {
  const [pageTotals] = await db.select({
    count: sql<number>`count(*)`,
    bytes: sql<number>`coalesce(sum(octet_length(${pages.contentHtml})), 0)`,
  }).from(pages).where(and(isNotNull(pages.contentHtml), isNotNull(pages.currentContentId)));
  const [versionTotals] = await db.select({
    count: sql<number>`count(*)`,
    bytes: sql<number>`coalesce(sum(octet_length(${pageVersion.contentHtml})), 0)`,
  }).from(pageVersion).where(and(isNotNull(pageVersion.contentHtml), isNotNull(pageVersion.contentId)));
  return {
    candidateCount: Number(pageTotals?.count ?? 0) + Number(versionTotals?.count ?? 0),
    candidateBytes: Number(pageTotals?.bytes ?? 0) + Number(versionTotals?.bytes ?? 0),
  };
}

export async function createPurgeMigration(input: {
  storageMode: string | undefined;
  confirmed: boolean;
  createdBy?: string;
  organizationId?: string;
}): Promise<string> {
  if (input.storageMode !== "external") {
    throw new StorageError("invalid_configuration", "Database HTML purge requires external mode");
  }
  if (!input.confirmed) {
    throw new StorageError("invalid_configuration", "Database HTML purge requires confirmation");
  }
  const [run] = await db.insert(storageMigration).values({
    kind: "purge",
    createdBy: input.createdBy,
    options: {
      externalVerified: true,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    },
  }).returning({ id: storageMigration.id });
  return run.id;
}

export async function runPurgeBatch(input: {
  migrationId: string;
  batchSize: number;
}): Promise<BackfillSummary> {
  const [run] = await db.select().from(storageMigration)
    .where(eq(storageMigration.id, input.migrationId)).limit(1);
  if (!run || run.kind !== "purge" || run.options.externalVerified !== true) {
    throw new StorageError("invalid_configuration", "Purge migration was not found or confirmed");
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
  const repository = new ContentRepository({ mode: "external" });
  const organizationId = typeof run.options.organizationId === "string"
    ? run.options.organizationId
    : undefined;
  const now = new Date();
  await db.update(storageMigration).set({
    status: "running",
    startedAt: run.startedAt ?? now,
    updatedAt: now,
    lastErrorCode: null,
  }).where(eq(storageMigration.id, run.id));

  const batch = await runMigrationBatch({
    batchSize: input.batchSize,
    after: run.cursor,
    load: (after, limit) => loadPurgeCandidates(after, limit, organizationId),
    process: async (candidate) => {
      const purge = candidate as PurgeCandidate;
      const loaded = await repository.read({
        organizationId: purge.organizationId,
        contentId: purge.contentId,
        legacyHtml: null,
      });
      if (loaded !== purge.html) {
        throw new StorageError("object_conflict", "External content differs from legacy HTML");
      }
      const result = purge.sourceType === "page"
        ? await db.update(pages).set({ contentHtml: null }).where(and(
            eq(pages.id, purge.sourceId),
            eq(pages.currentContentId, purge.contentId),
            eq(pages.contentHtml, purge.html),
          )).returning({ id: pages.id })
        : await db.update(pageVersion).set({ contentHtml: null }).where(and(
            eq(pageVersion.id, purge.sourceId),
            eq(pageVersion.contentId, purge.contentId),
            eq(pageVersion.contentHtml, purge.html),
          )).returning({ id: pageVersion.id });
      return { bytes: result.length === 1 ? Buffer.byteLength(purge.html) : 0, migrated: result.length === 1 };
    },
    recordFailure: async (candidate, errorCode: StorageErrorCode) => {
      await db.insert(storageMigrationFailure).values({
        migrationId: run.id,
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        errorCode,
      }).onConflictDoUpdate({
        target: [storageMigrationFailure.migrationId, storageMigrationFailure.sourceType, storageMigrationFailure.sourceId],
        set: { errorCode, attempts: sql`${storageMigrationFailure.attempts} + 1`, lastAttemptAt: new Date() },
      });
    },
    checkpoint: async (checkpoint) => {
      await db.update(storageMigration).set({
        cursor: checkpoint.cursor,
        processedCount: run.processedCount + checkpoint.processed,
        migratedCount: run.migratedCount + checkpoint.migrated,
        failedCount: run.failedCount + checkpoint.failed,
        totalBytes: run.totalBytes + checkpoint.bytes,
        updatedAt: new Date(),
      }).where(eq(storageMigration.id, run.id));
    },
    finish: async (status) => {
      await db.update(storageMigration).set({ status, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(storageMigration.id, run.id));
    },
  });
  const [updated] = await db.select().from(storageMigration)
    .where(eq(storageMigration.id, run.id)).limit(1);
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
