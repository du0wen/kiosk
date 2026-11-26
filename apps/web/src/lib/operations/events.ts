import { z } from "zod";

const stableCode = z.enum([
  "internal",
  "unauthorized",
  "forbidden",
  "not_found",
  "bad_request",
  "rate_limited",
  "quota_exceeded",
  "protection_unavailable",
  "storage_unavailable",
  "render_saturated",
  "render_timeout",
  "database_unavailable",
  "render_unavailable",
  "operations_sink_unavailable",
  "migration_failed",
  "backup_failed",
  "backup_stale",
  "sink_smoke_failed",
]);
const requestId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const organizationHash = z.string().regex(/^[a-f0-9]{64}$/);
const latencyMs = z.number().int().min(0).max(300_000);
const routeCategory = z.enum([
  "rest",
  "mcp",
  "cli_auth",
  "auth",
  "report",
  "serving",
  "console",
  "operator",
]);
const method = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const requestContext = {
  requestId: requestId.optional(),
  routeCategory,
  organizationHash: organizationHash.optional(),
};

const inputSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("request.completed"),
    requestId,
    routeCategory,
    method,
    status: z.number().int().min(100).max(599),
    latencyMs,
    organizationHash: organizationHash.optional(),
    errorCode: stableCode.optional(),
  }).strict(),
  z.object({
    name: z.literal("dependency.checked"),
    dependency: z.enum(["database", "protection", "storage", "render", "operations"]),
    dependencyStatus: z.enum(["ok", "degraded", "unavailable"]),
    latencyMs,
    errorCode: stableCode.optional(),
  }).strict(),
  z.object({ name: z.literal("unexpected.error"), ...requestContext, errorCode: stableCode }).strict(),
  z.object({ name: z.literal("auth.rejected"), ...requestContext, errorCode: stableCode }).strict(),
  z.object({ name: z.literal("rate_limit.denied"), ...requestContext, errorCode: stableCode }).strict(),
  z.object({ name: z.literal("quota.denied"), ...requestContext, errorCode: stableCode }).strict(),
  z.object({ name: z.literal("render.saturated"), ...requestContext, errorCode: stableCode }).strict(),
  z.object({ name: z.literal("storage.unavailable"), ...requestContext, errorCode: stableCode }).strict(),
  z.object({ name: z.literal("migration.failed"), errorCode: stableCode }).strict(),
  z.object({ name: z.literal("backup.failed"), errorCode: stableCode }).strict(),
  z.object({ name: z.literal("sink.smoke"), requestId }).strict(),
  z.object({ name: z.literal("operations.sink_failed"), errorCode: stableCode }).strict(),
]);

export type OperationEventInput = z.infer<typeof inputSchema>;
export type OperationalErrorCode = z.infer<typeof stableCode>;
export type OperationSeverity = "info" | "warn" | "error";
export type OperationEvent = OperationEventInput & {
  schemaVersion: 1;
  timestamp: string;
  severity: OperationSeverity;
  releaseId: string;
};

type EventContext = {
  releaseId: string;
  now?: () => Date;
};

function severityFor(input: OperationEventInput): OperationSeverity {
  if (input.name === "request.completed") {
    if (input.status >= 500) return "error";
    if (input.status >= 400) return "warn";
    return "info";
  }
  if (input.name === "dependency.checked") {
    if (input.dependencyStatus === "unavailable") return "error";
    if (input.dependencyStatus === "degraded") return "warn";
    return "info";
  }
  if (input.name === "sink.smoke") return "info";
  if (["auth.rejected", "rate_limit.denied", "quota.denied"].includes(input.name)) {
    return "warn";
  }
  return "error";
}

export function parseOperationEvent(value: unknown): OperationEventInput {
  return inputSchema.parse(value);
}

export function parseOperationEnvelope(value: unknown): OperationEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid operation event envelope");
  }
  const {
    schemaVersion,
    timestamp,
    severity,
    releaseId,
    ...inputValue
  } = value as Record<string, unknown>;
  const envelope = z.object({
    schemaVersion: z.literal(1),
    timestamp: z.iso.datetime(),
    severity: z.enum(["info", "warn", "error"]),
    releaseId: z.string().regex(/^[A-Za-z0-9._-]{1,120}$/),
  }).parse({ schemaVersion, timestamp, severity, releaseId });
  const input = parseOperationEvent(inputValue);
  if (envelope.severity !== severityFor(input)) {
    throw new TypeError("Operation event severity does not match its catalog policy");
  }
  return { ...envelope, ...input } as OperationEvent;
}

export function classifyOperationalError(error: unknown): OperationalErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    const parsed = stableCode.safeParse((error as { code?: unknown }).code);
    if (parsed.success) return parsed.data;
  }
  return "internal";
}

export function parseRequestId(value: unknown): string {
  return requestId.parse(value);
}

export function createOperationEvent(
  value: unknown,
  context: EventContext,
): OperationEvent {
  const input = parseOperationEvent(value);
  const releaseId = z.string().regex(/^[A-Za-z0-9._-]{1,120}$/).parse(context.releaseId);
  return {
    schemaVersion: 1,
    timestamp: (context.now ?? (() => new Date()))().toISOString(),
    severity: severityFor(input),
    releaseId,
    ...input,
  };
}
