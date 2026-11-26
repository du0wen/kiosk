import { isAbsolute } from "node:path";
import { isIP } from "node:net";
import { z } from "zod";
import { StorageError } from "./errors";

export const STORAGE_PROVIDERS = ["s3", "vercel_blob", "filesystem"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];
export type StorageProfileStatus = "unverified" | "healthy" | "unhealthy";

export type S3StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
};
export type VercelBlobStorageConfig = Record<string, never>;
export type FilesystemStorageConfig = { rootPath: string };
export type StorageProviderConfig =
  | S3StorageConfig
  | VercelBlobStorageConfig
  | FilesystemStorageConfig;

export type S3StorageCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};
export type VercelBlobStorageCredentials = { token: string };
export type FilesystemStorageCredentials = Record<string, never>;
export type StorageProviderCredentials =
  | S3StorageCredentials
  | VercelBlobStorageCredentials
  | FilesystemStorageCredentials;

export type StorageEnvironment = {
  nodeEnv?: string;
  allowedEndpointHosts?: string;
};

export class StorageConfigError extends StorageError {
  constructor(message: string) {
    super("invalid_configuration", message);
    this.name = "StorageConfigError";
  }
}

const nonEmpty = z.string().trim().min(1);
const s3ConfigSchema = z.strictObject({
  endpoint: z.string().trim().url().optional(),
  region: nonEmpty,
  bucket: nonEmpty.max(255).refine((value) => !/[\\/]/.test(value)),
  forcePathStyle: z.boolean().optional().default(false),
});
const vercelConfigSchema = z.strictObject({});
const filesystemConfigSchema = z.strictObject({ rootPath: nonEmpty });

const s3CredentialsSchema = z.strictObject({
  accessKeyId: nonEmpty,
  secretAccessKey: nonEmpty,
  sessionToken: nonEmpty.optional(),
});
const vercelCredentialsSchema = z.strictObject({ token: nonEmpty });
const filesystemCredentialsSchema = z.strictObject({});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageConfigError("Invalid storage configuration");
  return parsed.data;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return false;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isUnsafeProductionHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  const version = isIP(host);
  if (version === 4) return isPrivateIpv4(host);
  if (version === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8");
  }
  return false;
}

function normalizeEndpoint(endpoint: string, environment: StorageEnvironment): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new StorageConfigError("Invalid storage endpoint");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new StorageConfigError("Invalid storage endpoint");
  }
  if (environment.nodeEnv === "production") {
    if (url.protocol !== "https:" || isUnsafeProductionHostname(url.hostname)) {
      throw new StorageConfigError("Unsafe storage endpoint");
    }
    const allowed = (environment.allowedEndpointHosts ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(url.host.toLowerCase()) && !allowed.includes(url.hostname.toLowerCase())) {
      throw new StorageConfigError("Storage endpoint is not allowed");
    }
  } else if (!['http:', 'https:'].includes(url.protocol)) {
    throw new StorageConfigError("Invalid storage endpoint protocol");
  }
  return url.origin;
}

export function normalizeStorageConfig(
  provider: StorageProvider,
  value: unknown,
  environment: StorageEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    allowedEndpointHosts: process.env.STORAGE_ALLOWED_ENDPOINT_HOSTS,
  },
): StorageProviderConfig {
  if (!(STORAGE_PROVIDERS as readonly string[]).includes(provider)) {
    throw new StorageConfigError("Unknown storage provider");
  }
  if (provider === "s3") {
    const config = parse(s3ConfigSchema, value);
    return {
      ...(config.endpoint
        ? { endpoint: normalizeEndpoint(config.endpoint, environment) }
        : {}),
      region: config.region,
      bucket: config.bucket,
      forcePathStyle: config.forcePathStyle,
    };
  }
  if (provider === "vercel_blob") return parse(vercelConfigSchema, value);
  const config = parse(filesystemConfigSchema, value);
  if (!isAbsolute(config.rootPath)) {
    throw new StorageConfigError("Filesystem storage requires an absolute root path");
  }
  return config;
}

export function normalizeStorageCredentials(
  provider: StorageProvider,
  value: unknown,
): StorageProviderCredentials {
  if (!(STORAGE_PROVIDERS as readonly string[]).includes(provider)) {
    throw new StorageConfigError("Unknown storage provider");
  }
  if (provider === "s3") return parse(s3CredentialsSchema, value);
  if (provider === "vercel_blob") return parse(vercelCredentialsSchema, value);
  return parse(filesystemCredentialsSchema, value);
}
