import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySetupConfigToEnv,
  assertStoragePathIsolatedFromConfig,
  isPublicSignupAllowed,
  isSetupCompleted,
  readSetupConfig,
  resolveSetupConfigPath,
  setPublicSignupAllowed,
  writeSetupConfig,
  type KioskSetupConfig,
} from "./config-file";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempConfigPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kiosk-setup-cfg-"));
  tempDirs.push(dir);
  return join(dir, "kiosk.config.json");
}

const sampleConfig: KioskSetupConfig = {
  version: 1,
  setupCompleted: true,
  completedAt: "2026-11-23T06:00:00.000Z",
  auth: {
    allowPublicSignup: false,
  },
  origins: {
    appOrigin: "https://app.kiosk.example",
    serveOrigin: "https://pages.kioskusercontent.net",
  },
  database: {
    url: "postgresql://kiosk:pass@localhost:5432/kiosk",
  },
  storage: {
    mode: "external",
    localDir: "/var/lib/kiosk/storage",
  },
  adminEmails: ["admin@kiosk.example"],
  secrets: {
    betterAuth: "a".repeat(44),
    storageCredential: "b".repeat(44),
    rateLimitKey: "c".repeat(44),
    operationsHash: "d".repeat(44),
    renderShared: "e".repeat(44),
  },
  oauth: {
    github: null,
    google: null,
  },
};

describe("setup config-file", () => {
  it("resolves default config path under ~/.config/kiosk/kiosk.config.json", () => {
    expect(resolveSetupConfigPath({}, "/app", "/Users/alice")).toBe(
      "/Users/alice/.config/kiosk/kiosk.config.json",
    );
    expect(
      resolveSetupConfigPath({ KIOSK_CONFIG_FILE: "/etc/kiosk/kiosk.config.json" }, "/app"),
    ).toBe("/etc/kiosk/kiosk.config.json");
  });

  it("rejects local storage directories that overlap the config directory", () => {
    const configPath = "/etc/kiosk/kiosk.config.json";
    expect(() =>
      assertStoragePathIsolatedFromConfig("/var/lib/kiosk/storage", configPath),
    ).not.toThrow();
    expect(() => assertStoragePathIsolatedFromConfig("/etc/kiosk", configPath)).toThrow(
      /cannot overlap/,
    );
    expect(() =>
      assertStoragePathIsolatedFromConfig("/etc/kiosk/storage", configPath),
    ).toThrow(/cannot overlap/);
    expect(() => assertStoragePathIsolatedFromConfig("/etc", configPath)).toThrow(
      /cannot overlap/,
    );
  });

  it("writes config atomically with 0600 permissions and reads it back", async () => {
    const filePath = await makeTempConfigPath();
    await writeSetupConfig(sampleConfig, filePath);

    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);

    const loaded = await readSetupConfig(filePath);
    expect(loaded).toEqual(sampleConfig);
  });

  it("returns null when config file does not exist", async () => {
    const filePath = await makeTempConfigPath();
    expect(await readSetupConfig(filePath)).toBeNull();
  });

  it("applies config to env without overwriting explicit env vars", () => {
    const env: Record<string, string | undefined> = {
      APP_ORIGIN: "https://override.example",
    };
    applySetupConfigToEnv(sampleConfig, env);

    expect(env.APP_ORIGIN).toBe("https://override.example");
    expect(env.SERVE_ORIGIN).toBe("https://pages.kioskusercontent.net");
    expect(env.BETTER_AUTH_URL).toBe("https://override.example");
    expect(env.DATABASE_URL).toBe("postgresql://kiosk:pass@localhost:5432/kiosk");
    expect(env.CONTENT_STORAGE_MODE).toBe("external");
    expect(env.STORAGE_LOCAL_DIR).toBe("/var/lib/kiosk/storage");
    expect(env.KIOSK_ADMIN_EMAILS).toBe("admin@kiosk.example");
    expect(env.BETTER_AUTH_SECRET).toBe("a".repeat(44));
    expect(env.KIOSK_ALLOW_PUBLIC_SIGNUP).toBe("false");
    expect(env.KIOSK_SETUP_COMPLETED).toBe("true");
  });

  it("detects setup completion from either env or config", () => {
    expect(isSetupCompleted({})).toBe(false);
    expect(isSetupCompleted({ DATABASE_URL: "postgres://x" })).toBe(false);
    expect(
      isSetupCompleted({ DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "secret" }),
    ).toBe(true);
    expect(isSetupCompleted({ KIOSK_SETUP_COMPLETED: "true" })).toBe(true);
  });

  it("defaults public signup to false (invite-only) and persists admin toggle", async () => {
    const filePath = await makeTempConfigPath();
    await writeSetupConfig(sampleConfig, filePath);
    const env: Record<string, string | undefined> = {};

    expect(isPublicSignupAllowed(env)).toBe(false);
    await setPublicSignupAllowed(true, { filePath, env });
    expect(isPublicSignupAllowed(env)).toBe(true);

    const reloaded = await readSetupConfig(filePath);
    expect(reloaded?.auth.allowPublicSignup).toBe(true);
  });
});
