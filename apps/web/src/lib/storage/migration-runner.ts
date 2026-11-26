import { StorageError, type StorageErrorCode } from "./errors";

export type MigrationSourceType = "page" | "version" | "content" | "object";

export type MigrationCandidate = {
  cursor: string;
  sourceType: MigrationSourceType;
  sourceId: string;
  organizationId: string;
  html: string;
};

export type MigrationCheckpoint = {
  cursor: string;
  processed: number;
  migrated: number;
  failed: number;
  bytes: number;
};

type MigrationBatchDependencies = {
  batchSize: number;
  after: string | null;
  load: (after: string | null, limit: number) => Promise<MigrationCandidate[]>;
  process: (candidate: MigrationCandidate) => Promise<{ bytes: number; migrated: boolean }>;
  checkpoint: (checkpoint: MigrationCheckpoint) => Promise<void> | void;
  recordFailure: (
    candidate: MigrationCandidate,
    errorCode: StorageErrorCode,
  ) => Promise<void> | void;
  finish: (
    status: "completed" | "completed_with_failures",
  ) => Promise<void> | void;
};

export type MigrationBatchResult = {
  processed: number;
  migrated: number;
  failed: number;
  bytes: number;
  done: boolean;
};

function failureCode(error: unknown): StorageErrorCode {
  return error instanceof StorageError ? error.code : "storage_unavailable";
}

export async function runMigrationBatch(
  dependencies: MigrationBatchDependencies,
): Promise<MigrationBatchResult> {
  if (!Number.isInteger(dependencies.batchSize) || dependencies.batchSize < 1 || dependencies.batchSize > 500) {
    throw new Error("batchSize must be an integer between 1 and 500");
  }

  const candidates = await dependencies.load(dependencies.after, dependencies.batchSize);
  const result: MigrationBatchResult = {
    processed: 0,
    migrated: 0,
    failed: 0,
    bytes: 0,
    done: candidates.length < dependencies.batchSize,
  };

  for (const candidate of candidates) {
    try {
      const outcome = await dependencies.process(candidate);
      result.migrated += outcome.migrated ? 1 : 0;
      result.bytes += outcome.bytes;
    } catch (error) {
      result.failed += 1;
      await dependencies.recordFailure(candidate, failureCode(error));
    }
    result.processed += 1;
    await dependencies.checkpoint({
      cursor: candidate.cursor,
      processed: result.processed,
      migrated: result.migrated,
      failed: result.failed,
      bytes: result.bytes,
    });
  }

  if (result.done) {
    await dependencies.finish(
      result.failed > 0 ? "completed_with_failures" : "completed",
    );
  }
  return result;
}
