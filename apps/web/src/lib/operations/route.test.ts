import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withObservedRoute } from "./route";
import type { OperationEvent } from "./events";
import { MemoryOperationsSink } from "./sinks";
import { OperationsLogger } from "./logger";

describe("withObservedRoute", () => {
  it("attaches X-Request-Id to response and emits request.completed", async () => {
    const sink = new MemoryOperationsSink();
    const logger = new OperationsLogger({ releaseId: "test-release", sink });

    const handler = async (req: NextRequest) => {
      return NextResponse.json({ ok: true });
    };

    const wrapped = withObservedRoute("rest", handler, { logger });
    const req = new NextRequest("http://localhost:3000/api/v1/pages", {
      method: "GET",
    });

    const res = await wrapped(req);

    expect(res.status).toBe(200);
    const reqId = res.headers.get("x-request-id");
    expect(reqId).toBeTruthy();
    expect(reqId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);

    expect(sink.events.length).toBe(1);
    const event = sink.events[0] as OperationEvent;
    expect(event.name).toBe("request.completed");
    if (event.name === "request.completed") {
      expect(event.routeCategory).toBe("rest");
      expect(event.method).toBe("GET");
      expect(event.status).toBe(200);
      expect(event.requestId).toBe(reqId);
      expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("propagates existing valid X-Request-Id from incoming request", async () => {
    const sink = new MemoryOperationsSink();
    const logger = new OperationsLogger({ releaseId: "test-release", sink });

    const wrapped = withObservedRoute("mcp", async () => NextResponse.json({}), {
      logger,
    });
    const req = new NextRequest("http://localhost:3000/mcp", {
      method: "POST",
      headers: { "x-request-id": "client-req-12345" },
    });

    const res = await wrapped(req);
    expect(res.headers.get("x-request-id")).toBe("client-req-12345");

    const event = sink.events[0];
    expect(event.name).toBe("request.completed");
    if (event.name === "request.completed") {
      expect(event.requestId).toBe("client-req-12345");
      expect(event.routeCategory).toBe("mcp");
    }
  });

  it("catches unhandled exceptions, returns 500 without leaking stack, and emits unexpected.error", async () => {
    const sink = new MemoryOperationsSink();
    const logger = new OperationsLogger({ releaseId: "test-release", sink });

    const wrapped = withObservedRoute(
      "rest",
      async () => {
        throw new Error("Sensitive database connection password failed");
      },
      { logger },
    );

    const req = new NextRequest("http://localhost:3000/api/v1/pages", {
      method: "POST",
    });

    const res = await wrapped(req);
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBeTruthy();

    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("Sensitive database");

    // Expect unexpected.error and request.completed events
    const unexpected = sink.events.find((e) => e.name === "unexpected.error");
    const completed = sink.events.find((e) => e.name === "request.completed");

    expect(unexpected).toBeDefined();
    expect(completed).toBeDefined();
    if (completed && completed.name === "request.completed") {
      expect(completed.status).toBe(500);
      expect(completed.errorCode).toBe("internal");
    }
  });

  it("threads hashed organization context when available", async () => {
    const sink = new MemoryOperationsSink();
    const logger = new OperationsLogger({ releaseId: "test-release", sink });
    const dummyOrgHash = "0".repeat(64);

    const wrapped = withObservedRoute(
      "rest",
      async (req, ctx) => {
        ctx.setOrganizationHash(dummyOrgHash);
        return NextResponse.json({ success: true });
      },
      { logger },
    );

    const req = new NextRequest("http://localhost:3000/api/v1/pages");
    const res = await wrapped(req);
    expect(res.status).toBe(200);

    const event = sink.events[0];
    if (event.name === "request.completed") {
      expect(event.organizationHash).toBe(dummyOrgHash);
    }
  });
});
