import { describe, expect, it } from "vitest";
import { parseStorageMigrationArgs } from "./migration-cli";

describe("storage migration CLI arguments", () => {
  it("parses a bounded new backfill run", () => {
    expect(parseStorageMigrationArgs([
      "backfill",
      "--target",
      "018f4f2a-6d80-7000-8000-000000000001",
      "--batch-size",
      "50",
      "--max-batches",
      "4",
    ])).toEqual({
      command: "backfill",
      targetProfileId: "018f4f2a-6d80-7000-8000-000000000001",
      resumeId: null,
      batchSize: 50,
      maxBatches: 4,
      dryRun: false,
    });
  });

  it("allows dry-run without a target and resume without creating a run", () => {
    expect(parseStorageMigrationArgs(["backfill", "--dry-run"])).toMatchObject({
      dryRun: true,
      targetProfileId: null,
    });
    expect(parseStorageMigrationArgs([
      "backfill",
      "--resume",
      "018f4f2a-6d80-7000-8000-000000000002",
    ])).toMatchObject({
      resumeId: "018f4f2a-6d80-7000-8000-000000000002",
      targetProfileId: null,
    });
  });

  it("rejects unsafe or ambiguous invocations", () => {
    expect(() => parseStorageMigrationArgs(["backfill"])).toThrow("--target");
    expect(() => parseStorageMigrationArgs(["backfill", "--target", "bad"])).toThrow("UUID");
    expect(() => parseStorageMigrationArgs(["backfill", "--target", "018f4f2a-6d80-7000-8000-000000000001", "--batch-size", "0"])).toThrow("batch-size");
    expect(() => parseStorageMigrationArgs(["backfill", "--target", "018f4f2a-6d80-7000-8000-000000000001", "--resume", "018f4f2a-6d80-7000-8000-000000000002"])).toThrow("either");
  });

  it("requires an exact destructive confirmation for a new purge", () => {
    expect(parseStorageMigrationArgs(["purge", "--dry-run"])).toMatchObject({
      command: "purge",
      dryRun: true,
      confirmed: false,
    });
    expect(() => parseStorageMigrationArgs(["purge"])).toThrow("PURGE_DATABASE_HTML");
    expect(() => parseStorageMigrationArgs(["purge", "--confirm", "yes"])).toThrow("PURGE_DATABASE_HTML");
    expect(parseStorageMigrationArgs(["purge", "--confirm", "PURGE_DATABASE_HTML"])).toMatchObject({
      command: "purge",
      confirmed: true,
    });
  });
});
