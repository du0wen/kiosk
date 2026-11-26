import { describe, expect, it, vi } from "vitest";
import { SecretValue } from "@/lib/runtime-config";
import type { OperationEvent } from "./events";
import {
  HttpOperationsSink,
  MemoryOperationsSink,
  OperationsSinkError,
  StdoutOperationsSink,
} from "./sinks";

const event: OperationEvent = {
  schemaVersion: 1,
  timestamp: "2026-09-21T06:00:00.000Z",
  severity: "info",
  releaseId: "release-1",
  name: "sink.smoke",
  requestId: "req_smoke",
};

describe("operations sinks", () => {
  it("writes compact single-line JSON to stdout", async () => {
    const write = vi.fn();
    await new StdoutOperationsSink(write).write(event);
    expect(write).toHaveBeenCalledOnce();
    const line = write.mock.calls[0][0] as string;
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
    expect(JSON.parse(line)).toEqual(event);
  });

  it("keeps deterministic events in the memory adapter", async () => {
    const sink = new MemoryOperationsSink();
    await sink.write(event);
    expect(sink.events).toEqual([event]);
    expect(() => { (sink.events as OperationEvent[]).push(event); }).toThrow();
  });

  it("revalidates envelopes at the adapter boundary", async () => {
    const sink = new MemoryOperationsSink();
    await expect(sink.write({ ...event, html: "<h1>secret</h1>" } as OperationEvent))
      .rejects.toThrow();
    expect(sink.events).toEqual([]);
  });

  it("posts a bounded request without reading provider response bodies", async () => {
    const fetcher = vi.fn(async () => new Response("provider secret", { status: 202 }));
    const sink = new HttpOperationsSink({
      endpoint: "https://events.example/ingest",
      token: new SecretValue("sink-secret"),
      timeoutMs: 1500,
      fetcher,
    });

    await sink.write(event);

    expect(fetcher).toHaveBeenCalledWith("https://events.example/ingest", expect.objectContaining({
      method: "POST",
      redirect: "error",
      headers: {
        authorization: "Bearer sink-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
      signal: expect.any(AbortSignal),
    }));
  });

  it("maps non-2xx and transport failures to one sanitized error", async () => {
    const rejected = new HttpOperationsSink({
      endpoint: "https://events.example/ingest",
      timeoutMs: 100,
      fetcher: vi.fn(async () => new Response("do-not-log-this", { status: 500 })),
    });
    const failed = new HttpOperationsSink({
      endpoint: "https://events.example/ingest",
      timeoutMs: 100,
      fetcher: vi.fn(async () => { throw new Error("provider-secret-body"); }),
    });

    await expect(rejected.write(event)).rejects.toEqual(new OperationsSinkError());
    await expect(failed.write(event)).rejects.toEqual(new OperationsSinkError());
    await expect(failed.write(event)).rejects.not.toThrow(/provider-secret-body/);
  });
});
