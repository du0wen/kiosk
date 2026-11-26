import { describe, expect, it } from "vitest";
import { OperationsLogger } from "./logger";
import { MemoryOperationsSink, OperationsSinkError, type OperationsSink } from "./sinks";

describe("OperationsLogger", () => {
  it("validates, envelopes, and sends an event", async () => {
    const sink = new MemoryOperationsSink();
    const logger = new OperationsLogger({
      releaseId: "release-logger",
      sink,
      now: () => new Date("2026-09-21T07:00:00.000Z"),
    });

    await logger.emit({
      name: "unexpected.error",
      routeCategory: "console",
      errorCode: "internal",
    });

    expect(sink.events).toEqual([expect.objectContaining({
      schemaVersion: 1,
      timestamp: "2026-09-21T07:00:00.000Z",
      severity: "error",
      releaseId: "release-logger",
      name: "unexpected.error",
      errorCode: "internal",
    })]);
  });

  it("swallows sink failure and writes exactly one sanitized fallback event", async () => {
    const sink: OperationsSink = { write: async () => { throw new Error("provider token secret"); } };
    const fallback = new MemoryOperationsSink();
    const logger = new OperationsLogger({
      releaseId: "release-logger",
      sink,
      fallbackSink: fallback,
      now: () => new Date("2026-09-21T07:00:00.000Z"),
    });

    await expect(logger.emit({ name: "backup.failed", errorCode: "backup_stale" })).resolves.toBeUndefined();
    expect(fallback.events).toEqual([expect.objectContaining({
      name: "operations.sink_failed",
      severity: "error",
      errorCode: "operations_sink_unavailable",
    })]);
    expect(JSON.stringify(fallback.events)).not.toContain("provider token secret");
  });

  it("does not recurse when the fallback sink also fails", async () => {
    const failing: OperationsSink = { write: async () => { throw new OperationsSinkError(); } };
    const logger = new OperationsLogger({
      releaseId: "release-logger",
      sink: failing,
      fallbackSink: failing,
    });
    await expect(logger.emit({ name: "sink.smoke", requestId: "req_once" })).resolves.toBeUndefined();
  });
});
