import "dotenv/config";
import { inspectBackfill, createBackfillMigration, runBackfillBatch } from "../src/lib/storage/backfill";
import { parseStorageMigrationArgs } from "../src/lib/storage/migration-cli";
import { StorageError } from "../src/lib/storage/errors";
import { createPurgeMigration, inspectPurge, runPurgeBatch } from "../src/lib/storage/purge";
import { parseOrphanCleanupArgs, scanOrphanObjects } from "../src/lib/storage/orphan-cleanup";
import { createRepointMigration, parseRepointArgs, runRepointBatch } from "../src/lib/storage/repoint";

async function main(): Promise<void> {
  if (process.argv[2] === "orphan-report" || process.argv[2] === "orphan-delete") {
    const orphanOptions = parseOrphanCleanupArgs(process.argv.slice(2));
    const result = await scanOrphanObjects(orphanOptions);
    process.stdout.write(`${JSON.stringify({ ok: true, command: orphanOptions.command, ...result })}\n`);
    return;
  }
  if (process.argv[2] === "repoint") {
    const repoint = parseRepointArgs(process.argv.slice(2));
    const migrationId = repoint.resumeId ?? await createRepointMigration({
      sourceProfileId: repoint.sourceProfileId!,
      targetProfileId: repoint.targetProfileId!,
    });
    let summary = null;
    for (let batch = 0; batch < repoint.maxBatches; batch += 1) {
      summary = await runRepointBatch({ migrationId, batchSize: repoint.batchSize });
      if (summary.done) break;
    }
    process.stdout.write(`${JSON.stringify({ ok: true, command: "repoint", ...summary })}\n`);
    return;
  }
  const options = parseStorageMigrationArgs(process.argv.slice(2));
  if (options.dryRun) {
    const inspection = options.command === "backfill"
      ? await inspectBackfill()
      : await inspectPurge();
    process.stdout.write(`${JSON.stringify({ ok: true, command: options.command, dryRun: true, ...inspection })}\n`);
    return;
  }

  const migrationId = options.resumeId ?? (options.command === "backfill"
    ? await createBackfillMigration({
        targetProfileId: options.targetProfileId!,
        verification: "full",
      })
    : await createPurgeMigration({
        storageMode: process.env.CONTENT_STORAGE_MODE,
        confirmed: options.confirmed,
      }));
  let summary = null;
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    summary = options.command === "backfill"
      ? await runBackfillBatch({ migrationId, batchSize: options.batchSize })
      : await runPurgeBatch({ migrationId, batchSize: options.batchSize });
    if (summary.batch.done) break;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: options.command, ...summary })}\n`);
}

main().catch((error: unknown) => {
  const code = error instanceof StorageError ? error.code : "invalid_configuration";
  process.stdout.write(`${JSON.stringify({ ok: false, error: code })}\n`);
  process.exitCode = 1;
});
