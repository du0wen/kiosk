import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "@/lib/runtime-config";
import { HttpOperationsSink, StdoutOperationsSink } from "./sinks";
import { createOperationsSink } from "./runtime";

const baseEnv = {
  NODE_ENV: "development",
  APP_ORIGIN: "http://localhost:58671",
  SERVE_ORIGIN: "http://serve.kiosk.test:58671",
  BETTER_AUTH_URL: "http://localhost:58671",
  NEXT_PUBLIC_APP_ORIGIN: "http://localhost:58671",
  BETTER_AUTH_SECRET: "local-secret",
  DATABASE_URL: "postgres://user:pass@db.example/kiosk",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  RENDER_SERVICE_URL: "http://localhost:8787",
  RENDER_SHARED_SECRET: "local-render-secret",
  CONTENT_STORAGE_MODE: "database",
  STORAGE_CREDENTIAL_KEY: "local-storage-secret",
  MCP_ALLOWED_HOSTS: "localhost:58671",
  MCP_ALLOWED_ORIGINS: "http://localhost:58671",
  RATE_LIMIT_KEY_SECRET: Buffer.alloc(32, 1).toString("base64"),
  OPERATIONS_HASH_SECRET: Buffer.alloc(32, 2).toString("base64"),
};

describe("createOperationsSink", () => {
  it("selects stdout from the typed runtime configuration", () => {
    const config = parseRuntimeConfig({ ...baseEnv, OPERATIONS_SINK: "stdout" });
    expect(createOperationsSink(config)).toBeInstanceOf(StdoutOperationsSink);
  });

  it("selects HTTP and keeps credentials inside SecretValue", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      OPERATIONS_SINK: "http",
      OPERATIONS_HTTP_ENDPOINT: "http://localhost:9090/events",
      OPERATIONS_HTTP_TOKEN: "local-http-token",
    });
    expect(createOperationsSink(config)).toBeInstanceOf(HttpOperationsSink);
  });
});
