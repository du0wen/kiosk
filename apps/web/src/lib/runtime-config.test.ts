import { describe, expect, it } from "vitest";
import { RuntimeConfigError, parseRuntimeConfig } from "./runtime-config";

const KEY = Buffer.alloc(32, 7).toString("base64");

const productionEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.kiosk.example",
  SERVE_ORIGIN: "https://pages.kioskusercontent.net",
  BETTER_AUTH_URL: "https://app.kiosk.example",
  NEXT_PUBLIC_APP_ORIGIN: "https://app.kiosk.example",
  BETTER_AUTH_SECRET: KEY,
  DATABASE_URL: "postgres://user:pass@db.example/kiosk?sslmode=require",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  RENDER_SERVICE_URL: "https://render.kiosk.example",
  RENDER_SHARED_SECRET: KEY,
  CONTENT_STORAGE_MODE: "database",
  STORAGE_CREDENTIAL_KEY: KEY,
  STORAGE_ALLOWED_ENDPOINT_HOSTS: "s3.example:443",
  MCP_ALLOWED_HOSTS: "app.kiosk.example",
  MCP_ALLOWED_ORIGINS: "https://app.kiosk.example",
  RATE_LIMIT_REDIS_REST_URL: "https://redis.example",
  RATE_LIMIT_REDIS_REST_TOKEN: "redis-secret",
  RATE_LIMIT_KEY_SECRET: KEY,
  TRUSTED_CLIENT_IP_HEADERS: "x-vercel-forwarded-for",
  KIOSK_RELEASE_ID: "2026.09.17-abc1234",
  OPERATIONS_SINK: "http",
  OPERATIONS_HTTP_ENDPOINT: "https://events.kiosk.example/ingest",
  OPERATIONS_HTTP_TOKEN: "operations-token",
  OPERATIONS_HTTP_TIMEOUT_MS: "2000",
  OPERATIONS_HASH_SECRET: KEY,
};

describe("parseRuntimeConfig", () => {
  it("accepts a coherent production configuration and redacts secrets", () => {
    const config = parseRuntimeConfig(productionEnv);

    expect(config.appOrigin).toBe("https://app.kiosk.example");
    expect(config.serveOrigin).toBe("https://pages.kioskusercontent.net");
    expect(config.storageMode).toBe("database");
    expect(config.protection.redisRestUrl).toBe("https://redis.example");
    expect(config.protection.trustedClientIpHeaders).toEqual([
      "x-vercel-forwarded-for",
    ]);
    expect(config.secrets.betterAuth.reveal()).toBe(KEY);
    expect(config.secrets.rateLimitRedis?.toString()).toBe("[REDACTED]");
    expect(config.secrets.rateLimitKey.reveal()).toBe(KEY);
    expect(config.operations).toEqual({
      sink: "http",
      httpEndpoint: "https://events.kiosk.example/ingest",
      httpTimeoutMs: 2000,
    });
    expect(config.secrets.operationsHttp?.toString()).toBe("[REDACTED]");
    expect(config.secrets.operationsHash.reveal()).toBe(KEY);
    expect(JSON.stringify(config)).not.toContain(KEY);
    expect(JSON.stringify(config)).not.toContain("operations-token");
    expect(JSON.stringify(config)).toContain("[REDACTED]");
  });

  it("allows the documented local two-host development setup", () => {
    const config = parseRuntimeConfig({
      ...productionEnv,
      NODE_ENV: "development",
      APP_ORIGIN: "http://localhost:58671",
      SERVE_ORIGIN: "http://serve.kiosk.test:58671",
      BETTER_AUTH_URL: "http://localhost:58671",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:58671",
      RENDER_SERVICE_URL: "http://localhost:8787",
      RENDER_SHARED_SECRET: "legacy-local-render-secret",
      RATE_LIMIT_REDIS_REST_URL: "",
      RATE_LIMIT_REDIS_REST_TOKEN: "",
      RATE_LIMIT_KEY_SECRET: KEY,
      TRUSTED_CLIENT_IP_HEADERS: "x-real-ip,x-forwarded-for",
      MCP_ALLOWED_HOSTS: "localhost:58671",
      MCP_ALLOWED_ORIGINS: "http://localhost:58671",
      OPERATIONS_SINK: "stdout",
      OPERATIONS_HTTP_ENDPOINT: "",
      OPERATIONS_HTTP_TOKEN: "",
      OPERATIONS_HTTP_TIMEOUT_MS: "",
    });

    expect(config.nodeEnv).toBe("development");
    expect(config.operations).toEqual({
      sink: "stdout",
      httpEndpoint: null,
      httpTimeoutMs: 2000,
    });
  });

  it("defaults CONTENT_STORAGE_MODE to external and resolves STORAGE_LOCAL_DIR", () => {
    const config = parseRuntimeConfig({
      ...productionEnv,
      CONTENT_STORAGE_MODE: "",
      STORAGE_LOCAL_DIR: "/var/lib/kiosk/storage",
    });
    expect(config.storageMode).toBe("external");
    expect(config.storageLocalDir).toBe("/var/lib/kiosk/storage");
  });

  it.each([
    ["insecure app origin", { APP_ORIGIN: "http://app.kiosk.example" }],
    ["same registrable domain", { SERVE_ORIGIN: "https://serve.kiosk.example" }],
    ["auth origin drift", { BETTER_AUTH_URL: "https://auth.other.example" }],
    ["invalid auth secret", { BETTER_AUTH_SECRET: "not-base64" }],
    ["missing render URL", { RENDER_SERVICE_URL: "" }],
    ["unknown storage mode", { CONTENT_STORAGE_MODE: "sometimes" }],
    ["missing MCP hosts", { MCP_ALLOWED_HOSTS: "" }],
    ["missing protection store", { RATE_LIMIT_REDIS_REST_URL: "" }],
    ["insecure protection store", { RATE_LIMIT_REDIS_REST_URL: "http://redis.example" }],
    ["missing protection token", { RATE_LIMIT_REDIS_REST_TOKEN: "" }],
    ["invalid protection key", { RATE_LIMIT_KEY_SECRET: "not-base64" }],
    ["invalid trusted IP header", { TRUSTED_CLIENT_IP_HEADERS: "authorization" }],
    ["invalid protection override", { KIOSK_RATE_API_WRITE_LIMIT: "0" }],
    ["partial OAuth provider", { GOOGLE_CLIENT_SECRET: "", GITHUB_CLIENT_ID: "github" }],
    ["missing operations sink", { OPERATIONS_SINK: "" }],
    ["unknown operations sink", { OPERATIONS_SINK: "database" }],
    ["missing operations endpoint", { OPERATIONS_HTTP_ENDPOINT: "" }],
    ["insecure operations endpoint", { OPERATIONS_HTTP_ENDPOINT: "http://events.example/ingest" }],
    ["operations endpoint credentials", { OPERATIONS_HTTP_ENDPOINT: "https://user:pass@events.example/ingest" }],
    ["missing operations token", { OPERATIONS_HTTP_TOKEN: "" }],
    ["invalid operations timeout", { OPERATIONS_HTTP_TIMEOUT_MS: "0" }],
    ["excessive operations timeout", { OPERATIONS_HTTP_TIMEOUT_MS: "10001" }],
    ["invalid operations hash key", { OPERATIONS_HASH_SECRET: "not-base64" }],
    ["unused operations endpoint", { OPERATIONS_SINK: "stdout" }],
    ["unused operations token", { OPERATIONS_SINK: "stdout", OPERATIONS_HTTP_ENDPOINT: "" }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseRuntimeConfig({ ...productionEnv, ...patch })).toThrow(
      RuntimeConfigError,
    );
  });

  it("never includes secret values in validation errors", () => {
    const secret = "provider-secret-that-must-not-leak";
    let message = "";
    try {
      parseRuntimeConfig({
        ...productionEnv,
        GOOGLE_CLIENT_SECRET: secret,
        BETTER_AUTH_SECRET: secret,
        OPERATIONS_HTTP_TOKEN: secret,
        OPERATIONS_HASH_SECRET: secret,
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain(secret);
  });
});
