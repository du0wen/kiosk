import { getDomain } from "tldts";
import {
  loadProtectionPolicy,
  ProtectionPolicyError,
  type ProtectionPolicy,
} from "@/lib/protection/policy";
import { resolveLocalStorageDir } from "@/lib/storage/local-path";

export type ContentStorageMode = "database" | "dual" | "external";
export type OperationsSinkMode = "stdout" | "http";

export class RuntimeConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: string[]) {
    super(`Invalid runtime configuration: ${issues.join("; ")}`);
    this.name = "RuntimeConfigError";
    this.issues = issues;
  }
}

export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  toString(): string {
    return "[REDACTED]";
  }
}

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  appOrigin: string;
  serveOrigin: string;
  authOrigin: string;
  databaseUrl: string;
  renderServiceUrl: string;
  storageMode: ContentStorageMode;
  storageLocalDir: string;
  storageAllowedEndpointHosts: string[];
  mcpAllowedHosts: string[];
  mcpAllowedOrigins: string[];
  releaseId: string;
  operations: {
    sink: OperationsSinkMode;
    httpEndpoint: string | null;
    httpTimeoutMs: number;
  };
  protection: {
    redisRestUrl: string | null;
    trustedClientIpHeaders: string[];
    policy: ProtectionPolicy;
  };
  oauthProviders: Array<"github" | "google">;
  secrets: {
    betterAuth: SecretValue;
    renderShared: SecretValue;
    storageCredential: SecretValue;
    rateLimitKey: SecretValue;
    operationsHash: SecretValue;
    rateLimitRedis?: SecretValue;
    operationsHttp?: SecretValue;
    github?: SecretValue;
    google?: SecretValue;
  };
};

type Env = Record<string, string | undefined>;

function value(env: Env, name: string, issues: string[]): string {
  const result = env[name]?.trim();
  if (!result) issues.push(`${name} is required`);
  return result ?? "";
}

function origin(env: Env, name: string, issues: string[]): string {
  const raw = value(env, name, issues);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      issues.push(`${name} must be an origin without credentials, path, query, or hash`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push(`${name} must use HTTP or HTTPS`);
    }
    return url.origin;
  } catch {
    issues.push(`${name} must be a valid URL origin`);
    return "";
  }
}

function optionalOrigin(
  env: Env,
  name: string,
  issues: string[],
  required: boolean,
): string | null {
  const raw = env[name]?.trim() ?? "";
  if (!raw) {
    if (required) issues.push(`${name} is required`);
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.origin !== raw || !["http:", "https:"].includes(url.protocol)) {
      issues.push(`${name} must be an HTTP or HTTPS origin`);
    }
    return url.origin;
  } catch {
    issues.push(`${name} must be a valid URL origin`);
    return null;
  }
}

function operationsEndpoint(
  env: Env,
  issues: string[],
  required: boolean,
  production: boolean,
): string | null {
  const raw = env.OPERATIONS_HTTP_ENDPOINT?.trim() ?? "";
  if (!raw) {
    if (required) issues.push("OPERATIONS_HTTP_ENDPOINT is required for the HTTP operations sink");
    return null;
  }
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      issues.push("OPERATIONS_HTTP_ENDPOINT must be an HTTP or HTTPS URL without credentials, query, or hash");
    }
    if (production && url.protocol !== "https:") {
      issues.push("OPERATIONS_HTTP_ENDPOINT must use HTTPS in production");
    }
    return url.toString();
  } catch {
    issues.push("OPERATIONS_HTTP_ENDPOINT must be a valid URL");
    return null;
  }
}

function boundedInteger(
  env: Env,
  name: string,
  fallback: number,
  min: number,
  max: number,
  issues: string[],
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    issues.push(`${name} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${name} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return parsed;
}

function secretValue(
  env: Env,
  name: string,
  issues: string[],
  requireBase64Key: boolean,
): SecretValue {
  const raw = value(env, name, issues);
  if (raw && requireBase64Key) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length !== 32 || decoded.toString("base64") !== raw) {
      issues.push(`${name} must be a base64-encoded 32-byte secret`);
    }
  }
  return new SecretValue(raw);
}

function commaList(env: Env, name: string, issues: string[], required: boolean): string[] {
  const raw = env[name]?.trim() ?? "";
  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (required && values.length === 0) issues.push(`${name} must not be empty`);
  return values;
}

function validateHostList(values: string[], name: string, issues: string[]): void {
  for (const host of values) {
    try {
      const parsed = new URL(`https://${host}`);
      if (
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error("invalid host");
      }
    } catch {
      issues.push(`${name} contains an invalid host`);
      return;
    }
  }
}

function validateOriginList(values: string[], name: string, issues: string[]): void {
  for (const item of values) {
    try {
      const parsed = new URL(item);
      if (parsed.origin !== item || !["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("invalid origin");
      }
    } catch {
      issues.push(`${name} contains an invalid origin`);
      return;
    }
  }
}

function oauthProvider(
  env: Env,
  provider: "github" | "google",
  issues: string[],
): { configured: boolean; secret?: SecretValue } {
  const prefix = provider.toUpperCase();
  const id = env[`${prefix}_CLIENT_ID`]?.trim() ?? "";
  const secret = env[`${prefix}_CLIENT_SECRET`]?.trim() ?? "";
  if ((id && !secret) || (!id && secret)) {
    issues.push(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be configured together`);
  }
  return { configured: Boolean(id && secret), ...(secret ? { secret: new SecretValue(secret) } : {}) };
}

export function parseRuntimeConfig(env: Env): RuntimeConfig {
  const issues: string[] = [];
  const rawNodeEnv = env.NODE_ENV ?? "development";
  const nodeEnv = ["development", "test", "production"].includes(rawNodeEnv)
    ? (rawNodeEnv as RuntimeConfig["nodeEnv"])
    : "development";
  if (nodeEnv !== rawNodeEnv) issues.push("NODE_ENV must be development, test, or production");

  const appOrigin = origin(env, "APP_ORIGIN", issues);
  const serveOrigin = origin(env, "SERVE_ORIGIN", issues);
  const authOrigin = origin(env, "BETTER_AUTH_URL", issues);
  const publicAppOrigin = origin(env, "NEXT_PUBLIC_APP_ORIGIN", issues);
  const renderServiceUrl = origin(env, "RENDER_SERVICE_URL", issues);
  const redisRestUrl = optionalOrigin(
    env,
    "RATE_LIMIT_REDIS_REST_URL",
    issues,
    nodeEnv === "production",
  );

  if (authOrigin && appOrigin && authOrigin !== appOrigin) {
    issues.push("BETTER_AUTH_URL must equal APP_ORIGIN");
  }
  if (publicAppOrigin && appOrigin && publicAppOrigin !== appOrigin) {
    issues.push("NEXT_PUBLIC_APP_ORIGIN must equal APP_ORIGIN");
  }
  if (appOrigin && serveOrigin && appOrigin === serveOrigin) {
    issues.push("APP_ORIGIN and SERVE_ORIGIN must be different origins");
  }

  if (nodeEnv === "production") {
    for (const [name, raw] of [
      ["APP_ORIGIN", appOrigin],
      ["SERVE_ORIGIN", serveOrigin],
      ["BETTER_AUTH_URL", authOrigin],
      ["NEXT_PUBLIC_APP_ORIGIN", publicAppOrigin],
      ["RENDER_SERVICE_URL", renderServiceUrl],
      ["RATE_LIMIT_REDIS_REST_URL", redisRestUrl],
    ] as const) {
      if (raw && new URL(raw).protocol !== "https:") issues.push(`${name} must use HTTPS in production`);
    }
    if (appOrigin && serveOrigin) {
      const appDomain = getDomain(new URL(appOrigin).hostname, { allowPrivateDomains: true });
      const serveDomain = getDomain(new URL(serveOrigin).hostname, { allowPrivateDomains: true });
      if (!appDomain || !serveDomain || appDomain === serveDomain) {
        issues.push("APP_ORIGIN and SERVE_ORIGIN must use separate registrable domains");
      }
    }
  }

  const databaseUrl = value(env, "DATABASE_URL", issues);
  if (databaseUrl) {
    try {
      const protocol = new URL(databaseUrl).protocol;
      if (protocol !== "postgres:" && protocol !== "postgresql:") throw new Error("invalid protocol");
    } catch {
      issues.push("DATABASE_URL must be a PostgreSQL URL");
    }
  }

  const storageModeRaw = env.CONTENT_STORAGE_MODE?.trim() || "external";
  const storageMode = (["database", "dual", "external"] as const).includes(
    storageModeRaw as ContentStorageMode,
  )
    ? (storageModeRaw as ContentStorageMode)
    : "external";
  if (storageMode !== storageModeRaw) {
    issues.push("CONTENT_STORAGE_MODE must be database, dual, or external");
  }
  const storageLocalDir = resolveLocalStorageDir(env);

  const storageAllowedEndpointHosts = commaList(
    env,
    "STORAGE_ALLOWED_ENDPOINT_HOSTS",
    issues,
    false,
  );
  validateHostList(storageAllowedEndpointHosts, "STORAGE_ALLOWED_ENDPOINT_HOSTS", issues);
  const mcpAllowedHosts = commaList(env, "MCP_ALLOWED_HOSTS", issues, nodeEnv === "production");
  const mcpAllowedOrigins = commaList(env, "MCP_ALLOWED_ORIGINS", issues, nodeEnv === "production");
  validateHostList(mcpAllowedHosts, "MCP_ALLOWED_HOSTS", issues);
  validateOriginList(mcpAllowedOrigins, "MCP_ALLOWED_ORIGINS", issues);

  const allowedIpHeaders = new Set([
    "x-vercel-forwarded-for",
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
  ]);
  const trustedClientIpHeaders = commaList(
    env,
    "TRUSTED_CLIENT_IP_HEADERS",
    issues,
    nodeEnv === "production",
  );
  const effectiveIpHeaders = trustedClientIpHeaders.length > 0
    ? trustedClientIpHeaders.map((header) => header.toLowerCase())
    : ["x-real-ip", "x-forwarded-for"];
  if (effectiveIpHeaders.some((header) => !allowedIpHeaders.has(header))) {
    issues.push("TRUSTED_CLIENT_IP_HEADERS contains an unsupported header");
  }

  const github = oauthProvider(env, "github", issues);
  const google = oauthProvider(env, "google", issues);
  const oauthProviders: RuntimeConfig["oauthProviders"] = [];
  if (github.configured) oauthProviders.push("github");
  if (google.configured) oauthProviders.push("google");
  if (oauthProviders.length === 0) issues.push("At least one OAuth provider must be configured");

  const releaseId = env.KIOSK_RELEASE_ID?.trim() || (nodeEnv === "production" ? "" : "development");
  if (!releaseId) issues.push("KIOSK_RELEASE_ID is required in production");

  const operationsSinkRaw = env.OPERATIONS_SINK?.trim() ||
    (nodeEnv === "production" ? "" : "stdout");
  const operationsSink: OperationsSinkMode = operationsSinkRaw === "http" ? "http" : "stdout";
  if (operationsSinkRaw !== "stdout" && operationsSinkRaw !== "http") {
    issues.push("OPERATIONS_SINK must be stdout or http");
  }
  const operationsHttpEndpoint = operationsEndpoint(
    env,
    issues,
    operationsSinkRaw === "http",
    nodeEnv === "production",
  );
  const operationsHttpTimeoutMs = boundedInteger(
    env,
    "OPERATIONS_HTTP_TIMEOUT_MS",
    2000,
    100,
    10000,
    issues,
  );
  const operationsHttpToken = env.OPERATIONS_HTTP_TOKEN?.trim() ?? "";
  if (operationsSinkRaw === "stdout" && operationsHttpEndpoint) {
    issues.push("OPERATIONS_HTTP_ENDPOINT must be empty when OPERATIONS_SINK is stdout");
  }
  if (operationsSinkRaw === "stdout" && operationsHttpToken) {
    issues.push("OPERATIONS_HTTP_TOKEN must be empty when OPERATIONS_SINK is stdout");
  }
  if (nodeEnv === "production" && operationsSinkRaw === "http" && !operationsHttpToken) {
    issues.push("OPERATIONS_HTTP_TOKEN is required for the HTTP operations sink in production");
  }

  let protectionPolicy: ProtectionPolicy | undefined;
  try {
    protectionPolicy = loadProtectionPolicy(env);
  } catch (error) {
    if (error instanceof ProtectionPolicyError) issues.push(error.message);
    else throw error;
  }

  const redisToken = env.RATE_LIMIT_REDIS_REST_TOKEN?.trim() ?? "";
  if (nodeEnv === "production" && !redisToken) {
    issues.push("RATE_LIMIT_REDIS_REST_TOKEN is required");
  }
  const developmentRateLimitKey = Buffer.alloc(32, 1).toString("base64");
  const developmentOperationsHashKey = Buffer.alloc(32, 2).toString("base64");
  const rateLimitKeyEnv = {
    ...env,
    RATE_LIMIT_KEY_SECRET:
      env.RATE_LIMIT_KEY_SECRET?.trim() ||
      (nodeEnv === "production" ? "" : developmentRateLimitKey),
  };
  const operationsHashEnv = {
    ...env,
    OPERATIONS_HASH_SECRET:
      env.OPERATIONS_HASH_SECRET?.trim() ||
      (nodeEnv === "production" ? "" : developmentOperationsHashKey),
  };

  const secrets = {
    betterAuth: secretValue(env, "BETTER_AUTH_SECRET", issues, nodeEnv === "production"),
    renderShared: secretValue(env, "RENDER_SHARED_SECRET", issues, nodeEnv === "production"),
    storageCredential: secretValue(
      env,
      "STORAGE_CREDENTIAL_KEY",
      issues,
      nodeEnv === "production",
    ),
    rateLimitKey: secretValue(
      rateLimitKeyEnv,
      "RATE_LIMIT_KEY_SECRET",
      issues,
      true,
    ),
    operationsHash: secretValue(
      operationsHashEnv,
      "OPERATIONS_HASH_SECRET",
      issues,
      true,
    ),
    ...(redisToken ? { rateLimitRedis: new SecretValue(redisToken) } : {}),
    ...(operationsHttpToken ? { operationsHttp: new SecretValue(operationsHttpToken) } : {}),
    ...(github.secret ? { github: github.secret } : {}),
    ...(google.secret ? { google: google.secret } : {}),
  };

  if (issues.length > 0) throw new RuntimeConfigError([...new Set(issues)]);
  if (!protectionPolicy) throw new RuntimeConfigError(["Protection policy is required"]);

  return {
    nodeEnv,
    appOrigin,
    serveOrigin,
    authOrigin,
    databaseUrl,
    renderServiceUrl,
    storageMode,
    storageLocalDir,
    storageAllowedEndpointHosts,
    mcpAllowedHosts,
    mcpAllowedOrigins,
    releaseId,
    operations: {
      sink: operationsSink,
      httpEndpoint: operationsSink === "http" ? operationsHttpEndpoint : null,
      httpTimeoutMs: operationsHttpTimeoutMs,
    },
    protection: {
      redisRestUrl,
      trustedClientIpHeaders: effectiveIpHeaders,
      policy: protectionPolicy,
    },
    oauthProviders,
    secrets,
  };
}
