const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BackfillCliOptions = {
  command: "backfill";
  targetProfileId: string | null;
  resumeId: string | null;
  batchSize: number;
  maxBatches: number;
  dryRun: boolean;
};

export type PurgeCliOptions = {
  command: "purge";
  resumeId: string | null;
  batchSize: number;
  maxBatches: number;
  dryRun: boolean;
  confirmed: boolean;
};

export type StorageMigrationCliOptions = BackfillCliOptions | PurgeCliOptions;

function positiveInteger(name: string, value: string | undefined, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function uuid(name: string, value: string | undefined): string {
  if (!value || !UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID`);
  return value;
}

export function parseStorageMigrationArgs(args: string[]): StorageMigrationCliOptions {
  const command = args[0];
  if (command !== "backfill" && command !== "purge") {
    throw new Error("Expected the backfill or purge command");
  }
  let targetProfileId: string | null = null;
  let resumeId: string | null = null;
  let batchSize = 100;
  let maxBatches = 1;
  let dryRun = false;
  let confirmed = false;

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--dry-run") {
      dryRun = true;
    } else if (value === "--confirm") {
      if (args[++index] !== "PURGE_DATABASE_HTML") {
        throw new Error("--confirm must equal PURGE_DATABASE_HTML");
      }
      confirmed = true;
    } else if (value === "--target") {
      targetProfileId = uuid("--target", args[++index]);
    } else if (value === "--resume") {
      resumeId = uuid("--resume", args[++index]);
    } else if (value === "--batch-size") {
      batchSize = positiveInteger("--batch-size", args[++index], 500);
    } else if (value === "--max-batches") {
      maxBatches = positiveInteger("--max-batches", args[++index], 10_000);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (command === "purge") {
    if (targetProfileId) throw new Error("The purge command does not accept --target");
    if (!dryRun && !resumeId && !confirmed) {
      throw new Error("A new purge requires --confirm PURGE_DATABASE_HTML");
    }
    return { command, resumeId, batchSize, maxBatches, dryRun, confirmed };
  }
  if (confirmed) throw new Error("The backfill command does not accept --confirm");
  if (targetProfileId && resumeId) throw new Error("Use either --target or --resume, not both");
  if (!dryRun && !targetProfileId && !resumeId) {
    throw new Error("A new backfill requires --target");
  }
  return { command, targetProfileId, resumeId, batchSize, maxBatches, dryRun };
}
