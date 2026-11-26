import { describe, expect, it } from "vitest";
import {
  normalizeStorageConfig,
  normalizeStorageCredentials,
  StorageConfigError,
} from "./contracts";

describe("normalizeStorageConfig", () => {
  it("rejects an unknown provider at runtime", () => {
    expect(() =>
      normalizeStorageConfig("unknown" as never, {}, { nodeEnv: "test" }),
    ).toThrow(StorageConfigError);
    expect(() => normalizeStorageCredentials("unknown" as never, {})).toThrow(
      StorageConfigError,
    );
  });

  it("normalizes one S3-compatible contract for R2, S3, and MinIO", () => {
    expect(
      normalizeStorageConfig(
        "s3",
        {
          endpoint: "https://account.r2.cloudflarestorage.com/",
          region: " auto ",
          bucket: " kiosk-pages ",
          forcePathStyle: true,
        },
        {
          nodeEnv: "production",
          allowedEndpointHosts: "account.r2.cloudflarestorage.com",
        },
      ),
    ).toEqual({
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "kiosk-pages",
      forcePathStyle: true,
    });

    expect(
      normalizeStorageConfig(
        "s3",
        { region: "us-east-1", bucket: "kiosk-pages" },
        { nodeEnv: "production", allowedEndpointHosts: "" },
      ),
    ).toEqual({
      region: "us-east-1",
      bucket: "kiosk-pages",
      forcePathStyle: false,
    });
  });

  it("rejects unsafe or unapproved production endpoints", () => {
    const production = {
      nodeEnv: "production",
      allowedEndpointHosts: "objects.example.com",
    } as const;

    for (const endpoint of [
      "http://objects.example.com",
      "https://localhost:9000",
      "https://127.0.0.1:9000",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.1",
      "https://unapproved.example.com",
    ]) {
      expect(() =>
        normalizeStorageConfig(
          "s3",
          { endpoint, region: "auto", bucket: "pages" },
          production,
        ),
      ).toThrow(StorageConfigError);
    }
  });

  it("allows an explicit local MinIO endpoint only outside production", () => {
    expect(
      normalizeStorageConfig(
        "s3",
        {
          endpoint: "http://127.0.0.1:9000",
          region: "us-east-1",
          bucket: "pages",
          forcePathStyle: true,
        },
        { nodeEnv: "development", allowedEndpointHosts: "" },
      ),
    ).toMatchObject({ endpoint: "http://127.0.0.1:9000" });
  });

  it("keeps Vercel Blob config empty and requires an absolute rootPath for filesystem", () => {
    expect(
      normalizeStorageConfig("vercel_blob", {}, { nodeEnv: "production" }),
    ).toEqual({});
    expect(
      normalizeStorageConfig(
        "filesystem",
        { rootPath: "/var/lib/kiosk/storage" },
        { nodeEnv: "production" },
      ),
    ).toEqual({ rootPath: "/var/lib/kiosk/storage" });
    expect(() =>
      normalizeStorageConfig(
        "filesystem",
        { rootPath: "relative/kiosk-content" },
        { nodeEnv: "production" },
      ),
    ).toThrow(StorageConfigError);
  });
});

describe("normalizeStorageCredentials", () => {
  it("accepts provider-specific secrets and rejects unknown fields", () => {
    expect(
      normalizeStorageCredentials("s3", {
        accessKeyId: "key",
        secretAccessKey: "secret",
      }),
    ).toEqual({ accessKeyId: "key", secretAccessKey: "secret" });
    expect(normalizeStorageCredentials("vercel_blob", { token: "blob-token" })).toEqual({
      token: "blob-token",
    });
    expect(normalizeStorageCredentials("filesystem", {})).toEqual({});
    expect(() =>
      normalizeStorageCredentials("vercel_blob", {
        token: "blob-token",
        unexpected: "value",
      }),
    ).toThrow(StorageConfigError);
  });
});
