import { describe, expect, it, vi } from "vitest";
import { runMigrationBatch, type MigrationCandidate } from "./migration-runner";

const candidates: MigrationCandidate[] = [
  { cursor: "page:a", sourceType: "page", sourceId: "a", organizationId: "org", html: "A" },
  { cursor: "page:b", sourceType: "page", sourceId: "b", organizationId: "org", html: "B" },
];

describe("runMigrationBatch", () => {
  it("checkpoints every completed row and completes a short final batch", async () => {
    const checkpoint = vi.fn();
    const finish = vi.fn();
    const result = await runMigrationBatch({
      batchSize: 3,
      after: null,
      load: async () => candidates,
      process: async (candidate) => ({ bytes: candidate.html.length, migrated: true }),
      checkpoint,
      recordFailure: vi.fn(),
      finish,
    });

    expect(checkpoint.mock.calls.map(([value]) => value.cursor)).toEqual(["page:a", "page:b"]);
    expect(finish).toHaveBeenCalledWith("completed");
    expect(result).toEqual({ processed: 2, migrated: 2, failed: 0, bytes: 2, done: true });
  });

  it("records a sanitized row failure, advances the cursor, and continues", async () => {
    const checkpoint = vi.fn();
    const recordFailure = vi.fn();
    const finish = vi.fn();
    const result = await runMigrationBatch({
      batchSize: 3,
      after: null,
      load: async () => candidates,
      process: async (candidate) => {
        if (candidate.sourceId === "a") throw new Error("provider secret");
        return { bytes: 1, migrated: true };
      },
      checkpoint,
      recordFailure,
      finish,
    });

    expect(recordFailure).toHaveBeenCalledWith(candidates[0], "storage_unavailable");
    expect(checkpoint.mock.calls.map(([value]) => value.cursor)).toEqual(["page:a", "page:b"]);
    expect(finish).toHaveBeenCalledWith("completed_with_failures");
    expect(result.failed).toBe(1);
  });

  it("does not finalize a full batch so a resume can continue", async () => {
    const finish = vi.fn();
    const result = await runMigrationBatch({
      batchSize: 2,
      after: "prior",
      load: async (after, limit) => {
        expect(after).toBe("prior");
        expect(limit).toBe(2);
        return candidates;
      },
      process: async () => ({ bytes: 1, migrated: false }),
      checkpoint: vi.fn(),
      recordFailure: vi.fn(),
      finish,
    });
    expect(finish).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
    expect(result.migrated).toBe(0);
  });

  it("rejects unbounded batch sizes", async () => {
    await expect(runMigrationBatch({
      batchSize: 0,
      after: null,
      load: vi.fn(),
      process: vi.fn(),
      checkpoint: vi.fn(),
      recordFailure: vi.fn(),
      finish: vi.fn(),
    })).rejects.toThrow("batchSize");
    await expect(runMigrationBatch({
      batchSize: 501,
      after: null,
      load: vi.fn(),
      process: vi.fn(),
      checkpoint: vi.fn(),
      recordFailure: vi.fn(),
      finish: vi.fn(),
    })).rejects.toThrow("batchSize");
  });
});
