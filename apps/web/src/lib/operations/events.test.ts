import { describe, expect, it } from "vitest";
import {
  classifyOperationalError,
  createOperationEvent,
  parseOperationEnvelope,
  parseOperationEvent,
  type OperationEventInput,
} from "./events";

const context = {
  releaseId: "release-abc123",
  now: () => new Date("2026-09-21T06:00:00.000Z"),
};

describe("operation event contract", () => {
  it("creates an exact versioned request event", () => {
    const input: OperationEventInput = {
      name: "request.completed",
      requestId: "req_abc123",
      routeCategory: "rest",
      method: "POST",
      status: 201,
      latencyMs: 42,
      organizationHash: "a".repeat(64),
    };

    expect(createOperationEvent(input, context)).toEqual({
      schemaVersion: 1,
      timestamp: "2026-09-21T06:00:00.000Z",
      severity: "info",
      releaseId: "release-abc123",
      ...input,
    });
  });

  it("assigns severity from the closed catalog", () => {
    expect(createOperationEvent({
      name: "dependency.checked",
      dependency: "storage",
      dependencyStatus: "unavailable",
      latencyMs: 3000,
      errorCode: "storage_unavailable",
    }, context).severity).toBe("error");

    expect(createOperationEvent({
      name: "rate_limit.denied",
      requestId: "req_rate",
      routeCategory: "mcp",
      errorCode: "rate_limited",
    }, context).severity).toBe("warn");
  });

  it("validates a complete envelope and rejects severity drift", () => {
    const event = createOperationEvent({
      name: "sink.smoke",
      requestId: "req_envelope",
    }, context);
    expect(parseOperationEnvelope(event)).toEqual(event);
    expect(() => parseOperationEnvelope({ ...event, severity: "error" })).toThrow();
    expect(() => parseOperationEnvelope({ ...event, cookie: "session=secret" })).toThrow();
  });

  it("classifies only catalogued error codes", () => {
    expect(classifyOperationalError({ code: "storage_unavailable" })).toBe("storage_unavailable");
    expect(classifyOperationalError({ code: "provider_secret_failure" })).toBe("internal");
    expect(classifyOperationalError(new Error("Bearer kiosk_api_secret"))).toBe("internal");
  });

  it.each([
    { name: "request.completed", requestId: "req", routeCategory: "rest", method: "GET", status: 200, latencyMs: 1, html: "<h1>secret</h1>" },
    { name: "request.completed", requestId: "req", routeCategory: "rest", method: "GET", status: 200, latencyMs: 1, authorization: "Bearer kiosk_api_secret" },
    { name: "dependency.checked", dependency: "storage", dependencyStatus: "ok", latencyMs: 1, providerBody: { secret: true } },
    { name: "unexpected.error", routeCategory: "rest", errorCode: "https://provider.example/failure" },
  ])("rejects forbidden or unknown fields", (candidate) => {
    expect(() => parseOperationEvent(candidate)).toThrow();
  });

  it.each([
    { name: "request.completed", requestId: "req", routeCategory: "unknown", method: "GET", status: 200, latencyMs: 1 },
    { name: "request.completed", requestId: "req", routeCategory: "rest", method: "GET", status: 99, latencyMs: 1 },
    { name: "unexpected.error", routeCategory: "rest", errorCode: "UPPER CASE" },
    { name: "dependency.checked", dependency: "database", dependencyStatus: "ok", latencyMs: -1 },
  ])("rejects invalid allowlisted values", (candidate) => {
    expect(() => parseOperationEvent(candidate)).toThrow();
  });
});
